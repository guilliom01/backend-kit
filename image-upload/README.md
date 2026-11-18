# image-upload

Transport-agnostic core: takes image bytes, stores `thumbnail`, `sm`, `md`, `lg` (webp, fit inside, never enlarged) and `original` (untouched bytes) in Cloudflare R2.

Copy this folder into a project. Requires `effect@4` and Bun >= 1.4 (`Bun.Image`, `Bun.S3Client`).

## Env

```
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
R2_PUBLIC_URL=https://cdn.example.com
```

## Use

```ts
import { Effect } from "effect";
import { ImageUploadLayer, prefixed, uploadImage } from "./image-upload/index.ts";

const bytes = new Uint8Array(await Bun.file("photo.jpg").arrayBuffer());
const image = await Effect.runPromise(
  uploadImage({ bytes, key: prefixed({ prefix: "avatars/user-42" }) }).pipe(
    Effect.provide(ImageUploadLayer)
  )
);
// image.variants.sm.key  -> "avatars/user-42/sm.webp"
// image.variants.sm.url, image.variants.sm.width, ...
```

Errors (tagged): `InvalidImage`, `InvalidSpecs`, `InvalidKeys`, `InvalidOptions`, `ImageProcessingError`, `StorageError`.
Nothing is ever deleted on failure (see Keys). A processing failure writes nothing: every variant is rendered before the first write.
A driving adapter (HTTP, CLI) only reads bytes, calls `uploadImage` and maps those errors to its own output.

Frontend: build `srcset` from the variant widths, e.g. `${sm.url} ${sm.width}w, ${md.url} ${md.width}w, ${lg.url} ${lg.width}w`.

## Keys

You decide where every variant is stored with `key`, a function that receives `{ spec, extension }` and returns the object key.
It is deterministic: there is no generated id, the same input always targets the same keys.

```ts
uploadImage({ bytes, key: prefixed({ prefix: "avatars/user-42" }) }); // avatars/user-42/sm.webp
uploadImage({ bytes, key: ({ spec, extension }) => `tenant-7/${spec.name}-v3.${extension}` });
```

- `extension` is `webp` for resized variants and the source format's extension (`jpg`, `png`, `webp`) for `original`.
- Keys are validated before anything is stored (`InvalidKeys`): not empty, no leading `/`, no `//`, no control characters,
  at most `MAX_KEY_BYTES` (1024) bytes, and a different key for every variant. A `key` function that throws is also `InvalidKeys`.
- Uploading **replaces** whatever is at those keys. There is no existence check (no extra calls to the bucket).
- A storage failure leaves the objects already written and deletes nothing: the module cannot tell new objects from
  previous ones, and deleting could destroy the image you were replacing. Because keys are deterministic, repeating
  the upload overwrites the leftovers. After a failure the variants can be a mix of new and old.

## Custom specs

`DEFAULT_VARIANTS` is only the default. Pick platform specs by name from `VARIANTS` (`thumbnail`, `sm`, `md`, `lg`, `original`),
write your own, or mix both:

```ts
uploadImage({ bytes, key, specs: [VARIANTS.md, VARIANTS.sm] });
uploadImage({ bytes, key, specs: [VARIANTS.lg, { name: "avatar", maxSize: 64 }] });
uploadImage({ bytes, key, specs: [{ name: "avatar", maxSize: 64 }, VARIANTS.original] });
uploadImage({ bytes, key, specs: [...DEFAULT_VARIANTS, { name: "hero", maxSize: 2560 }] });
```

- `name`: unique, `[a-z0-9-]`, up to 32 chars. It is passed to your `key` function and is the key in `image.variants` (typed from your specs).
- `maxSize`: longest side in px, never enlarged, up to `MAX_VARIANT_SIZE` (8192). Absent means full size, re-encoded as webp.
- `"original"` is reserved: the source bytes are stored untouched, in their own format.
- Invalid specs fail with `InvalidSpecs` before anything is stored.

## Upload size limit

Files above `MAX_UPLOAD_BYTES` (10 MB) are rejected with `InvalidImage`. It is only a default: pass `maxUploadBytes`
to raise or lower it per call, e.g. `uploadImage({ bytes, maxUploadBytes: 50 * 1024 * 1024 })`. A limit that is not a positive
integer fails with `InvalidOptions`.

## Retries

Storage writes (and the rollback delete) are retried with exponential backoff and jitter:
`DEFAULT_RETRY` is 3 retries starting at 200 ms. Override per call with `retry: { times, baseDelay }`; `times: 0` disables it.
Processing errors are not retried (they are deterministic). Retry re-runs the same `Effect`, so port implementations
must do their work when the effect runs, not when the method is called.

## Caching

`Bun.S3Client` cannot set `Cache-Control` on write, so caching is configured in Cloudflare (a Cache Rule on the R2 custom domain).
Because keys are deterministic and can be overwritten, do not give them a "cache forever" TTL unless the key changes when the
image does. Either put a version in the key (`avatars/user-42/v3/sm.webp`) and use a long TTL, or keep a short TTL and purge on overwrite.

## Tests

`bun test`: processor tests use the real `Bun.Image`; storage is an in-memory fake, so R2 itself is not exercised. `bun run try:upload` / `try:delete` exercise a real bucket (see `scripts/`).

## Custom storage

`ImageStorage` needs `put`, `deleteMany` (not called by `uploadImage`; for you to delete an image's keys) and `publicUrl`. Effects must do their work when they run, not when the method is called (retries re-run the same effect).
