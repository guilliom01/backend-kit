import { Context, type Effect } from "effect"
import type { AllowedFormat, VariantSpec } from "../domain/ImageVariant.ts"
import type { ImageProcessingError, InvalidImage } from "../domain/errors.ts"

export interface ImageInfo {
  readonly width: number
  readonly height: number
  readonly format: AllowedFormat
}

export interface RenderedImage {
  readonly bytes: Uint8Array
  readonly width: number
  readonly height: number
}

export class ImageProcessor extends Context.Service<
  ImageProcessor,
  {
    /** Sniffs the real format and size; fails with InvalidImage for anything not decodable or not allowed. */
    inspect(bytes: Uint8Array): Effect.Effect<ImageInfo, InvalidImage>
    /** Produces a webp that fits within `spec.maxSize`, never enlarging the source. */
    render(bytes: Uint8Array, spec: VariantSpec): Effect.Effect<RenderedImage, ImageProcessingError>
  }
>()("image-upload/ImageProcessor") {}
