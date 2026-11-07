import { fetchWithRetry } from "./http-transport.js";

const INSECURE_COMFY_CLOUD = /^http:\/\/cloud\.comfy\.org(?=[/:?#]|$)/i;

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
    if (!INSECURE_COMFY_CLOUD.test(url)) {
      return fetchWithRetry(url, init, { fetchImpl: (_url, retryInit) => fetch(request, retryInit) });
    }
    const secureUrl = url.replace(INSECURE_COMFY_CLOUD, "https://cloud.comfy.org");
    const target = new Request(secureUrl, request instanceof Request ? request : undefined);
    const headers = new Headers(target.headers);
    new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
    if (apiKey && !headers.has("authorization")) {headers.set("Authorization", `Bearer ${apiKey}`);}
    const secureInit: RequestInit = { ...init, headers };
    return fetchWithRetry(secureUrl, secureInit, { fetchImpl: (_url, retryInit) => fetch(new Request(target, retryInit)) });
  };
}
