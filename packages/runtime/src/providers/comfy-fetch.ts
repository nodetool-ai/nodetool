import { fetchWithRetry } from "./http-transport.js";

function upgradeComfyCloudUrl(raw: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (
    parsed.protocol !== "http:" ||
    parsed.hostname.toLowerCase() !== "cloud.comfy.org" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.port !== ""
  ) {
    return null;
  }
  parsed.protocol = "https:";
  return parsed.toString();
}

/**
 * Fetch for `@comfyorg/sdk` clients. Comfy Cloud returns job links as
 * `http://cloud.comfy.org/...`. The SDK treats that as a foreign origin and
 * sends no key, so every poll fails with "Missing or invalid API key".
 * Upgrade the link to https and attach the key again. The key only goes to
 * `https://cloud.comfy.org`.
 */
export function comfyCloudFetch(apiKey: string): (request: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
  return (request, init) => {
    const url = request instanceof Request ? request.url : String(request);
    const secureUrl = upgradeComfyCloudUrl(url);
    if (!secureUrl) {
      return fetchWithRetry(url, init, { fetchImpl: (_url, retryInit) => fetch(request, retryInit) });
    }
    const target = new Request(secureUrl, request instanceof Request ? request : undefined);
    const headers = new Headers(target.headers);
    new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
    if (apiKey && !headers.has("authorization")) {headers.set("Authorization", `Bearer ${apiKey}`);}
    const secureInit: RequestInit = { ...init, headers };
    return fetchWithRetry(secureUrl, secureInit, { fetchImpl: (_url, retryInit) => fetch(new Request(target, retryInit)) });
  };
}
