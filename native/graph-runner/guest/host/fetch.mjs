import { fetchExternalMedia } from "./media-fetch.mjs";
import { fromJson, toJson } from "../values.mjs";
export function installFetch() {
  globalThis.fetch ??= async (url, options = {}) => {
    options.signal?.throwIfAborted();
    const host = globalThis.__host?.context;
    if (!host?.has("http:request")) {
      const response = await fetchExternalMedia(url, options);
      response.body = null;
      response.statusText = "";
      response.headers.entries = () =>
        [["content-type", response.headers.get("content-type") ?? ""]][
          Symbol.iterator
        ]();
      return response;
    }
    const result = fromJson(
      host.call(
        "http:request",
        toJson({
          url: String(url),
          method: options.method ?? "GET",
          headers: options.headers ?? {},
          body: options.body ?? null,
          redirect: options.redirect ?? "follow"
        })
      )
    );
    options.signal?.throwIfAborted();
    return hostResponse(result, String(url));
  };
}

export function hostResponse(result, url = "") {
  const headers = new Map(
    Object.entries(result.headers ?? {}).map(([k, v]) => [
      k.toLowerCase(),
      String(v)
    ])
  );
  const bytes =
    result.body instanceof Uint8Array
      ? result.body
      : new TextEncoder().encode(result.body ?? "");
  return {
    ok: result.status >= 200 && result.status < 300,
    status: result.status,
    statusText: result.statusText ?? "",
    url: result.url ?? url,
    headers: {
      get: (name) => headers.get(name.toLowerCase()) ?? null,
      entries: () => headers.entries()
    },
    body: null,
    bytes: async () => bytes.slice(),
    text: async () => new TextDecoder().decode(bytes),
    json: async () => JSON.parse(new TextDecoder().decode(bytes)),
    arrayBuffer: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  };
}
