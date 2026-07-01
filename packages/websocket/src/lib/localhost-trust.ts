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

/**
 * Parse `NODETOOL_TRUST_LOCAL_NETWORKS` into a list of source CIDRs whose
 * connections are trusted to run as the local user in Local mode without a
 * token. Same comma-separated shape as {@link parseTrustedProxies}.
 *
 * This exists because Docker (and other NAT topologies) rewrite the source of a
 * published-port connection to the bridge gateway (e.g. 172.17.0.1), so the
 * request never arrives from loopback and the {@link isLoopbackAddress} bypass
 * can't fire. Trusting the bridge range restores the "single local user" model
 * for containerized self-hosting.
 */
export function parseTrustedLocalNetworks(value: string | undefined): string[] {
  return parseTrustedProxies(value);
}

/** Parse a dotted-quad IPv4 string to a 32-bit integer, or null if malformed. */
function ipv4ToInt(ip: string | null): number | null {
  if (!ip) return null;
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const parts = m.slice(1).map((n) => Number(n));
  if (parts.some((p) => p > 255)) return null;
  return (
    (parts[0] * 2 ** 24 + parts[1] * 2 ** 16 + parts[2] * 2 ** 8 + parts[3]) >>>
    0
  );
}

/**
 * Reduce an address to its dotted-quad IPv4 form when possible, unwrapping the
 * IPv4-mapped IPv6 form Node often reports for bridged connections
 * (`::ffff:172.17.0.1` → `172.17.0.1`). Returns null for genuine IPv6.
 */
function toIpv4(ip: string): string | null {
  const addr = ip.trim().toLowerCase();
  const mapped = addr.startsWith("::ffff:") ? addr.slice(7) : addr;
  return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(mapped) ? mapped : null;
}

/**
 * Whether `ip` falls inside `cidr`. Supports IPv4 CIDRs (and IPv4-mapped IPv6
 * peers), a bare IP as a /32, and the `0.0.0.0/0` / `::/0` wildcards that match
 * everything. Genuine IPv6 is matched only by exact (normalized) equality.
 */
export function isIpInCidr(ip: string | undefined | null, cidr: string): boolean {
  if (!ip) return false;
  const c = cidr.trim().toLowerCase();
  if (!c) return false;
  if (c === "0.0.0.0/0" || c === "::/0") return true;

  const slash = c.indexOf("/");
  const range = slash === -1 ? c : c.slice(0, slash);
  const prefixStr = slash === -1 ? null : c.slice(slash + 1);

  const ipInt = ipv4ToInt(toIpv4(ip));
  const rangeInt = ipv4ToInt(toIpv4(range));
  if (ipInt !== null && rangeInt !== null) {
    const prefix = prefixStr === null ? 32 : Number(prefixStr);
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    return ((ipInt ^ rangeInt) & mask) === 0;
  }

  // Not an IPv4 CIDR — fall back to exact IPv6 match (prefix ignored).
  return ip.trim().toLowerCase() === range;
}

/** True when `ip` matches any of the trusted source `networks` (CIDRs/IPs). */
export function isTrustedLocalAddress(
  ip: string | undefined | null,
  networks: string[]
): boolean {
  return networks.some((cidr) => isIpInCidr(ip, cidr));
}
