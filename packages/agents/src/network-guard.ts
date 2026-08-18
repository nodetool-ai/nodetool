/**
 * Which network addresses untrusted code may reach.
 *
 * Guest JavaScript and the host binaries it drives run inside the server, so
 * "fetch this URL" is a request to open a socket from a process that sits
 * behind the cloud's perimeter. The address that matters most is
 * `169.254.169.254`, the instance metadata service, but loopback, the private
 * ranges, CGNAT and the IPv6 spellings of all of them reach the same class of
 * thing: services that trusted the network instead of the caller.
 *
 * This lives apart from `js-sandbox.ts` because the fetch bridge is no longer
 * the only caller: `yt_dlp` hands a URL to a downloader that opens its own
 * sockets, and one wrong answer there is the same breach. One table, one
 * predicate, both surfaces.
 *
 * The check reads the URL's host. A hostname that *resolves* to a blocked
 * address is caught by {@link assertResolvedHostAllowed}, which the caller
 * uses when it can afford a DNS round trip.
 */

import { lookup as dnsLookup } from "node:dns/promises";

/** True if the first two octets of an IPv4 address fall in a blocked range. */
function isBlockedV4(a: number, b: number): boolean {
  if (a === 127 || a === 10 || a === 0) return true; // loopback, private, this-host
  if (a === 169 && b === 254) return true; // link-local incl. 169.254.169.254 metadata
  if (a === 192 && b === 168) return true; // private
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking 198.18.0.0/15
  return false;
}

/**
 * Expand an IPv6 literal (hex form, `::` allowed) to its eight 16-bit hextets.
 * Returns null when the input is not a well-formed pure-hex IPv6 address —
 * dotted-quad tails are handled by the caller's IPv4 path, not here.
 */
function expandIpv6(h: string): number[] | null {
  if (!h.includes(":")) return null;
  const parts = h.split("::");
  if (parts.length > 2) return null;
  const head = parts[0] ? parts[0].split(":") : [];
  const tail =
    parts.length === 2 ? (parts[1] ? parts[1].split(":") : []) : null;
  let hextets: string[];
  if (tail === null) {
    hextets = head;
  } else {
    const missing = 8 - head.length - tail.length;
    if (missing < 0) return null;
    hextets = [...head, ...new Array<string>(missing).fill("0"), ...tail];
  }
  if (hextets.length !== 8) return null;
  const nums = hextets.map((x) => parseInt(x || "0", 16));
  if (nums.some((n) => !Number.isFinite(n) || n < 0 || n > 0xffff)) return null;
  return nums;
}

/**
 * Extract the first two octets of an IPv4 address embedded in a hex-serialized
 * IPv6 literal — the WHATWG URL parser rewrites `::ffff:127.0.0.1` to
 * `::ffff:7f00:1`, so the dotted regex no longer matches. Covers IPv4-mapped
 * (`::ffff:x:x`, incl. the full `0:0:0:0:0:ffff:x:x`), IPv4-compatible
 * (`::a.b.c.d`, deprecated) and NAT64 (`64:ff9b::/96`). Returns null when no
 * embedded v4 is present.
 */
function embeddedV4FromHexIpv6(h: string): [number, number] | null {
  const nums = expandIpv6(h);
  if (!nums) return null;
  const isZero = (from: number, to: number): boolean =>
    nums.slice(from, to).every((n) => n === 0);
  const octets = (): [number, number] => [
    (nums[6] >> 8) & 0xff,
    nums[6] & 0xff
  ];
  if (isZero(0, 5) && nums[5] === 0xffff) return octets(); // ::ffff:a.b.c.d
  if (isZero(0, 6)) return octets(); // ::a.b.c.d (IPv4-compatible, deprecated)
  if (nums[0] === 0x64 && nums[1] === 0xff9b && isZero(2, 6)) return octets(); // 64:ff9b::/96
  return null;
}

