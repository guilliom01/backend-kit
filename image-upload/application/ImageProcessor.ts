import { Context, type Effect } from "effect";
import type { AllowedFormat, VariantSpec } from "../domain/ImageVariant.ts";
import type { ImageProcessingError, InvalidImage } from "../domain/errors.ts";

export type ImageInfo = {
  readonly width: number;
  readonly height: number;
  readonly format: AllowedFormat;
};

export type RenderedImage = {
  readonly bytes: Uint8Array;
  readonly width: number;
  readonly height: number;
};

export type InspectInput = {
  readonly bytes: Uint8Array;
};

export type RenderInput = {
  readonly bytes: Uint8Array;
  readonly spec: VariantSpec;
};

export class ImageProcessor extends Context.Service<
  ImageProcessor,
  {
    /** Sniffs the real format and size; fails with InvalidImage for anything not decodable or not allowed. */
    inspect(input: InspectInput): Effect.Effect<ImageInfo, InvalidImage>;
    /** Produces a webp that fits within `spec.maxSize`, never enlarging the source. */
    render(input: RenderInput): Effect.Effect<RenderedImage, ImageProcessingError>;
  }
>()("image-upload/ImageProcessor") {}
