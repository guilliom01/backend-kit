import { Effect } from "effect";
import { InvalidKeys } from "./errors.ts";
import type { VariantSpec } from "./ImageVariant.ts";

export type KeyInput = {
  readonly spec: VariantSpec;
  /** `webp` for resized variants; the source format's extension for `original`. */
  readonly extension: string;
};

/** Decides where each variant is stored. It must be deterministic and return a different key per spec. */
export type KeyFn = (input: KeyInput) => string;

/** `<prefix>/<name>.<extension>`, e.g. `avatars/user-42/sm.webp`. Trailing slashes in the prefix are ignored. */
export const prefixed = ({ prefix }: { readonly prefix: string }): KeyFn => {
  const base = prefix.replace(/\/+$/, "");
  return ({ spec, extension }) => `${base}/${spec.name}.${extension}`;
};

/** S3 and R2 limit object keys to 1024 bytes. */
export const MAX_KEY_BYTES = 1024;

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

const keysProblem = ({ keys }: { readonly keys: ReadonlyArray<unknown> }): string | undefined => {
  const seen = new Set<string>();
  for (const key of keys) {
    if (typeof key !== "string") return "the key function must return a string";
    const shown = JSON.stringify(key.slice(0, 60));
    if (key.length === 0) return "a key is empty";
    if (key.startsWith("/")) return `key ${shown} must not start with "/"`;
    if (key.includes("//")) return `key ${shown} must not contain "//"`;
    if (CONTROL_CHARS.test(key)) return `key ${shown} contains control characters`;
    if (new TextEncoder().encode(key).byteLength > MAX_KEY_BYTES) {
      return `key ${shown}... is longer than ${MAX_KEY_BYTES} bytes`;
    }
    if (seen.has(key)) return `duplicate key ${shown}: every variant needs its own key`;
    seen.add(key);
  }
  return undefined;
};

export const validateKeys = ({ keys }: { readonly keys: ReadonlyArray<unknown> }) => {
  const reason = keysProblem({ keys });
  return reason === undefined ? Effect.void : Effect.fail(new InvalidKeys({ reason }));
};
