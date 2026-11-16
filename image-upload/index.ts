import { Layer } from "effect"
import { BunImageProcessorLayer } from "./infrastructure/BunImageProcessor.ts"
import { R2ImageStorageLayer } from "./infrastructure/R2ImageStorage.ts"

export { ImageProcessor, type ImageInfo, type RenderedImage } from "./application/ImageProcessor.ts"
export { ImageStorage } from "./application/ImageStorage.ts"
export { uploadImage, type StoredVariant, type UploadedImage } from "./application/UploadImage.ts"
export { ImageProcessingError, InvalidImage, StorageError } from "./domain/errors.ts"
export { MAX_UPLOAD_BYTES, VARIANTS, type VariantName } from "./domain/ImageVariant.ts"
export { BunImageProcessorLayer } from "./infrastructure/BunImageProcessor.ts"
export { ImageUploadConfig } from "./infrastructure/ImageUploadConfig.ts"
export { R2ImageStorageLayer } from "./infrastructure/R2ImageStorage.ts"

/** Default wiring: Bun.Image for processing, Cloudflare R2 for storage (reads R2_* env vars). */
export const ImageUploadLayer = Layer.merge(BunImageProcessorLayer, R2ImageStorageLayer)
