// Replaces packages/runtime/src/external-media-fetch.ts in the guest
// (guest/build.mjs maps the runtime's own import onto this file), so every
// media fetch in the bundled runtime code goes through the `http` host
// capability and its safeFetch policy (src/host/http.cpp). With fetching off
// (HostOptions::allowHttpFetch) it throws, as an offline fetch does.

/** A fetch Response with what media code reads from one. */
function responseOf(r) {
  const body = r.body;
  return {
    ok: r.status >= 200 && r.status < 300,
    status: r.status,
    url: r.url,
    redirected: r.url !== undefined,
    headers: {
      get: (name) => (String(name).toLowerCase() === "content-type" ? r.contentType || null : null),
      has: (name) => String(name).toLowerCase() === "content-type" && !!r.contentType
    },
    arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
    bytes: async () => body,
    text: async () => new TextDecoder().decode(body),
    json: async () => JSON.parse(new TextDecoder().decode(body))
  };
}

export function privateMediaFetchAllowed() {
  return false;
}

/** GET `uri` under the host's media policy. Other methods are refused. */
export async function fetchExternalMedia(uri, init) {
  const method = (init?.method ?? "GET").toUpperCase();
  if (method !== "GET") throw new Error(`fetch failed: the native runner fetches media with GET only, not ${method}`);
  const http = globalThis.__host?.http;
  if (!http) throw new Error("fetch failed: the http host capability is not installed");
  // During a run the fetch runs on the network lane.
  return responseOf(http.bound?.() ? await http.getAsync(String(uri)) : http.get(String(uri)));
}

export { fetchExternalMedia as safeFetch };
