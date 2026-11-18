import { Schema } from "effect";

export class InvalidImage extends Schema.TaggedError<InvalidImage>()("InvalidImage", {
  reason: Schema.String
}) {}

export class ImageProcessingError extends Schema.TaggedError<ImageProcessingError>()(
  "ImageProcessingError",
  {
    variant: Schema.String,
    cause: Schema.Defect()
  }
) {}

export class StorageError extends Schema.TaggedError<StorageError>()("StorageError", {
  key: Schema.String,
  cause: Schema.Defect()
}) {}

export class InvalidSpecs extends Schema.TaggedError<InvalidSpecs>()("InvalidSpecs", {
  reason: Schema.String
}) {}

/** The caller passed an unusable option (a configuration bug, not a bad image). */
export class InvalidOptions extends Schema.TaggedError<InvalidOptions>()("InvalidOptions", {
  reason: Schema.String
}) {}

/** The `key` function produced keys the storage cannot use (a configuration bug, not a bad image). */
export class InvalidKeys extends Schema.TaggedError<InvalidKeys>()("InvalidKeys", {
  reason: Schema.String
}) {}
