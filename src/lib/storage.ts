import { createHash, createHmac } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, rename, rmdir, stat, unlink, writeFile } from "node:fs/promises";
import { request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";
import { dirname, join, resolve, sep } from "node:path";
import { env } from "./env";

/**
 * Media storage: a local directory in development, any S3-compatible bucket
 * in production.
 *
 * Keys look like `videos/<videoId>/<random>.mp4`. The random part means a
 * replaced thumbnail gets a new URL (so a year-long cache header is safe) and
 * that nobody can walk the bucket by guessing names.
 */
const KEY_RE = /^[A-Za-z0-9][A-Za-z0-9/_.-]*$/;

export function isSafeKey(key: string): boolean {
  return KEY_RE.test(key) && !key.split("/").some((part) => part === ".." || part === "." || part === "");
}

function assertKey(key: string) {
  if (!isSafeKey(key)) throw new Error(`unsafe storage key: ${key}`);
}

/**
 * Root of the local media directory. Built at runtime from configuration,
 * which the bundler cannot narrow, so the trace is opted out of explicitly.
 */
export function localRoot(): string {
  return resolve(/* turbopackIgnore: true */ process.cwd(), env.storageLocalDir);
}

/** Absolute path of a local object, refusing anything that escapes the root. */
export function localPath(key: string): string {
  assertKey(key);
  const root = localRoot();
  const path = resolve(root, key);
  if (!path.startsWith(root + sep)) throw new Error(`unsafe storage key: ${key}`);
  return path;
}

/** Where in-flight uploads wait. Inside the local root so a move is a rename. */
export function uploadDir(): string {
  return env.storageDriver === "local"
    ? join(localRoot(), ".uploads")
    : resolve(/* turbopackIgnore: true */ process.env.UPLOAD_TMP_DIR ?? join(process.cwd(), ".storage", ".uploads"));
}

export async function putBuffer(key: string, data: Buffer, mimeType: string): Promise<void> {
  assertKey(key);
  if (env.storageDriver === "s3") {
    const response = await s3Fetch("PUT", key, { data, mimeType });
    if (!response.ok) throw new Error(`storage PUT failed ${response.status}: ${await response.text()}`);
    return;
  }
  const path = localPath(key);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, data);
}

/**
 * Move a file on disk into storage. Locally that is a rename; to a bucket it
 * is a streamed PUT, so a two-gigabyte video never sits in memory.
 */
export async function putFile(key: string, sourcePath: string, mimeType: string): Promise<void> {
  assertKey(key);
  if (env.storageDriver === "s3") {
    await s3PutStream(key, sourcePath, mimeType);
    await unlink(sourcePath).catch(() => {});
    return;
  }
  const path = localPath(key);
  await mkdir(dirname(path), { recursive: true });
  try {
    await rename(sourcePath, path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
    await copyFile(sourcePath, path);
    await unlink(sourcePath).catch(() => {});
  }
}

/** Missing is success: a delete that already happened is what was wanted. */
export async function deleteObject(key: string | null | undefined): Promise<void> {
  if (!key) return;
  assertKey(key);
  if (env.storageDriver === "s3") {
    const response = await s3Fetch("DELETE", key);
    if (!response.ok && response.status !== 404) {
      throw new Error(`storage DELETE failed ${response.status}: ${await response.text()}`);
    }
    return;
  }
  try {
    await unlink(localPath(key));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  // Each video has a directory of its own; leave none empty behind it.
  await rmdir(dirname(localPath(key))).catch(() => {});
}

export async function localSize(key: string): Promise<number | null> {
  try {
    return (await stat(localPath(key))).size;
  } catch {
    return null;
  }
}

/**
 * The URL a browser should use for a stored object.
 *
 * Video files always go through /api/media, which checks who may play them
 * (private videos, paid episodes) before redirecting to a short-lived signed
 * link. Pictures may come straight from a public bucket when one is set.
 * Selling episodes needs a private bucket: in a public one, a buyer could
 * share a file's address and the paywall would not stand between it and
 * anybody.
 */
export function mediaUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  if (env.storageDriver === "s3" && env.s3PublicBaseUrl && !key.startsWith("videos/")) return `${env.s3PublicBaseUrl}/${key}`;
  return `/api/media/${key}`;
}

/* ------------------------------------------------------------------------ */
/* S3, signed by hand: SigV4 is two hundred lines of SDK for three calls.     */
/* ------------------------------------------------------------------------ */

function s3Target(key: string) {
  const { s3Bucket, s3Endpoint, s3AccessKeyId, s3SecretAccessKey, s3Region } = env;
  if (!s3Bucket || !s3AccessKeyId || !s3SecretAccessKey) {
    throw new Error("STORAGE_DRIVER=s3 needs S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY");
  }
  const endpoint = s3Endpoint ? new URL(s3Endpoint) : new URL(`https://s3.${s3Region}.amazonaws.com`);
  const host = env.s3ForcePathStyle ? endpoint.host : `${s3Bucket}.${endpoint.host}`;
  const path = `${env.s3ForcePathStyle ? `/${s3Bucket}` : ""}/${key.split("/").map(encodeURIComponent).join("/")}`;
  return {
    protocol: endpoint.protocol,
    host,
    path,
    region: s3Region,
    accessKeyId: s3AccessKeyId,
    secretAccessKey: s3SecretAccessKey,
  };
}

const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const hmac = (key: Buffer | string, value: string) => createHmac("sha256", key).update(value).digest();

function signingKey(secret: string, dateStamp: string, region: string) {
  return hmac(hmac(hmac(hmac(`AWS4${secret}`, dateStamp), region), "s3"), "aws4_request");
}

function amzNow() {
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amzDate, dateStamp: amzDate.slice(0, 8) };
}

