import { Effect, Layer, Match } from "effect";
import { ImageProcessor, type ImageInfo } from "../application/ImageProcessor.ts";
import { ImageProcessingError, InvalidImage } from "../domain/errors.ts";
import { ALLOWED_FORMATS, type AllowedFormat } from "../domain/ImageVariant.ts";

const MAX_PIXELS = 50_000_000;
const WEBP_QUALITY = 80;

const isAllowed = (format: string): format is AllowedFormat =>
  (ALLOWED_FORMATS as ReadonlyArray<string>).includes(format);

const errorCode = ({ error }: { readonly error: unknown }) =>
  (error as { code?: string })?.code ?? "UNKNOWN";

export const invalidReason = ({ code }: { readonly code: string }) =>
  Match.value(code).pipe(
    Match.when("ERR_IMAGE_TOO_MANY_PIXELS", () => "image dimensions are too large"),
    Match.whenOr("ERR_IMAGE_UNKNOWN_FORMAT", "ERR_IMAGE_DECODE_FAILED", () => "not a valid image"),
    Match.orElse((other) => `cannot read image (${other})`)
  );

export const BunImageProcessorLayer = Layer.succeed(
  ImageProcessor,
  ImageProcessor.of({
    inspect: ({ bytes }) =>
      Effect.tryPromise({
        try: () => new Bun.Image(bytes, { maxPixels: MAX_PIXELS }).metadata(),
        catch: (error) =>
          new InvalidImage({ reason: invalidReason({ code: errorCode({ error }) }) })
      }).pipe(
        Effect.flatMap((meta): Effect.Effect<ImageInfo, InvalidImage> =>
          isAllowed(meta.format)
            ? Effect.succeed({ width: meta.width, height: meta.height, format: meta.format })
            : Effect.fail(new InvalidImage({ reason: `unsupported format: ${meta.format}` }))
        )
      ),

    render: ({ bytes, spec }) =>
      Effect.tryPromise({
        try: async () => {
          const size = spec.maxSize ?? Infinity;
          const out = await new Bun.Image(bytes, { maxPixels: MAX_PIXELS })
            .resize(size, size, { fit: "inside", withoutEnlargement: true })
            .webp({ quality: WEBP_QUALITY })
            .bytes();

          const { width, height } = await new Bun.Image(out).metadata();
          return { bytes: out, width, height };
        },
        catch: (cause) => new ImageProcessingError({ variant: spec.name, cause })
      })
  })
);
