import { Context, type Effect } from "effect"
import type { StorageError } from "../domain/errors.ts"

export class ImageStorage extends Context.Service<
  ImageStorage,
  {
    put(key: string, bytes: Uint8Array, contentType: string): Effect.Effect<void, StorageError>
    deleteMany(keys: ReadonlyArray<string>): Effect.Effect<void, StorageError>
    publicUrl(key: string): string
  }
>()("image-upload/ImageStorage") {}
