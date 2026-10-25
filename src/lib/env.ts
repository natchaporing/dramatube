/**
 * Configuration, read once and typed.
 *
 * Every value is read lazily through a getter so that a script can load
 * `.env` before the first access, and so tests can set variables per case.
 */
function read(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value.trim() === "" ? undefined : value.trim();
}

export const env = {
  get databaseUrl() {
    return read("DATABASE_URL") ?? "postgres://postgres:postgres@127.0.0.1:5432/dramatube";
  },
  get authSecret() {
    const secret = read("AUTH_SECRET");
    if (secret) return secret;
    if (process.env.NODE_ENV === "production") {
      throw new Error("AUTH_SECRET must be set in production.");
    }
    return "dramatube-development-secret-do-not-use-in-production";
  },
  get publicAppUrl() {
    return read("PUBLIC_APP_URL")?.replace(/\/$/, "");
  },
  get storageDriver(): "local" | "s3" {
    return read("STORAGE_DRIVER") === "s3" ? "s3" : "local";
  },
  get storageLocalDir() {
    return read("STORAGE_LOCAL_DIR") ?? ".storage";
  },
  get s3Bucket() {
    return read("S3_BUCKET");
  },
  get s3Region() {
    return read("S3_REGION") ?? "auto";
  },
  get s3Endpoint() {
    return read("S3_ENDPOINT");
  },
  get s3AccessKeyId() {
    return read("S3_ACCESS_KEY_ID");
  },
  get s3SecretAccessKey() {
    return read("S3_SECRET_ACCESS_KEY");
  },
  get s3ForcePathStyle() {
    return read("S3_FORCE_PATH_STYLE") === "1" || read("S3_FORCE_PATH_STYLE") === "true";
  },
  get s3PublicBaseUrl() {
    return read("S3_PUBLIC_BASE_URL")?.replace(/\/$/, "");
  },
  /** With a public base URL: the operator's word that `videos/` itself is not publicly readable. */
  get s3VideosPrivate() {
    return read("S3_VIDEOS_PRIVATE") === "1";
  },
  get uploadMaxBytes() {
    const mb = Number(read("UPLOAD_MAX_MB") ?? "2048");
    return (Number.isFinite(mb) && mb > 0 ? mb : 2048) * 1024 * 1024;
  },
  get ffmpegPath() {
    return read("FFMPEG_PATH") ?? "ffmpeg";
  },
  get ffprobePath() {
    return read("FFPROBE_PATH") ?? "ffprobe";
  },
};
