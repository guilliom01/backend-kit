import { describe, expect, test } from "bun:test";
import { ConfigProvider, Effect, Option } from "effect";
import { ImageUploadConfig } from "../infrastructure/ImageUploadConfig.ts";

const BASE = {
  R2_ACCESS_KEY_ID: "key",
  R2_SECRET_ACCESS_KEY: "secret",
  R2_BUCKET: "images",
  R2_PUBLIC_URL: "https://cdn.example.com"
};

const load = ({ env }: { readonly env: Record<string, string> }) =>
  Effect.runPromise(
    Effect.gen(function* () {
      return yield* ImageUploadConfig;
    }).pipe(Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(env))))
  );

describe("ImageUploadConfig", () => {
  test("derives the Cloudflare R2 endpoint from R2_ACCOUNT_ID", async () => {
    const config = await load({ env: { ...BASE, R2_ACCOUNT_ID: "abc123" } });

    expect(config.endpoint).toBe("https://abc123.r2.cloudflarestorage.com");
    expect(config.region).toEqual(Option.none());
  });

  test("R2_ENDPOINT and R2_REGION target any S3-compatible storage without an account id", async () => {
    const config = await load({
      env: { ...BASE, R2_ENDPOINT: "http://localhost:4567", R2_REGION: "us-east-1" }
    });

    expect(config.endpoint).toBe("http://localhost:4567");
    expect(config.region).toEqual(Option.some("us-east-1"));
  });

  test("fails when neither R2_ENDPOINT nor R2_ACCOUNT_ID is set", async () => {
    await expect(load({ env: BASE })).rejects.toThrow("R2_ACCOUNT_ID");
  });
});
