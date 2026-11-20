import { Config } from "effect";

const accountEndpoint = Config.NonEmptyString("R2_ACCOUNT_ID").pipe(
  Config.map((accountId) => `https://${accountId}.r2.cloudflarestorage.com`)
);

export const ImageUploadConfig = Config.all({
  // R2_ENDPOINT targets any S3-compatible storage (MinIO, floci); otherwise R2 is derived from R2_ACCOUNT_ID.
  endpoint: Config.NonEmptyString("R2_ENDPOINT").pipe(Config.orElse(() => accountEndpoint)),
  // Only needed outside R2: emulators like floci reject Bun's default region "auto".
  region: Config.option(Config.NonEmptyString("R2_REGION")),
  accessKeyId: Config.NonEmptyString("R2_ACCESS_KEY_ID"),
  secretAccessKey: Config.Redacted("R2_SECRET_ACCESS_KEY"),
  bucket: Config.NonEmptyString("R2_BUCKET"),
  publicUrl: Config.NonEmptyString("R2_PUBLIC_URL")
});
