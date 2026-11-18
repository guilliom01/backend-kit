import { Config } from "effect";

export const ImageUploadConfig = Config.all({
  accountId: Config.NonEmptyString("R2_ACCOUNT_ID"),
  accessKeyId: Config.NonEmptyString("R2_ACCESS_KEY_ID"),
  secretAccessKey: Config.Redacted("R2_SECRET_ACCESS_KEY"),
  bucket: Config.NonEmptyString("R2_BUCKET"),
  publicUrl: Config.NonEmptyString("R2_PUBLIC_URL")
});