function signHeaders(
  method: string,
  target: ReturnType<typeof s3Target>,
  payloadHash: string,
  extra: Array<[string, string]>,
) {
  const { amzDate, dateStamp } = amzNow();
  const pairs: Array<[string, string]> = [
    ...extra,
    ["host", target.host],
    ["x-amz-content-sha256", payloadHash],
    ["x-amz-date", amzDate],
  ].sort(([a], [b]) => a.localeCompare(b)) as Array<[string, string]>;
  const canonicalHeaders = pairs.map(([name, value]) => `${name}:${value}\n`).join("");
  const signedHeaders = pairs.map(([name]) => name).join(";");
  const canonicalRequest = [method, target.path, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${dateStamp}/${target.region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonicalRequest)].join("\n");
  const signature = createHmac("sha256", signingKey(target.secretAccessKey, dateStamp, target.region))
    .update(stringToSign)
    .digest("hex");
  const headers: Record<string, string> = Object.fromEntries(pairs.filter(([name]) => name !== "host"));
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${target.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return headers;
}

async function s3Fetch(method: "PUT" | "DELETE" | "HEAD", key: string, body?: { data: Buffer; mimeType: string }) {
  const target = s3Target(key);
  const payloadHash = sha256(body?.data ?? Buffer.alloc(0));
  const headers = signHeaders(method, target, payloadHash, body ? [["content-type", body.mimeType]] : []);
  return fetch(`${target.protocol}//${target.host}${target.path}`, {
    method,
    headers,
    ...(body ? { body: new Uint8Array(body.data) } : {}),
  });
}

/**
 * A streamed PUT with a known length. `UNSIGNED-PAYLOAD` is what lets the
 * signature be computed before the bytes are read; R2, S3 and MinIO all take it.
 */
async function s3PutStream(key: string, sourcePath: string, mimeType: string): Promise<void> {
  const target = s3Target(key);
  const { size } = await stat(sourcePath);
  const headers = signHeaders("PUT", target, "UNSIGNED-PAYLOAD", [
    ["content-length", String(size)],
    ["content-type", mimeType],
  ]);
  const send = target.protocol === "http:" ? httpRequest : httpsRequest;
  // `host` here would be read as a bare hostname, so an endpoint with a port
  // (MinIO on :9000) fails DNS. The URL splits them; the Host header keeps both.
  const endpoint = new URL(`${target.protocol}//${target.host}`);
  await new Promise<void>((resolvePut, reject) => {
    const req = send(
      {
        method: "PUT",
        hostname: endpoint.hostname,
        port: endpoint.port || undefined,
        path: target.path,
        headers: { ...headers, host: target.host },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          if ((res.statusCode ?? 500) < 300) resolvePut();
          else reject(new Error(`storage PUT failed ${res.statusCode}: ${Buffer.concat(chunks).toString()}`));
        });
      },
    );
    req.on("error", reject);
    createReadStream(sourcePath).on("error", reject).pipe(req);
  });
}

/** A time-limited GET link for a private bucket. */
export function presignedGetUrl(key: string, expiresSec = 3600): string {
  assertKey(key);
  const target = s3Target(key);
  const { amzDate, dateStamp } = amzNow();
  const scope = `${dateStamp}/${target.region}/s3/aws4_request`;
  const query = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${target.accessKeyId}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expiresSec),
    "X-Amz-SignedHeaders": "host",
  });
  const canonicalQuery = [...query.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  const canonicalRequest = ["GET", target.path, canonicalQuery, `host:${target.host}\n`, "host", "UNSIGNED-PAYLOAD"].join(
    "\n",
  );
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonicalRequest)].join("\n");
  const signature = createHmac("sha256", signingKey(target.secretAccessKey, dateStamp, target.region))
    .update(stringToSign)
    .digest("hex");
  return `${target.protocol}//${target.host}${target.path}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}
