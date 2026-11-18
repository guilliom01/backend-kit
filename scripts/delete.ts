// Deletes the objects created by the last `bun run try:upload` (and nothing else).
// Usage: bun run try:delete
import { Effect } from "effect";
import { ImageStorage, R2ImageStorageLayer, type UploadedImage } from "../image-upload/index.ts";

const LAST_UPLOAD = new URL("./last-upload.json", import.meta.url);
const SAFE_PREFIX = "try-upload/";

const record = Bun.file(LAST_UPLOAD);
if (!(await record.exists())) throw new Error("Nothing to delete: run `bun run try:upload` first.");

const image = (await record.json()) as UploadedImage;
const keys = Object.values(image.variants).map((variant) => variant.key);

// The record is a local file anyone can edit: refuse anything outside the try-upload/ prefix.
const foreign = keys.filter((key) => !key.startsWith(SAFE_PREFIX));
if (foreign.length > 0)
  throw new Error(`Refusing to delete unexpected keys: ${foreign.join(", ")}`);

await Effect.runPromise(
  Effect.gen(function* () {
    const storage = yield* ImageStorage;
    yield* storage.deleteMany({ keys });
  }).pipe(Effect.provide(R2ImageStorageLayer))
);

await record.delete();
console.log(`Deleted ${keys.length} objects:`);
for (const key of keys) console.log(`  ${key}`);
