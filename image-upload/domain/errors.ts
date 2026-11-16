import { Schema } from "effect"

export class InvalidImage extends Schema.TaggedError<InvalidImage>()("InvalidImage", {
  reason: Schema.String
}) {}

export class ImageProcessingError extends Schema.TaggedError<ImageProcessingError>()("ImageProcessingError", {
  variant: Schema.String,
  cause: Schema.Defect()
}) {}

export class StorageError extends Schema.TaggedError<StorageError>()("StorageError", {
  key: Schema.String,
  cause: Schema.Defect()
}) {}
