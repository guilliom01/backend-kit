import { Layer } from "effect";
import { BunImageProcessorLayer } from "./infrastructure/BunImageProcessor.ts";
import { R2ImageStorageLayer } from "./infrastructure/R2ImageStorage.ts";

export {
  ImageProcessor,
  type ImageInfo,
  type InspectInput,
  type RenderedImage,
  type RenderInput
} from "./application/ImageProcessor.ts";
export {
  ImageStorage,
  type DeleteManyInput,
  type PublicUrlInput,
  type PutInput
} from "./application/ImageStorage.ts";
export {
  DEFAULT_RETRY,
  uploadImage,
  type RetryPolicy,
  type StoredVariant,
  type UploadedImage,
  type UploadImageInput
} from "./application/UploadImage.ts";
export {
  ImageProcessingError,
  InvalidImage,
  InvalidKeys,
  InvalidOptions,
  InvalidSpecs,
  StorageError
} from "./domain/errors.ts";
export {
  DEFAULT_VARIANTS,
  MAX_UPLOAD_BYTES,
  MAX_VARIANT_SIZE,
  ORIGINAL,
  VARIANTS,
  type DefaultVariantName,
  type VariantSpec
} from "./domain/ImageVariant.ts";
export { MAX_KEY_BYTES, prefixed, type KeyFn, type KeyInput } from "./domain/ObjectKey.ts";
export { BunImageProcessorLayer } from "./infrastructure/BunImageProcessor.ts";
export { ImageUploadConfig } from "./infrastructure/ImageUploadConfig.ts";
export { R2ImageStorageLayer } from "./infrastructure/R2ImageStorage.ts";

/** Default wiring: Bun.Image for processing, Cloudflare R2 for storage (reads R2_* env vars). */
export const ImageUploadLayer = Layer.merge(BunImageProcessorLayer, R2ImageStorageLayer);
