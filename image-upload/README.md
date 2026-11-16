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
import { Effect } from "effect"
import { ImageUploadLayer, uploadImage } from "./image-upload/index.ts"

const bytes = new Uint8Array(await Bun.file("photo.jpg").arrayBuffer())
const image = await Effect.runPromise(uploadImage(bytes).pipe(Effect.provide(ImageUploadLayer)))
// image.id, image.variants.sm.url, image.variants.sm.width, ...
```

Errors (tagged): `InvalidImage`, `ImageProcessingError`, `StorageError`. On any failure every planned key is deleted.
A driving adapter (HTTP, CLI) only reads bytes, calls `uploadImage` and maps those errors to its own output.

Frontend: build `srcset` from the variant widths, e.g. `${sm.url} ${sm.width}w, ${md.url} ${md.width}w, ${lg.url} ${lg.width}w`.

## Caching

`Bun.S3Client` cannot set `Cache-Control` on write. Keys contain a unique id and are never overwritten, so add a
Cloudflare Cache Rule for `/images/*` (Edge TTL 1 year, Browser TTL 1 year) on the R2 custom domain.

## Tests

`bun test`: processor tests use the real `Bun.Image`; storage is an in-memory fake, so R2 itself is not exercised.
