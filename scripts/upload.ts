// Manual check against a real R2 bucket. Reads R2_* from .env (Bun loads it automatically).
// Usage: bun run try:upload [path-to-image]
// Keys are deterministic (try-upload/<image-name>/<variant>.<ext>): uploading the same image twice replaces it.
import { Effect } from "effect";
import { basename, extname } from "node:path";
import { ImageUploadLayer, prefixed, uploadImage } from "../image-upload/index.ts";

const DEFAULT_IMAGE = "image-upload/test/test-image-01.jpg";
const LAST_UPLOAD = new URL("./last-upload.json", import.meta.url);

const args = Bun.argv.slice(2);
const file = Bun.file(args.find((arg) => !arg.startsWith("--")) ?? DEFAULT_IMAGE);
if (!(await file.exists())) throw new Error(`Image not found: ${file.name}`);

const bytes = new Uint8Array(await file.arrayBuffer());
console.log(`Uploading ${file.name} (${bytes.byteLength} bytes)...`);

const name = basename(file.name ?? DEFAULT_IMAGE, extname(file.name ?? DEFAULT_IMAGE));
const image = await Effect.runPromise(
  uploadImage({ bytes, key: prefixed({ prefix: `try-upload/${name}` }) }).pipe(
    Effect.provide(ImageUploadLayer)
  )
);

// The delete script reads this file, so it only ever removes what this upload created.
await Bun.write(LAST_UPLOAD, JSON.stringify(image, null, 2));

console.log(`Uploaded ${name}`);
console.table(image.variants);
console.log("Open the urls above to confirm each variant loads, then run: bun run try:delete");
