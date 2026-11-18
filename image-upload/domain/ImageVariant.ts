import { Effect, Match } from "effect";
import { InvalidSpecs } from "./errors.ts";

export type VariantSpec = {
  /** Unique within an upload; used as the object key and as the key of the returned variants. */
  readonly name: string;
  /** Longest side in pixels (never enlarged); absent means full size, re-encoded as webp. */
  readonly maxSize?: number;
};

/** Reserved spec name: the source bytes are stored untouched, in their own format. */
export const ORIGINAL = "original";

/** Platform specs, by name: pick them (`VARIANTS.md`) or mix them with your own in `specs`. */
export const VARIANTS = {
  thumbnail: { name: "thumbnail", maxSize: 150 },
  sm: { name: "sm", maxSize: 480 },
  md: { name: "md", maxSize: 960 },
  lg: { name: "lg", maxSize: 1920 },
  original: { name: ORIGINAL }
} as const satisfies Record<string, VariantSpec>;

/** What the platform generates when the caller does not pass `specs`. */
export const DEFAULT_VARIANTS = [
  VARIANTS.thumbnail,
  VARIANTS.sm,
  VARIANTS.md,
  VARIANTS.lg,
  VARIANTS.original
] as const;

export type DefaultVariantName = (typeof DEFAULT_VARIANTS)[number]["name"];

/** Fixed ceiling for a spec's `maxSize`, in px. */
export const MAX_VARIANT_SIZE = 8192;
const NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;

export type ValidateSpecsInput = {
  readonly specs: ReadonlyArray<VariantSpec>;
};

const specsProblem = ({ specs }: ValidateSpecsInput): string | undefined => {
  if (specs.length === 0) return "at least one spec is required";
  const seen = new Set<string>();
  for (const { name, maxSize } of specs) {
    if (!NAME_PATTERN.test(name)) {
      return `invalid spec name "${name}" (lowercase letters, digits and dashes, up to 32 characters)`;
    }

    if (seen.has(name)) return `duplicate spec name "${name}"`;
    seen.add(name);
    if (
      maxSize !== undefined &&
      (!Number.isInteger(maxSize) || maxSize < 1 || maxSize > MAX_VARIANT_SIZE)
    ) {
      return `spec "${name}": maxSize must be an integer between 1 and ${MAX_VARIANT_SIZE}`;
    }
  }
  return undefined;
};

export const validateSpecs = ({ specs }: ValidateSpecsInput) => {
  const reason = specsProblem({ specs });
  return reason === undefined ? Effect.void : Effect.fail(new InvalidSpecs({ reason }));
};

export const ALLOWED_FORMATS = ["jpeg", "png", "webp"] as const;
export type AllowedFormat = (typeof ALLOWED_FORMATS)[number];

/** Exhaustive: adding an allowed format fails to compile until its extension is decided. */
export const extensionFor = Match.type<{ readonly format: AllowedFormat }>().pipe(
  Match.when({ format: "jpeg" }, () => "jpg"),
  Match.whenOr({ format: "png" }, { format: "webp" }, ({ format }) => format),
  Match.exhaustive
);

/** Default ceiling for the uploaded file; callers can change it per upload with `maxUploadBytes`. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
