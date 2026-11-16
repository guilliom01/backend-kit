export const VARIANTS = [
  { name: "thumbnail", maxSize: 150 },
  { name: "sm", maxSize: 480 },
  { name: "md", maxSize: 960 },
  { name: "lg", maxSize: 1920 },
  { name: "original" }
] as const

export type VariantName = (typeof VARIANTS)[number]["name"]

export interface VariantSpec {
  readonly name: VariantName
  /** Longest side in pixels; absent means the source bytes are stored untouched. */
  readonly maxSize?: number
}

export const ALLOWED_FORMATS = ["jpeg", "png", "webp"] as const
export type AllowedFormat = (typeof ALLOWED_FORMATS)[number]

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
