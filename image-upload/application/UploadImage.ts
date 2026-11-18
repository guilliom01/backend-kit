import { Effect, Schedule, type Duration } from "effect";
import { InvalidImage, InvalidKeys, InvalidOptions } from "../domain/errors.ts";
import {
  ALLOWED_FORMATS,
  DEFAULT_VARIANTS,
  extensionFor,
  MAX_UPLOAD_BYTES,
  ORIGINAL,
  validateSpecs,
  type VariantSpec
} from "../domain/ImageVariant.ts";
import { validateKeys, type KeyFn } from "../domain/ObjectKey.ts";
import { ImageProcessor } from "./ImageProcessor.ts";
import { ImageStorage } from "./ImageStorage.ts";

export type StoredVariant = {
  readonly key: string;
  readonly url: string;
  readonly width: number;
  readonly height: number;
  readonly contentType: string;
};

/** Exponential backoff with jitter, `times` retries after the first attempt (0 disables retries). */
export type RetryPolicy = {
  readonly times: number;
  readonly baseDelay: Duration.Input;
};

export const DEFAULT_RETRY: RetryPolicy = { times: 3, baseDelay: "200 millis" };

type Specs = ReadonlyArray<VariantSpec>;

export type UploadImageInput<S extends Specs = typeof DEFAULT_VARIANTS> = {
  readonly bytes: Uint8Array;
  /** Where each variant is stored. Deterministic: the same key is the same object, and uploading replaces it. See `prefixed`. */
  readonly key: KeyFn;
  /** Variants to generate. Defaults to `DEFAULT_VARIANTS`; pass your own list (or extend the defaults). */
  readonly specs?: S;
  /** Retry policy for storage operations. Defaults to `DEFAULT_RETRY`. */
  readonly retry?: RetryPolicy;
  /** Largest accepted file, in bytes. Defaults to `MAX_UPLOAD_BYTES`; raise or lower it per call. */
  readonly maxUploadBytes?: number;
};

export type UploadedImage<S extends Specs = typeof DEFAULT_VARIANTS> = {
  readonly variants: { readonly [K in S[number]["name"]]: StoredVariant };
};

const withRetry =
  ({ times, baseDelay }: RetryPolicy) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.retry(effect, { schedule: Schedule.jittered(Schedule.exponential(baseDelay)), times });

export const uploadImage = <const S extends Specs = typeof DEFAULT_VARIANTS>(
  input: UploadImageInput<S>
) =>
  Effect.gen(function* () {
    const { bytes, key, retry = DEFAULT_RETRY, maxUploadBytes = MAX_UPLOAD_BYTES } = input;
    const specs: Specs = input.specs ?? DEFAULT_VARIANTS;

    if (!Number.isInteger(maxUploadBytes) || maxUploadBytes < 1) {
      return yield* new InvalidOptions({
        reason: `maxUploadBytes must be a positive integer, got ${maxUploadBytes}`
      });
    }
    yield* validateSpecs({ specs });

    if (bytes.byteLength === 0 || bytes.byteLength > maxUploadBytes) {
      return yield* new InvalidImage({
        reason: `size must be between 1 and ${maxUploadBytes} bytes`
      });
    }

    const processor = yield* ImageProcessor;
    const storage = yield* ImageStorage;

    const info = yield* processor.inspect({ bytes });
    if (!ALLOWED_FORMATS.includes(info.format)) {
      return yield* new InvalidImage({ reason: `unsupported format: ${info.format}` });
    }

    const retrying = withRetry(retry);

    const keys = yield* Effect.try({
      try: () =>
        specs.map((spec) =>
          key({
            spec,
            extension: spec.name === ORIGINAL ? extensionFor({ format: info.format }) : "webp"
          })
        ),
      catch: (cause) => new InvalidKeys({ reason: `the key function threw: ${String(cause)}` })
    });
    yield* validateKeys({ keys });

    // Render everything before writing anything, so a processing failure never leaves objects behind.
    const rendered = yield* Effect.forEach(
      specs,
      (spec) =>
        spec.name === ORIGINAL
          ? Effect.succeed({ bytes, width: info.width, height: info.height })
          : processor.render({ bytes, spec }),
      { concurrency: 3 }
    );

    // Keys are deterministic and writes replace what is there. A storage failure leaves the objects already written:
    // nothing is deleted (we cannot tell new objects from previous ones), and repeating the upload overwrites them.
    const entries = yield* Effect.forEach(
      specs,
      (spec, i) => {
        const key = keys[i]!;
        const { width, height, bytes: data } = rendered[i]!;
        const contentType = spec.name === ORIGINAL ? `image/${info.format}` : "image/webp";
        return storage.put({ key, bytes: data, contentType }).pipe(
          retrying,
          Effect.map(
            () =>
              [
                spec.name,
                { key, url: storage.publicUrl({ key }), width, height, contentType }
              ] as const
          )
        );
      },
      { concurrency: 3 }
    );

    return { variants: Object.fromEntries(entries) } as UploadedImage<S>;
  }).pipe(Effect.withSpan("uploadImage"));
