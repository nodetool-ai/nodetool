/**
 * AWS credential resolution for the in-house S3 client.
 *
 * Covers the sources NodeTool actually uses:
 *  - explicit credentials passed to `S3Client`
 *  - `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_SESSION_TOKEN`
 *  - shared credentials file profiles (`~/.aws/credentials`, `AWS_PROFILE`)
 *
 * Metadata-service chains (ECS, EC2 IMDS, EKS web identity) are deliberately
 * not built in — pass a custom `credentialProvider` to `S3Client` for those
 * environments. Providers returning an `expiration` are refreshed
 * automatically shortly before they expire.
 */

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { SigV4Credentials } from "./signer.js";

export interface ResolvedCredentials extends SigV4Credentials {
  /** When set, the provider is re-invoked shortly before this time. */
  expiration?: Date;
}

export type CredentialProvider = () => Promise<ResolvedCredentials>;

/** Refresh window before `expiration` at which cached credentials are stale. */
const REFRESH_WINDOW_MS = 5 * 60_000;

export interface DefaultCredentialProviderOptions {
  /** Environment override for tests. Defaults to `process.env`. */
  env?: Record<string, string | undefined>;
  /** File reader override for tests. Defaults to `node:fs/promises` readFile. */
  readFileFn?: (path: string) => Promise<string>;
  /** Home directory override for tests. Defaults to `os.homedir()`. */
  homedirFn?: () => string;
}

function fromEnv(
  env: Record<string, string | undefined>
): ResolvedCredentials | null {
  const accessKeyId = env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = env.AWS_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) return null;
  const sessionToken = env.AWS_SESSION_TOKEN;
  return {
    accessKeyId,
    secretAccessKey,
    ...(sessionToken ? { sessionToken } : {})
  };
}

/**
 * Minimal INI parser for the AWS shared credentials file: `[section]`
 * headers, `key = value` lines, `#`/`;` comments.
 */
export function parseIniProfiles(
  text: string
): Record<string, Record<string, string>> {
  const profiles: Record<string, Record<string, string>> = {};
  let current: Record<string, string> | null = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) continue;
    const section = /^\[\s*(?:profile\s+)?([^\]]+?)\s*\]$/.exec(line);
    if (section) {
      current = profiles[section[1]] ??= {};
      continue;
    }
    if (!current) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    current[line.slice(0, eq).trim().toLowerCase()] = line.slice(eq + 1).trim();
  }
  return profiles;
}

async function fromSharedCredentialsFile(
  env: Record<string, string | undefined>,
  readFileFn: (path: string) => Promise<string>,
  homedirFn: () => string
): Promise<ResolvedCredentials | null> {
  const path =
    env.AWS_SHARED_CREDENTIALS_FILE ?? join(homedirFn(), ".aws", "credentials");
  let text: string;
  try {
    text = await readFileFn(path);
  } catch {
    return null;
  }
  const profileName = env.AWS_PROFILE ?? "default";
  const profile = parseIniProfiles(text)[profileName];
  if (!profile) return null;
  const accessKeyId = profile.aws_access_key_id;
  const secretAccessKey = profile.aws_secret_access_key;
  if (!accessKeyId || !secretAccessKey) return null;
  const sessionToken = profile.aws_session_token;
  return {
    accessKeyId,
    secretAccessKey,
    ...(sessionToken ? { sessionToken } : {})
  };
}

/**
 * The default chain: env vars, then the shared credentials file. Throws a
 * clear error (never containing secret material) when nothing resolves.
 */
export function createDefaultCredentialProvider(
  options: DefaultCredentialProviderOptions = {}
): CredentialProvider {
  const readFileFn =
    options.readFileFn ?? ((path: string) => readFile(path, "utf8"));
  const homedirFn = options.homedirFn ?? homedir;
  return async () => {
    const env = options.env ?? process.env;
    const envCreds = fromEnv(env);
    if (envCreds) return envCreds;
    const fileCreds = await fromSharedCredentialsFile(env, readFileFn, homedirFn);
    if (fileCreds) return fileCreds;
    throw new Error(
      "AWS credentials not found: set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY (and optionally AWS_SESSION_TOKEN), configure a shared credentials file profile, or pass credentials to S3Client."
    );
  };
}

/**
 * Cache a provider's result, re-invoking it once the credentials are within
 * the refresh window of their `expiration` (never, for static credentials).
 */
export function cacheCredentials(
  provider: CredentialProvider,
  nowFn: () => number = Date.now
): CredentialProvider {
  let cached: ResolvedCredentials | null = null;
  let pending: Promise<ResolvedCredentials> | null = null;
  return async () => {
    if (
      cached &&
      (!cached.expiration ||
        nowFn() < cached.expiration.getTime() - REFRESH_WINDOW_MS)
    ) {
      return cached;
    }
    pending ??= provider().then(
      (creds) => {
        cached = creds;
        pending = null;
        return creds;
      },
      (err: unknown) => {
        pending = null;
        throw err;
      }
    );
    return pending;
  };
}
