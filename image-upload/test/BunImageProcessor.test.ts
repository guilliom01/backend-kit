import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { deflateSync } from "node:zlib"
import { ImageProcessor } from "../application/ImageProcessor.ts"
import { InvalidImage } from "../domain/errors.ts"
import { BunImageProcessorLayer } from "../infrastructure/BunImageProcessor.ts"

const chunk = (type: string, data: Uint8Array) => {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  out.set(new TextEncoder().encode(type), 4)
  out.set(data, 8)
  view.setUint32(8 + data.length, Bun.hash.crc32(out.subarray(4, 8 + data.length)))
  return out
}

/** Solid-color RGB PNG, built by hand so the test needs no fixture file. */
const solidPng = (width: number, height: number) => {
  const ihdr = new Uint8Array(13)
  const view = new DataView(ihdr.buffer)
  view.setUint32(0, width)
  view.setUint32(4, height)
  ihdr.set([8, 2, 0, 0, 0], 8)
  const row = new Uint8Array(1 + width * 3)
  for (let x = 0; x < width; x++) row.set([200, 80, 40], 1 + x * 3)
  const raw = new Uint8Array(row.length * height)
  for (let y = 0; y < height; y++) raw.set(row, y * row.length)
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", new Uint8Array())
  ]
  return Uint8Array.from(parts.flatMap((p) => [...p]))
}

const withProcessor = <A, E>(f: (p: ImageProcessor["Service"]) => Effect.Effect<A, E>) =>
  Effect.runPromise(
    Effect.gen(function* () {
      return yield* f(yield* ImageProcessor)
    }).pipe(Effect.provide(BunImageProcessorLayer))
  )

describe("BunImageProcessor (real Bun.Image)", () => {
  const png = solidPng(800, 600)

  test("inspect reads the real format and dimensions", async () => {
    expect(await withProcessor((p) => p.inspect(png))).toEqual({ width: 800, height: 600, format: "png" })
  })

  test("render fits inside maxSize, keeps aspect ratio and outputs webp", async () => {
    const out = await withProcessor((p) => p.render(png, { name: "thumbnail", maxSize: 150 }))
    expect(out.width).toBe(150)
    expect(out.height).toBeGreaterThanOrEqual(112)
    expect(out.height).toBeLessThanOrEqual(113)
    expect(new TextDecoder().decode(out.bytes.subarray(8, 12))).toBe("WEBP")
  })

  test("render never enlarges a source smaller than maxSize", async () => {
    const out = await withProcessor((p) => p.render(png, { name: "lg", maxSize: 1920 }))
    expect(out.width).toBe(800)
    expect(out.height).toBe(600)
  })

  test("inspect rejects bytes that are not an image", async () => {
    const error = await withProcessor((p) => Effect.flip(p.inspect(new TextEncoder().encode("hello"))))
    expect(error).toBeInstanceOf(InvalidImage)
  })
})
