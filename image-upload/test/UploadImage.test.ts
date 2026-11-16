import { describe, expect, test } from "bun:test"
import { Effect, Layer } from "effect"
import { ImageProcessor } from "../application/ImageProcessor.ts"
import { ImageStorage } from "../application/ImageStorage.ts"
import { uploadImage } from "../application/UploadImage.ts"
import { ImageProcessingError, InvalidImage, StorageError } from "../domain/errors.ts"
import { MAX_UPLOAD_BYTES } from "../domain/ImageVariant.ts"

const SOURCE = { width: 4000, height: 3000 }

const fakeProcessor = Layer.succeed(
  ImageProcessor,
  ImageProcessor.of({
    inspect: (bytes) =>
      bytes[0] === 0xff
        ? Effect.succeed({ ...SOURCE, format: "jpeg" as const })
        : Effect.fail(new InvalidImage({ reason: "not an image" })),
    render: (_bytes, spec) => {
      const scale = Math.min(1, (spec.maxSize ?? Infinity) / SOURCE.width)
      return Effect.succeed({
        bytes: new Uint8Array([1]),
        width: Math.round(SOURCE.width * scale),
        height: Math.round(SOURCE.height * scale)
      })
    }
  })
)

const memoryStorage = (failOnPutNumber?: number) => {
  const objects = new Map<string, string>()
  let puts = 0
  const layer = Layer.succeed(
    ImageStorage,
    ImageStorage.of({
      put: (key, _bytes, contentType) => {
        puts += 1
        if (puts === failOnPutNumber) return Effect.fail(new StorageError({ key, cause: "boom" }))
        objects.set(key, contentType)
        return Effect.void
      },
      deleteMany: (keys) => Effect.sync(() => keys.forEach((k) => objects.delete(k))),
      publicUrl: (key) => `https://cdn.test/${key}`
    })
  )
  return { objects, layer }
}

const jpeg = new Uint8Array([0xff, 0xd8, 0xff])

const run = <A, E>(effect: Effect.Effect<A, E, ImageProcessor | ImageStorage>, storage: Layer.Layer<ImageStorage>) =>
  Effect.runPromise(Effect.flip(effect).pipe(Effect.provide(Layer.merge(fakeProcessor, storage))))

describe("uploadImage", () => {
  test("stores the five variants with webp content type, immutable keys and public urls", async () => {
    const { objects, layer } = memoryStorage()
    const result = await Effect.runPromise(uploadImage(jpeg).pipe(Effect.provide(Layer.merge(fakeProcessor, layer))))

    expect(Object.keys(result.variants).sort()).toEqual(["lg", "md", "original", "sm", "thumbnail"])
    expect(result.variants.sm.key).toBe(`images/${result.id}/sm.webp`)
    expect(result.variants.sm.url).toBe(`https://cdn.test/images/${result.id}/sm.webp`)
    expect(result.variants.sm.width).toBe(480)
    expect(result.variants.original.key).toBe(`images/${result.id}/original.jpg`)
    expect(result.variants.original.contentType).toBe("image/jpeg")
    expect(objects.size).toBe(5)
    expect(objects.get(result.variants.md.key)).toBe("image/webp")
  })

  test("rejects non-images before touching storage", async () => {
    const { objects, layer } = memoryStorage()
    const error = await run(uploadImage(new Uint8Array([0, 1, 2])), layer)
    expect(error).toBeInstanceOf(InvalidImage)
    expect(objects.size).toBe(0)
  })

  test("rejects uploads over the size limit", async () => {
    const { objects, layer } = memoryStorage()
    const error = await run(uploadImage(new Uint8Array(MAX_UPLOAD_BYTES + 1)), layer)
    expect(error).toBeInstanceOf(InvalidImage)
    expect(objects.size).toBe(0)
  })

  test("rolls back uploaded objects when a later upload fails", async () => {
    const { objects, layer } = memoryStorage(3)
    const error = await run(uploadImage(jpeg), layer)
    expect(error).toBeInstanceOf(StorageError)
    expect(objects.size).toBe(0)
  })

  test("a failing processor surfaces ImageProcessingError and leaves no objects", async () => {
    const { objects, layer } = memoryStorage()
    const failing = Layer.succeed(
      ImageProcessor,
      ImageProcessor.of({
        inspect: () => Effect.succeed({ ...SOURCE, format: "jpeg" as const }),
        render: (_b, spec) => Effect.fail(new ImageProcessingError({ variant: spec.name, cause: "decode" }))
      })
    )
    const error = await Effect.runPromise(
      Effect.flip(uploadImage(jpeg)).pipe(Effect.provide(Layer.merge(failing, layer)))
    )
    expect(error).toBeInstanceOf(ImageProcessingError)
    expect(objects.size).toBe(0)
  })
})
