import { Context, type Effect } from "effect";
import type { StorageError } from "../domain/errors.ts";

export type PutInput = {
  readonly key: string;
  readonly bytes: Uint8Array;
  readonly contentType: string;
};

export type DeleteManyInput = {
  readonly keys: ReadonlyArray<string>;
};

export type PublicUrlInput = {
  readonly key: string;
};

export class ImageStorage extends Context.Service<
  ImageStorage,
  {
    put(input: PutInput): Effect.Effect<void, StorageError>;
    deleteMany(input: DeleteManyInput): Effect.Effect<void, StorageError>;
    publicUrl(input: PublicUrlInput): string;
  }
>()("image-upload/ImageStorage") {}
