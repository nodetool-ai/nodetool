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
 * The table itself is `@nodetool-ai/runtime`'s: `isBlockedIpLiteral` in
 * `providers/safe-url.ts`, imported through the leaf subpath so the browser
 * bundle takes the module and not the rest of runtime. What stays here is the
 * *policy* this surface applies on top of it — plain http is allowed (a Code
 * node reaching an internal HTTP service is a supported thing to configure),
 * and a host may waive the address check with `allowPrivate`, which NodeTool's
 * default egress policy never does.
 *
 * The check reads the URL's host. A hostname that *resolves* to a blocked
 * address is caught by {@link assertResolvedHostAllowed}, which the caller
 * uses when it can afford a DNS round trip.
 */

import { importNodeBuiltin } from "@nodetool-ai/config";
import { isBlockedIpLiteral } from "@nodetool-ai/runtime/safe-url";

export { isBlockedIpLiteral };

/** The slice of `node:dns/promises` the default resolver uses. */
interface DnsPromises {
  lookup: (
    host: string,
    options: { all: true }
  ) => Promise<Array<{ address: string }>>;
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

/**
 * `node:dns` is loaded through `importNodeBuiltin`, never imported at the top
 * level: this module is reachable from `js-sandbox.ts`, which the browser
 * workflow-runner bundles. A static `node:dns/promises` import broke that
 * bundle outright — the harness aliases `node:dns` to an empty stub, and
 * `node:dns/promises` then resolved to a path inside that file.
 *
 * Off Node there is no resolver, and a caller that cannot resolve treats the
 * name the way an unresolvable one is treated: the literal check has already
 * run, and whoever opens the socket reports the rest.
 */
const defaultResolver: HostResolver = async (host) => {
  const dns = await importNodeBuiltin<DnsPromises>("node:dns/promises");
  if (!dns) return [];
  return (await dns.lookup(host, { all: true })).map((entry) => entry.address);
};