/** True if a literal IPv4/IPv6 host is loopback, link-local, or private. */
export function isBlockedIpLiteral(host: string): boolean {
  // Strip IPv6 brackets/zone id.
  const h = host
    .replace(/^\[|\]$/g, "")
    .split("%")[0]
    .toLowerCase();
  // IPv4, dotted form (incl. an IPv4-mapped IPv6 tail like ::ffff:127.0.0.1).
  const v4 = h.match(/(?:^|:)((?:\d{1,3}\.){3}\d{1,3})$/);
  if (v4) {
    const [a, b] = v4[1].split(".").map(Number);
    return isBlockedV4(a, b);
  }
  // IPv4 embedded in a hex-serialized IPv6 literal — ::ffff:7f00:1 (mapped) and
  // 64:ff9b::a9fe:a9fe (NAT64). These match neither the v4 regex nor the plain
  // IPv6 checks below, so without this an ::ffff:169.254.169.254 metadata fetch
  // slips through.
  const embedded = embeddedV4FromHexIpv6(h);
  if (embedded) return isBlockedV4(embedded[0], embedded[1]);
  // Plain IPv6.
  if (h === "::1" || h === "::") return true; // loopback / unspecified
  // Link-local fe80::/10 spans fe80::–febf::, so the first three hex digits are
  // fe8/fe9/fea/feb — "fe80" alone is too narrow.
  if (/^fe[89ab]/.test(h)) return true;
  if (h.startsWith("fc") || h.startsWith("fd")) return true; // unique-local fc00::/7
  return false;
}

/**
 * SSRF allow-check for the sandbox fetch bridge. Rejects non-http(s) schemes
 * and hosts that resolve to loopback/link-local/private literals or localhost.
 * Throws on a blocked URL.
 */
export function assertFetchUrlAllowed(url: string, allowPrivate = false): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("fetch: invalid URL");
  }
  // Scheme is checked even in private-network mode: `file:`, `gopher:` and
  // friends are never reachable through the bridge, whatever the host allows.
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`fetch: unsupported scheme "${parsed.protocol}"`);
  }
  if (allowPrivate) return;
  const host = parsed.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) {
    throw new Error("fetch: access to localhost is blocked");
  }
  if (isBlockedIpLiteral(host)) {
    throw new Error(
      `fetch: access to internal/private address "${host}" is blocked`
    );
  }
}


/**
 * Refuse a URL whose hostname resolves to a blocked address, on top of the
 * literal check {@link assertFetchUrlAllowed} makes.
 *
 * A literal check answers `metadata.example.com` with "that is not an IP", and
 * the name resolves to `169.254.169.254` a millisecond later. Resolving here
 * closes the ordinary case. It does not close every case — the process we hand
 * the URL to resolves again (so a record that changes between the two answers
 * wins) and follows its own redirects — which is why this is one layer, not
 * the boundary. `label` names the caller in the refusal.
 */
export async function assertResolvedHostAllowed(
  url: string,
  label: string,
  resolve: HostResolver = defaultResolver
): Promise<void> {
  const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
  // A literal needs no resolution; assertFetchUrlAllowed already judged it.
  if (/^[\d.]+$/.test(host) || host.includes(":")) return;
  let addresses: string[];
  try {
    addresses = await resolve(host);
  } catch {
    // A name that does not resolve is the downloader's error to report, with
    // its own message, not ours to guess at.
    return;
  }
  const blocked = addresses.find((address) => isBlockedIpLiteral(address));
  if (blocked !== undefined) {
    throw new Error(
      `${label}: "${host}" resolves to the internal address "${blocked}", which is blocked`
    );
  }
}

/** How {@link assertResolvedHostAllowed} turns a hostname into addresses. */
export type HostResolver = (host: string) => Promise<string[]>;

const defaultResolver: HostResolver = async (host) =>
  (await dnsLookup(host, { all: true })).map((entry) => entry.address);
