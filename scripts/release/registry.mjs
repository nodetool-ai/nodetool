import { createHash } from "node:crypto";
import { setTimeout } from "node:timers/promises";

export const REGISTRY_READINESS_MS = 600_000;
const TRANSIENT_STATUSES = new Set([404, 408, 429, 500, 502, 503, 504]);

/** Bound publication visibility waits without retrying validation failures. */
export async function loadRegistryResponse(url, {
  fetchImpl = fetch, sleep = setTimeout, now = Date.now,
  deadline = now() + REGISTRY_READINESS_MS, maxAttempts = 61, retryDelayMs = 10_000
} = {}) {
  const endpoint = new URL(url);
  if (endpoint.protocol !== "https:" || endpoint.hostname !== "registry.npmjs.org" ||
      endpoint.port || endpoint.username || endpoint.password) {
    throw new Error(`Unexpected npm registry endpoint: ${endpoint.origin}`);
  }
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const remaining = deadline - now();
    if (remaining <= 0) { throw new Error(`npm registry readiness deadline exceeded: ${endpoint.pathname}`); }
    const response = await fetchImpl(endpoint.href, {
      signal: AbortSignal.timeout(Math.min(30_000, remaining)), redirect: "error"
    });
    if (response.ok) { return response; }
    await response.body?.cancel();
    if (!TRANSIENT_STATUSES.has(response.status) || attempt === maxAttempts || deadline - now() <= retryDelayMs) {
      throw new Error(`npm registry returned HTTP ${response.status}: ${endpoint.pathname}`);
    }
    await sleep(retryDelayMs);
  }
  throw new Error("npm registry readiness attempts exhausted");
}

export async function loadRegistryJson(url, options) {
  return (await loadRegistryResponse(url, options)).json();
}

/** The package index can remain stale after npm accepts this immutable version. */
export async function loadRegistryDist(pin, options) {
  const manifest = await loadRegistryJson(
    `https://registry.npmjs.org/${encodeURIComponent(pin.name)}/${encodeURIComponent(pin.version)}`, options
  );
  if (manifest?.name !== pin.name || manifest?.version !== pin.version || !manifest.dist) {
    throw new Error(`Registry version identity differs: ${pin.name}@${pin.version}`);
  }
  return manifest.dist;
}

/** Metadata can propagate before the immutable tarball reaches npm's CDN. */
export async function verifyRegistryTarball(pin, dist, options) {
  const response = await loadRegistryResponse(dist.tarball, options);
  const hash = createHash("sha512");
  for await (const chunk of response.body) { hash.update(chunk); }
  const integrity = `sha512-${hash.digest("base64")}`;
  if (integrity !== pin.integrity) {
    throw new Error(`Registry tarball integrity differs from release pin: ${pin.name}@${pin.version}`);
  }
}
