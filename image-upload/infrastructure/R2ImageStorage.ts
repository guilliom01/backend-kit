import { S3Client } from "bun";
import { Effect, Layer, Redacted } from "effect";
import { ImageStorage } from "../application/ImageStorage.ts";
import { StorageError } from "../domain/errors.ts";
import { ImageUploadConfig } from "./ImageUploadConfig.ts";

export const R2ImageStorageLayer = Layer.effect(
  ImageStorage,
  Effect.gen(function* () {
    const config = yield* ImageUploadConfig;
    const client = new S3Client({
      accessKeyId: config.accessKeyId,
      secretAccessKey: Redacted.value(config.secretAccessKey),
      bucket: config.bucket,
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`
    });
    const baseUrl = config.publicUrl.replace(/\/+$/, "");

    return ImageStorage.of({
      put: ({ key, bytes, contentType }) =>
        Effect.tryPromise({
          try: () => client.write(key, bytes, { type: contentType }),
          catch: (cause) => new StorageError({ key, cause })
        }).pipe(Effect.asVoid),

      deleteMany: ({ keys }) =>
        Effect.forEach(
          keys,
          (key) =>
            Effect.tryPromise({
              try: () => client.delete(key),
              catch: (cause) => new StorageError({ key, cause })
            }),
          { concurrency: 5, discard: true }
        ),

      publicUrl: ({ key }) => `${baseUrl}/${key}`
    });
  })
);
