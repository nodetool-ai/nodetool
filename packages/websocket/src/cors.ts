/**
 * CORS origin allow-listing.
 *
 * Cross-origin requests are restricted to a configured set of origins
 * instead of reflecting whatever `Origin` the caller sends. Reflecting any
 * origin (`origin: true`) or hardcoding `Access-Control-Allow-Origin: *`
 * turns the server into a CSRF / data-exfiltration surface once requests
 * carry credentials, so the allow-list is the single source of truth for
 * both the global `fastifyCors` plugin and the hand-rolled CORS headers on
 * the storage and MCP endpoints.
 *
 * Defaults cover the known web dev server and the server's own origin
 * (localhost / 127.0.0.1 / [::1] on any port), the Electron renderer
 * (`file://`), and the first-party NodeTool product domains
 * (`https://nodetool.ai` and its subdomains, e.g. `app.nodetool.ai`).
 * Additional origins are granted via the `NODETOOL_ALLOWED_ORIGINS` env var
 * (comma-separated). Set it to `*` to restore allow-all behaviour for trusted
 * deployments fronted by their own gateway.
 */
import { getEnv } from "@nodetool-ai/config";

/**
 * Origins always permitted: localhost/127.0.0.1/[::1] (any port), Electron
 * file://, and the first-party `nodetool.ai` product domains over HTTPS.
 */
const DEFAULT_ALLOWED_ORIGIN_PATTERNS: RegExp[] = [
  /^https?:\/\/localhost(?::\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(?::\d+)?$/,
  /^https?:\/\/\[::1\](?::\d+)?$/,
  // Electron renderer requests that carry a literal `file://` origin. (A
  // `file://` document that sends `Origin: null` is handled by the
  // missing-origin branch in isOriginAllowed, not this pattern.)
  /^file:\/\//,
  // First-party NodeTool product: https://nodetool.ai and any subdomain
  // (app.nodetool.ai, api.nodetool.ai, …). HTTPS only — no port allowed so a
  // look-alike like `nodetool.ai.evil.com` cannot match.
  /^https:\/\/([a-z0-9-]+\.)*nodetool\.ai$/
];

interface CorsConfig {
  allowAll: boolean;
  exact: Set<string>;
}

let cachedConfig: CorsConfig | null = null;

function loadConfig(): CorsConfig {
  if (cachedConfig) return cachedConfig;
  const raw = getEnv("NODETOOL_ALLOWED_ORIGINS", "")?.trim() ?? "";
  const entries = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  cachedConfig = {
    allowAll: entries.includes("*"),
    exact: new Set(entries.filter((e) => e !== "*"))
  };
  return cachedConfig;
}

/** Reset cached config — for tests that mutate `NODETOOL_ALLOWED_ORIGINS`. */
export function resetCorsConfig(): void {
  cachedConfig = null;
}

/**
 * Whether a request `Origin` is permitted. A missing origin (non-browser
 * clients, same-origin navigations) is allowed — there is no browser
 * enforcing CORS in that case, so nothing to gate.
 */
export function isOriginAllowed(origin: string | undefined | null): boolean {
  if (!origin) return true;
  const { allowAll, exact } = loadConfig();
  if (allowAll) return true;
  if (exact.has(origin)) return true;
  return DEFAULT_ALLOWED_ORIGIN_PATTERNS.some((re) => re.test(origin));
}

/**
 * Resolve the `Access-Control-Allow-Origin` value for a request `Origin`.
 * Returns the origin to reflect when it is allowed, or `null` to omit the
 * header entirely (a disallowed origin gets no ACAO, so the browser blocks
 * the cross-origin read).
 */
export function resolveAllowedOrigin(
  origin: string | undefined | null
): string | null {
  if (!origin) return null;
  return isOriginAllowed(origin) ? origin : null;
}

/**
 * `@fastify/cors` origin delegate. Permits allow-listed origins (the plugin
 * reflects them) and rejects everything else, replacing the previous
 * `origin: true` (reflect-any) configuration.
 */
export function corsOriginDelegate(
  origin: string | undefined,
  cb: (err: Error | null, allow: boolean) => void
): void {
  cb(null, isOriginAllowed(origin));
}
