import { describe, expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import { ImageProcessor } from "../application/ImageProcessor.ts";
import { ImageStorage } from "../application/ImageStorage.ts";
import { uploadImage } from "../application/UploadImage.ts";
import {
  ImageProcessingError,
  InvalidImage,
  InvalidKeys,
  InvalidOptions,
  InvalidSpecs,
  StorageError
} from "../domain/errors.ts";
import {
  DEFAULT_VARIANTS,
  VARIANTS,
  MAX_UPLOAD_BYTES,
  MAX_VARIANT_SIZE,
  type VariantSpec
} from "../domain/ImageVariant.ts";
import { MAX_KEY_BYTES, prefixed } from "../domain/ObjectKey.ts";

const SOURCE = { width: 4000, height: 3000 };

const fakeProcessor = Layer.succeed(
  ImageProcessor,
  ImageProcessor.of({
    inspect: ({ bytes }) =>
      bytes[0] === 0xff
        ? Effect.succeed({ ...SOURCE, format: "jpeg" as const })
        : Effect.fail(new InvalidImage({ reason: "not an image" })),
    render: ({ spec }) => {
      const scale = Math.min(1, (spec.maxSize ?? Infinity) / SOURCE.width);
      return Effect.succeed({
        bytes: new Uint8Array([1]),
        width: Math.round(SOURCE.width * scale),
        height: Math.round(SOURCE.height * scale)
      });
    }
  })
);

const NO_RETRY = { times: 0, baseDelay: "0 millis" } as const;
const FAST_RETRY = { times: 2, baseDelay: "0 millis" } as const;

type FailWhen = (input: { readonly attempt: number; readonly key: string }) => boolean;

const memoryStorage = ({
  failWhen = () => false,
  existing = {}
}: {
  readonly failWhen?: FailWhen;
  /** Objects already in the bucket before the upload, as key -> content type. */
  readonly existing?: Readonly<Record<string, string>>;
} = {}) => {
  const objects = new Map<string, string>(Object.entries(existing));
  const attempts = new Map<string, number>();
  let puts = 0;
  let deletes = 0;
  const layer = Layer.succeed(
    ImageStorage,
    ImageStorage.of({
      // Lazy on purpose: a retry re-runs the same Effect, so the attempt must be counted when it runs.
      put: ({ key, contentType }) =>
        Effect.suspend(() => {
          puts += 1;
          attempts.set(key, (attempts.get(key) ?? 0) + 1);
          if (failWhen({ attempt: puts, key }))
            return Effect.fail(new StorageError({ key, cause: "boom" }));
          objects.set(key, contentType);
          return Effect.void;
        }),
      deleteMany: ({ keys }) =>
        Effect.sync(() => {
          deletes += 1;
          keys.forEach((k) => objects.delete(k));
        }),
      publicUrl: ({ key }) => `https://cdn.test/${key}`
    })
  );
  return { objects, attempts, deletes: () => deletes, layer };
};

const jpeg = new Uint8Array([0xff, 0xd8, 0xff]);
const KEY = prefixed({ prefix: "images/test" });

const provide = ({ storage }: { readonly storage: Layer.Layer<ImageStorage> }) =>
  Layer.merge(fakeProcessor, storage);

const run = <A, E>({
  effect,
  storage
}: {
  readonly effect: Effect.Effect<A, E, ImageProcessor | ImageStorage>;
  readonly storage: Layer.Layer<ImageStorage>;
}) => Effect.runPromise(Effect.flip(effect).pipe(Effect.provide(provide({ storage }))));

describe("uploadImage", () => {
  test("stores the five default variants with webp content type, the given keys and public urls", async () => {
    const { objects, layer } = memoryStorage();
    const result = await Effect.runPromise(
      uploadImage({ key: KEY, bytes: jpeg }).pipe(Effect.provide(provide({ storage: layer })))
    );

    expect(Object.keys(result.variants).sort()).toEqual([
      "lg",
      "md",
      "original",
      "sm",
      "thumbnail"
    ]);
    expect(result.variants.sm.key).toBe(`images/test/sm.webp`);
    expect(result.variants.sm.url).toBe(`https://cdn.test/images/test/sm.webp`);
    expect(result.variants.sm.width).toBe(480);
    expect(result.variants.original.key).toBe(`images/test/original.jpg`);
    expect(result.variants.original.contentType).toBe("image/jpeg");
    expect(objects.size).toBe(5);
    expect(objects.get(result.variants.md.key)).toBe("image/webp");
  });

  test("rejects non-images before touching storage", async () => {
    const { objects, layer } = memoryStorage();
    const error = await run({
      effect: uploadImage({ key: KEY, bytes: new Uint8Array([0, 1, 2]) }),
      storage: layer
    });
    expect(error).toBeInstanceOf(InvalidImage);
    expect(objects.size).toBe(0);
  });

  test("rejects uploads over the size limit", async () => {
    const { objects, layer } = memoryStorage();
    const error = await run({
      effect: uploadImage({ key: KEY, bytes: new Uint8Array(MAX_UPLOAD_BYTES + 1) }),
      storage: layer
    });
    expect(error).toBeInstanceOf(InvalidImage);
    expect(objects.size).toBe(0);
  });

  test("a storage failure leaves what was written and never deletes anything", async () => {
    const { objects, deletes, layer } = memoryStorage({
      failWhen: ({ key }) => key.endsWith("/md.webp")
    });
    const error = await run({
      effect: uploadImage({ key: KEY, bytes: jpeg, retry: NO_RETRY }),
      storage: layer
    });
    expect(error).toBeInstanceOf(StorageError);
    expect(deletes()).toBe(0);
    expect(objects.has("images/test/sm.webp")).toBe(true);
    expect(objects.has("images/test/md.webp")).toBe(false);
  });

  test("a failing processor surfaces ImageProcessingError before anything is written", async () => {
    const { objects, attempts, layer } = memoryStorage();
    const failing = Layer.succeed(
      ImageProcessor,
      ImageProcessor.of({
        inspect: () => Effect.succeed({ ...SOURCE, format: "jpeg" as const }),
        render: ({ spec }) =>
          Effect.fail(new ImageProcessingError({ variant: spec.name, cause: "decode" }))
      })
    );
    const error = await Effect.runPromise(
      Effect.flip(uploadImage({ key: KEY, bytes: jpeg })).pipe(
        Effect.provide(Layer.merge(failing, layer))
      )
    );
    expect(error).toBeInstanceOf(ImageProcessingError);
    expect(attempts.size).toBe(0);
    expect(objects.size).toBe(0);
  });
});

describe("retries", () => {
  test("transient storage failures are retried and every variant is still stored", async () => {
    const { objects, layer } = memoryStorage({ failWhen: ({ attempt }) => attempt <= 2 });
    const result = await Effect.runPromise(
      uploadImage({ key: KEY, bytes: jpeg, retry: FAST_RETRY }).pipe(
        Effect.provide(provide({ storage: layer }))
      )
    );
    expect(Object.keys(result.variants)).toHaveLength(5);
    expect(objects.size).toBe(5);
  });

  test("gives up after the configured retries", async () => {
    const { attempts, layer } = memoryStorage({
      failWhen: ({ key }) => key.endsWith("/md.webp")
    });
    const error = await run({
      effect: uploadImage({ key: KEY, bytes: jpeg, retry: FAST_RETRY }),
      storage: layer
    });
    expect(error).toBeInstanceOf(StorageError);
    expect([...attempts].find(([key]) => key.endsWith("/md.webp"))?.[1]).toBe(3);
  });

  test("times: 0 disables retries", async () => {
    const { attempts, layer } = memoryStorage({ failWhen: ({ key }) => key.endsWith("/md.webp") });
    await run({ effect: uploadImage({ key: KEY, bytes: jpeg, retry: NO_RETRY }), storage: layer });
    expect([...attempts].find(([key]) => key.endsWith("/md.webp"))?.[1]).toBe(1);
  });
});

describe("custom specs", () => {
  test("replace the defaults: only the requested variants are produced, with typed names", async () => {
    const { objects, layer } = memoryStorage();
    const result = await Effect.runPromise(
      uploadImage({
        key: KEY,
        bytes: jpeg,
        specs: [{ name: "avatar", maxSize: 64 }, { name: "full" }, { name: "original" }]
      }).pipe(Effect.provide(provide({ storage: layer })))
    );

    expect(Object.keys(result.variants).sort()).toEqual(["avatar", "full", "original"]);
    expect(result.variants.avatar.key).toBe(`images/test/avatar.webp`);
    expect(result.variants.avatar.width).toBe(64);
    expect(result.variants.full.key).toBe(`images/test/full.webp`);
    expect(result.variants.full.width).toBe(4000);
    expect(result.variants.original.key).toBe(`images/test/original.jpg`);
    expect(result.variants.original.contentType).toBe("image/jpeg");
    expect(objects.size).toBe(3);
  });

  test("can extend the platform defaults", async () => {
    const { layer } = memoryStorage();
    const result = await Effect.runPromise(
      uploadImage({
        key: KEY,
        bytes: jpeg,
        specs: [...DEFAULT_VARIANTS, { name: "hero", maxSize: 2560 }]
      }).pipe(Effect.provide(provide({ storage: layer })))
    );
    expect(Object.keys(result.variants)).toHaveLength(6);
    expect(result.variants.hero.width).toBe(2560);
  });

  const invalid: ReadonlyArray<[string, ReadonlyArray<VariantSpec>]> = [
    ["an empty list", []],
    [
      "duplicate names",
      [
        { name: "a", maxSize: 10 },
        { name: "a", maxSize: 20 }
      ]
    ],
    ["names unsafe for object keys", [{ name: "Bad/Name", maxSize: 10 }]],
    ["a zero size", [{ name: "a", maxSize: 0 }]],
    ["a fractional size", [{ name: "a", maxSize: 10.5 }]],
    ["a size above the limit", [{ name: "a", maxSize: MAX_VARIANT_SIZE + 1 }]]
  ];

  for (const [label, specs] of invalid) {
    test(`rejects ${label} before touching storage`, async () => {
      const { attempts, layer } = memoryStorage();
      const error = await run({
        effect: uploadImage({ key: KEY, bytes: jpeg, specs }),
        storage: layer
      });
      expect(error).toBeInstanceOf(InvalidSpecs);
      expect(attempts.size).toBe(0);
    });
  }
});

describe("VARIANTS catalog", () => {
  test("every entry is keyed by its own name and the defaults are built from it", () => {
    for (const [key, spec] of Object.entries(VARIANTS)) expect<string>(spec.name).toBe(key);
    expect(DEFAULT_VARIANTS.map((spec) => spec.name)).toEqual([
      "thumbnail",
      "sm",
      "md",
      "lg",
      "original"
    ]);
    for (const spec of DEFAULT_VARIANTS) expect(spec).toBe(VARIANTS[spec.name]);
  });

  test("pick platform specs by name: only those are produced, typed by name", async () => {
    const { objects, layer } = memoryStorage();
    const result = await Effect.runPromise(
      uploadImage({ key: KEY, bytes: jpeg, specs: [VARIANTS.md, VARIANTS.sm] }).pipe(
        Effect.provide(provide({ storage: layer }))
      )
    );
    expect(Object.keys(result.variants).sort()).toEqual(["md", "sm"]);
    expect(result.variants.md.width).toBe(960);
    expect(result.variants.sm.width).toBe(480);
    expect(objects.size).toBe(2);
  });

  test("mix platform specs with your own", async () => {
    const { layer } = memoryStorage();
    const result = await Effect.runPromise(
      uploadImage({
        key: KEY,
        bytes: jpeg,
        specs: [VARIANTS.lg, { name: "avatar", maxSize: 64 }]
      }).pipe(Effect.provide(provide({ storage: layer })))
    );
    expect(result.variants.lg.width).toBe(1920);
    expect(result.variants.avatar.width).toBe(64);
  });

  test("picking the same platform spec twice is rejected as a duplicate", async () => {
    const { attempts, layer } = memoryStorage();
    const error = await run({
      effect: uploadImage({ key: KEY, bytes: jpeg, specs: [VARIANTS.sm, VARIANTS.sm] }),
      storage: layer
    });
    expect(error).toBeInstanceOf(InvalidSpecs);
    expect(attempts.size).toBe(0);
  });
});

describe("maxUploadBytes", () => {
  const jpegOfSize = (size: number) => {
    const bytes = new Uint8Array(size);
    bytes[0] = 0xff;
    return bytes;
  };

  test("a file above the default limit is accepted when the caller raises it", async () => {
    const { objects, layer } = memoryStorage();
    const result = await Effect.runPromise(
      uploadImage({
        key: KEY,
        bytes: jpegOfSize(MAX_UPLOAD_BYTES + 1),
        maxUploadBytes: MAX_UPLOAD_BYTES * 2
      }).pipe(Effect.provide(provide({ storage: layer })))
    );
    expect(Object.keys(result.variants)).toHaveLength(5);
    expect(objects.size).toBe(5);
  });

  test("the caller can lower the limit, and a file exactly at the limit is accepted", async () => {
    const { objects, layer } = memoryStorage();
    const tooBig = await run({
      effect: uploadImage({ key: KEY, bytes: jpegOfSize(4), maxUploadBytes: 3 }),
      storage: layer
    });
    expect(tooBig).toBeInstanceOf(InvalidImage);
    expect(objects.size).toBe(0);

    const result = await Effect.runPromise(
      uploadImage({ key: KEY, bytes: jpegOfSize(3), maxUploadBytes: 3 }).pipe(
        Effect.provide(provide({ storage: layer }))
      )
    );
    expect(Object.keys(result.variants)).toHaveLength(5);
  });

  for (const limit of [0, -5, 10.5, Number.NaN]) {
    test(`rejects ${limit} as a limit with InvalidOptions, not as a bad image`, async () => {
      const { attempts, layer } = memoryStorage();
      const error = await run({
        effect: uploadImage({ key: KEY, bytes: jpeg, maxUploadBytes: limit }),
        storage: layer
      });
      expect(error).toBeInstanceOf(InvalidOptions);
      expect(attempts.size).toBe(0);
    });
  }
});

describe("keys", () => {
  test("the caller decides the key of every variant, deterministically", async () => {
    const { objects, layer } = memoryStorage();
    const input = {
      bytes: jpeg,
      specs: [VARIANTS.sm, VARIANTS.original],
      key: ({ spec, extension }: { spec: VariantSpec; extension: string }) =>
        `avatars/user-42/${spec.name}.${extension}`
    };
    const first = await Effect.runPromise(
      uploadImage(input).pipe(Effect.provide(provide({ storage: layer })))
    );
    expect(first.variants.sm.key).toBe("avatars/user-42/sm.webp");
    expect(first.variants.original.key).toBe("avatars/user-42/original.jpg");
    expect(first.variants.sm.url).toBe("https://cdn.test/avatars/user-42/sm.webp");
    expect([...objects.keys()].sort()).toEqual([
      "avatars/user-42/original.jpg",
      "avatars/user-42/sm.webp"
    ]);

    const second = await Effect.runPromise(
      uploadImage(input).pipe(Effect.provide(provide({ storage: layer })))
    );
    expect(second.variants.sm.key).toBe(first.variants.sm.key);
  });

  test("prefixed builds <prefix>/<name>.<extension> and ignores trailing slashes", () => {
    const fn = prefixed({ prefix: "avatars/user-42/" });
    expect(fn({ spec: VARIANTS.sm, extension: "webp" })).toBe("avatars/user-42/sm.webp");
    expect(fn({ spec: VARIANTS.original, extension: "png" })).toBe("avatars/user-42/original.png");
  });

  const invalid: ReadonlyArray<[string, (input: { spec: VariantSpec }) => string]> = [
    ["an empty key", () => ""],
    ["a leading slash", ({ spec }) => `/images/${spec.name}.webp`],
    ["a double slash", ({ spec }) => `images//${spec.name}.webp`],
    ["control characters", ({ spec }) => `images/${spec.name}\n.webp`],
    ["a key that is too long", ({ spec }) => `${"a".repeat(MAX_KEY_BYTES)}/${spec.name}`],
    ["the same key for every variant", () => "images/same.webp"],
    [
      "a function that throws",
      () => {
        throw new Error("boom");
      }
    ]
  ];

  for (const [label, key] of invalid) {
    test(`rejects ${label} with InvalidKeys before touching storage`, async () => {
      const { attempts, layer } = memoryStorage();
      const error = await run({
        effect: uploadImage({ bytes: jpeg, specs: [VARIANTS.sm, VARIANTS.md], key }),
        storage: layer
      });
      expect(error).toBeInstanceOf(InvalidKeys);
      expect(attempts.size).toBe(0);
    });
  }
});

describe("existing keys", () => {
  const SM = "images/test/sm.webp";

  test("uploading to existing keys replaces the objects (the fake has no exists: any such call would throw)", async () => {
    const { objects, layer } = memoryStorage({ existing: { [SM]: "image/old" } });
    await Effect.runPromise(
      uploadImage({ key: KEY, bytes: jpeg, specs: [VARIANTS.sm, VARIANTS.md] }).pipe(
        Effect.provide(provide({ storage: layer }))
      )
    );
    expect(objects.get(SM)).toBe("image/webp");
    expect(objects.has("images/test/md.webp")).toBe(true);
  });

  test("a failed re-upload never deletes the previous objects", async () => {
    const { objects, deletes, layer } = memoryStorage({
      existing: { [SM]: "image/old" },
      failWhen: ({ key }) => key === "images/test/md.webp"
    });
    const error = await run({
      effect: uploadImage({
        key: KEY,
        bytes: jpeg,
        specs: [VARIANTS.thumbnail, VARIANTS.sm, VARIANTS.md],
        retry: NO_RETRY
      }),
      storage: layer
    });
    expect(error).toBeInstanceOf(StorageError);
    expect(deletes()).toBe(0);
    expect(objects.has(SM)).toBe(true);
  });
});
