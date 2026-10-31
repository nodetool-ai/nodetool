/**
 * Google Cloud OAuth access tokens for Vertex AI.
 *
 * Two credential files are accepted, in the JSON formats Google itself writes:
 *
 * - `service_account`: a key downloaded from IAM. The token is minted with a
 *   self-signed RS256 JWT exchanged at the key's `token_uri`.
 * - `authorized_user`: what `gcloud auth application-default login` writes.
 *   The token is minted from its refresh token.
 *
 * {@link readApplicationDefaultCredentials} finds the machine's own file the
 * way Google's client libraries do: `GOOGLE_APPLICATION_CREDENTIALS`, then
 * gcloud's well-known location. The GCE metadata server and workload identity
 * federation are not supported.
 *
 * Tokens are cached per credential across provider instances, because the
 * registry builds a fresh provider for every call.
 */

import { importNodeBuiltin } from "@nodetool-ai/config";
import { z } from "zod";

/** The one scope Vertex AI requires. */
export const GOOGLE_CLOUD_PLATFORM_SCOPE =
  "https://www.googleapis.com/auth/cloud-platform";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

/** Treat a token expiring within this window as already expired. */
const EXPIRY_SKEW_MS = 60_000;

/** Lifetime asked for in a service-account assertion, the maximum Google allows. */
const ASSERTION_LIFETIME_S = 3600;

const serviceAccountSchema = z.object({
  type: z.literal("service_account"),
  client_email: z.string().min(1),
  private_key: z.string().min(1),
  private_key_id: z.string().optional(),
  project_id: z.string().optional(),
  /** Ignored: tokens always come from Google's endpoint, never a URL the file names. */
  token_uri: z.string().optional()
});

const authorizedUserSchema = z.object({
  type: z.literal("authorized_user"),
  client_id: z.string().min(1),
  client_secret: z.string().min(1),
  refresh_token: z.string().min(1),
  quota_project_id: z.string().optional()
});

const credentialsSchema = z.discriminatedUnion("type", [
  serviceAccountSchema,
  authorizedUserSchema
]);

/** Only the `type` of a file that is not a supported credential, for the error. */
const credentialTypeSchema = z.object({ type: z.string() });

/** Google's token endpoint answer, success or OAuth error. */
const tokenResponseSchema = z.object({
  access_token: z.string().optional(),
  expires_in: z.number().optional(),
  error: z.string().optional(),
  error_description: z.string().optional()
});

export type GoogleCredentials = z.infer<typeof credentialsSchema>;

/** A credential that could not be read or used. The message names the fix. */
export class GoogleCredentialsError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "GoogleCredentialsError";
  }
}

/** Parse a service-account or authorized-user JSON file. */
export function parseGoogleCredentials(json: string): GoogleCredentials {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (error) {
    throw new GoogleCredentialsError(
      "Google Cloud credentials are not valid JSON. Paste the whole service account key file.",
      { cause: error }
    );
  }
  const parsed = credentialsSchema.safeParse(raw);
  if (!parsed.success) {
    const type = credentialTypeSchema.safeParse(raw).data?.type ?? "missing";
    throw new GoogleCredentialsError(
      `Unsupported Google Cloud credentials (type: ${type}). Use a service account key or run \`gcloud auth application-default login\`.`
    );
  }
  return parsed.data;
}

/** The project a credential file names, if any. */
export function credentialsProject(
  credentials: GoogleCredentials
): string | undefined {
  return credentials.type === "service_account"
    ? credentials.project_id
    : credentials.quota_project_id;
}

/**
 * Read the machine's Application Default Credentials file, or null when there
 * is none. Returns null outside Node.
 */
