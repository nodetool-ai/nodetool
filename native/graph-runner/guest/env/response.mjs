// A Response over an in-memory body, for libraries that construct or patch
// one. Streams and Blob bodies are not supported.
function bodyBytes(body) {
  if (body === null || body === undefined) return new Uint8Array(0);
  if (typeof body === "string") return new TextEncoder().encode(body);
  if (body instanceof ArrayBuffer) return new Uint8Array(body.slice(0));
  if (ArrayBuffer.isView(body)) return new Uint8Array(body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength));
  throw new TypeError("Response body must be a string, ArrayBuffer or typed array");
}

export class Response {
  #bytes;
  #headers;
  constructor(body = null, init = {}) {
    this.#bytes = bodyBytes(body);
    this.#headers = new Map(Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), String(v)]));
    this.status = init.status ?? 200;
    this.statusText = init.statusText ?? "";
    this.ok = this.status >= 200 && this.status < 300;
    this.url = "";
    this.body = null;
    const headers = this.#headers;
    this.headers = {
      get: (name) => headers.get(String(name).toLowerCase()) ?? null,
      has: (name) => headers.has(String(name).toLowerCase()),
      entries: () => headers.entries()
    };
  }
  async bytes() { return this.#bytes.slice(); }
  async arrayBuffer() { return this.#bytes.slice().buffer; }
  async text() { return new TextDecoder().decode(this.#bytes); }
  async json() { return JSON.parse(await this.text()); }
}
