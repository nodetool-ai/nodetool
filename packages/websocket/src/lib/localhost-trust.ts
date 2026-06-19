/**
 * Helpers for deciding whether a connection may bypass authentication because
 * it originates from the local host.
 *
 * The naive "trust anything from 127.0.0.1/::1" rule is dangerous behind a
 * reverse proxy, container network, or SSH tunnel: in those topologies the
 * proxy itself connects from loopback, so a blanket localhost bypass silently
 * disables auth in exactly the deployment where it is needed. These helpers
 * make the trust explicit and opt-in, and keep X-Forwarded-For parsing scoped
 * to a configured set of proxies.
 */

/**
 * Parse a boolean-ish environment variable.
 *
 * Returns `undefined` when the variable is unset, empty, or unrecognized so the
 * caller can apply its own default.
 */
export function parseBoolEnv(value: string | undefined): boolean | undefined {
  if (value == null) return undefined;
  const v = value.trim().toLowerCase();
  if (v === "") return undefined;
  if (v === "1" || v === "true" || v === "yes" || v === "on") return true;
  if (v === "0" || v === "false" || v === "no" || v === "off") return false;
  return undefined;
}

/** True when `ip` is an IPv4 or IPv6 loopback address. */
export function isLoopbackAddress(ip: string | undefined | null): boolean {
  if (!ip) return false;
  const addr = ip.trim().toLowerCase();
  return (
    addr === "::1" ||
    addr === "::ffff:127.0.0.1" ||
    // Whole 127.0.0.0/8 block is loopback.
    addr.startsWith("127.") ||
    addr.startsWith("::ffff:127.")
  );
}

/**
 * Resolve whether loopback connections should bypass authentication.
 *
 * - An explicit `NODETOOL_TRUST_LOCALHOST` value (true/false) always wins.
 * - Otherwise the bypass defaults OFF whenever auth is enforced — so a
 *   reverse-proxied/containerized deployment doesn't silently accept every
 *   request — and ON when auth is not enforced (local desktop/dev).
 */
export function resolveTrustLocalhost(opts: {
  envValue: string | undefined;
  enforceAuth: boolean;
}): boolean {
  const explicit = parseBoolEnv(opts.envValue);
  if (explicit !== undefined) return explicit;
  return !opts.enforceAuth;
}

/**
 * Parse `NODETOOL_TRUSTED_PROXIES` into a list of IPs/CIDRs suitable for
 * Fastify's `trustProxy` option. Empty input means no proxy is trusted, so
 * X-Forwarded-For is ignored and the socket peer address is used instead.
 */
export function parseTrustedProxies(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