export async function readApplicationDefaultCredentials(
  env: Record<string, string | undefined> = process.env
): Promise<GoogleCredentials | null> {
  const [fs, os, path] = await Promise.all([
    importNodeBuiltin<typeof import("node:fs/promises")>("node:fs/promises"),
    importNodeBuiltin<typeof import("node:os")>("node:os"),
    importNodeBuiltin<typeof import("node:path")>("node:path")
  ]);
  if (!fs || !os || !path) return null;

  const explicit = env["GOOGLE_APPLICATION_CREDENTIALS"];
  const file =
    explicit ||
    (process.platform === "win32"
      ? path.join(env["APPDATA"] ?? os.homedir(), "gcloud", "application_default_credentials.json")
      : path.join(
          env["CLOUDSDK_CONFIG"] ?? path.join(os.homedir(), ".config", "gcloud"),
          "application_default_credentials.json"
        ));

  let text: string;
  try {
    text = await fs.readFile(file, "utf8");
  } catch (error) {
    if (explicit) {
      throw new GoogleCredentialsError(
        `Could not read GOOGLE_APPLICATION_CREDENTIALS (${explicit}).`,
        { cause: error }
      );
    }
    return null;
  }
  return parseGoogleCredentials(text);
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

/** Credential identity -> its current token. */
const tokenCache = new Map<string, CachedToken>();
/** One mint per credential at a time. */
const inFlight = new Map<string, Promise<CachedToken>>();

/** Forget every cached token. For tests. */
export function clearGoogleTokenCache(): void {
  tokenCache.clear();
  inFlight.clear();
}

function cacheKey(credentials: GoogleCredentials): string {
  return credentials.type === "service_account"
    ? `sa:${credentials.client_email}:${credentials.private_key_id ?? ""}`
    : `user:${credentials.client_id}:${credentials.refresh_token}`;
}

export interface GoogleTokenOptions {
  fetchFn?: typeof fetch;
  now?: () => number;
}

/** A valid access token for `credentials`, minted or refreshed as needed. */
export async function getGoogleAccessToken(
  credentials: GoogleCredentials,
  options: GoogleTokenOptions = {}
): Promise<string> {
  const now = options.now ?? Date.now;
  const key = cacheKey(credentials);
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt - EXPIRY_SKEW_MS > now()) return cached.token;

  let pending = inFlight.get(key);
  if (!pending) {
    pending = mintToken(credentials, options.fetchFn ?? fetch, now).finally(
      () => inFlight.delete(key)
    );
    inFlight.set(key, pending);
  }
  const minted = await pending;
  tokenCache.set(key, minted);
  return minted.token;
}

async function mintToken(
  credentials: GoogleCredentials,
  fetchFn: typeof fetch,
  now: () => number
): Promise<CachedToken> {
  const issuedAt = now();
  const tokenUrl = GOOGLE_TOKEN_URL;
  const body =
    credentials.type === "service_account"
      ? new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
          assertion: await signServiceAccountAssertion(
            credentials,
            tokenUrl,
            Math.floor(issuedAt / 1000)
          )
        })
      : new URLSearchParams({
          grant_type: "refresh_token",
          client_id: credentials.client_id,
          client_secret: credentials.client_secret,
          refresh_token: credentials.refresh_token
        });

  const response = await fetchFn(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString()
  });
  const payload =
    tokenResponseSchema.safeParse(await response.json().catch(() => null))
      .data ?? {};
  if (!response.ok || !payload.access_token) {
    // Google's token errors carry no secret material, only a code and a hint.
    const reason =
      payload.error_description ?? payload.error ?? `HTTP ${response.status}`;
    const fix =
      credentials.type === "authorized_user"
        ? " Run `gcloud auth application-default login` again."
        : " Check that the service account key is still active.";
    throw new GoogleCredentialsError(
      `Google Cloud sign-in failed: ${reason.replace(/\.$/, "")}.${fix}`
    );
  }
  const lifetimeS = payload.expires_in ?? 3600;
  return {
    token: payload.access_token,
    expiresAt: issuedAt + lifetimeS * 1000
  };
}

function base64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

interface JwtHeader {
  alg: "RS256";
  typ: "JWT";
  kid?: string;
}

interface JwtClaims {
  iss: string;
  scope: string;
  aud: string;
  iat: number;
  exp: number;
}

function base64UrlJson(value: JwtHeader | JwtClaims): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

/** The RS256 JWT a service account exchanges for an access token. */
export async function signServiceAccountAssertion(
  credentials: Extract<GoogleCredentials, { type: "service_account" }>,
  audience: string,
  issuedAtS: number
): Promise<string> {
  const header: JwtHeader = credentials.private_key_id
    ? { alg: "RS256", typ: "JWT", kid: credentials.private_key_id }
    : { alg: "RS256", typ: "JWT" };
  const claims: JwtClaims = {
    iss: credentials.client_email,
    scope: GOOGLE_CLOUD_PLATFORM_SCOPE,
    aud: audience,
    iat: issuedAtS,
    exp: issuedAtS + ASSERTION_LIFETIME_S
  };
  const signingInput = `${base64UrlJson(header)}.${base64UrlJson(claims)}`;

  const pem = credentials.private_key.replace(/\\n/g, "\n");
  const der = Buffer.from(
    pem
      .replace(/-----BEGIN PRIVATE KEY-----/, "")
      .replace(/-----END PRIVATE KEY-----/, "")
      .replace(/\s+/g, ""),
    "base64"
  );
  let key: CryptoKey;
  try {
    key = await globalThis.crypto.subtle.importKey(
      "pkcs8",
      der,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"]
    );
  } catch (error) {
    throw new GoogleCredentialsError(
      "The service account key's private_key could not be read.",
      { cause: error }
    );
  }
  const signature = await globalThis.crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    Buffer.from(signingInput, "utf8")
  );
  return `${signingInput}.${base64Url(new Uint8Array(signature))}`;
}
