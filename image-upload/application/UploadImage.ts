import { Effect } from "effect"
import { InvalidImage } from "../domain/errors.ts"
import {
  ALLOWED_FORMATS,
  MAX_UPLOAD_BYTES,
  VARIANTS,
  type VariantName,
  type VariantSpec
} from "../domain/ImageVariant.ts"
import { ImageProcessor, type ImageInfo } from "./ImageProcessor.ts"
import { ImageStorage } from "./ImageStorage.ts"

export interface StoredVariant {
  readonly key: string
  readonly url: string
  readonly width: number
  readonly height: number
  readonly contentType: string
}

export interface UploadedImage {
  readonly id: string
  readonly variants: Readonly<Record<VariantName, StoredVariant>>
}

const keyFor = (id: string, spec: VariantSpec, info: ImageInfo) =>
  spec.maxSize === undefined
    ? `images/${id}/original.${info.format === "jpeg" ? "jpg" : info.format}`
    : `images/${id}/${spec.name}.webp`

export const uploadImage = Effect.fn("uploadImage")(function* (bytes: Uint8Array) {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_UPLOAD_BYTES) {
    return yield* new InvalidImage({ reason: `size must be between 1 and ${MAX_UPLOAD_BYTES} bytes` })
  }

  const processor = yield* ImageProcessor
  const storage = yield* ImageStorage

  const info = yield* processor.inspect(bytes)
  if (!ALLOWED_FORMATS.includes(info.format)) {
    return yield* new InvalidImage({ reason: `unsupported format: ${info.format}` })
  }

  const id = crypto.randomUUID()
  const keys = VARIANTS.map((spec) => keyFor(id, spec, info))

  const store = (spec: VariantSpec, key: string) =>
    Effect.gen(function* () {
      const isOriginal = spec.maxSize === undefined
      const rendered = isOriginal
        ? { bytes, width: info.width, height: info.height }
        : yield* processor.render(bytes, spec)
      const contentType = isOriginal ? `image/${info.format}` : "image/webp"
      yield* storage.put(key, rendered.bytes, contentType)
      return [
        spec.name,
        {
          key,
          url: storage.publicUrl(key),
          width: rendered.width,
          height: rendered.height,
          contentType
        }
      ] as const
    })

  const entries = yield* Effect.forEach(VARIANTS, (spec, i) => store(spec, keys[i]!), { concurrency: 3 }).pipe(
    // Delete every planned key, not only completed puts: an interrupted in-flight put may still land. Deletes are idempotent.
    Effect.onError(() => storage.deleteMany(keys).pipe(Effect.ignore))
  )

  return { id, variants: Object.fromEntries(entries) as Record<VariantName, StoredVariant> } satisfies UploadedImage
})
