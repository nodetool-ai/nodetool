import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { NodeClass } from "@nodetool-ai/node-sdk";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const TIMEOUT = 30000;

async function httpRequest(
  url: string,
  method: string,
  headers: Record<string, string>,
  body?: string
): Promise<Response> {
  if (!url) throw new Error("URL is required");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    return await fetch(url, {
      method,
      headers: { "User-Agent": USER_AGENT, ...headers },
      body,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

export class HttpGetTextNode extends BaseNode {
  static readonly nodeType = "lib.http.GetText";
  static readonly title = "HTTP GET Text";
  static readonly description =
    "Fetch text content from a URL.\n    http, get, text, fetch, request, api";
  static readonly metadataOutputTypes = {
    output: "str",
    status: "int"
  };
  static readonly exposeAsTool = true;

  @prop({ type: "str", default: "", title: "URL", description: "URL to fetch" })
  declare url: any;

  @prop({
    type: "str",
    default: "",
    title: "Headers JSON",
    description: "Optional JSON object of request headers"
  })
  declare headers: any;

  async process(): Promise<Record<string, unknown>> {
    const headers = parseHeaders(this.headers);
    const res = await httpRequest(String(this.url ?? ""), "GET", headers);
    return { output: await res.text(), status: res.status };
  }
}

export class HttpGetJsonNode extends BaseNode {
  static readonly nodeType = "lib.http.GetJSON";
  static readonly title = "HTTP GET JSON";
  static readonly description =
    "Fetch and parse JSON from a URL.\n    http, get, json, fetch, request, api";
  static readonly metadataOutputTypes = {
    output: "any",
    status: "int"
  };
  static readonly exposeAsTool = true;

  @prop({ type: "str", default: "", title: "URL", description: "URL to fetch" })
  declare url: any;

  @prop({
    type: "str",
    default: "",
    title: "Headers JSON",
    description: "Optional JSON object of request headers"
  })
  declare headers: any;

  async process(): Promise<Record<string, unknown>> {
    const headers = parseHeaders(this.headers);
    headers["Accept"] = headers["Accept"] || "application/json";
    const res = await httpRequest(String(this.url ?? ""), "GET", headers);
    const json = await res.json();
    return { output: json, status: res.status };
  }
}

export class HttpGetBytesNode extends BaseNode {
  static readonly nodeType = "lib.http.GetBytes";
  static readonly title = "HTTP GET Bytes";
  static readonly description =
    "Download binary data from a URL.\n    http, get, bytes, binary, download, fetch";
  static readonly metadataOutputTypes = {
    output: "bytes",
    status: "int"
  };
  static readonly exposeAsTool = true;

  @prop({ type: "str", default: "", title: "URL", description: "URL to fetch" })
  declare url: any;

  @prop({
    type: "str",
    default: "",
    title: "Headers JSON",
    description: "Optional JSON object of request headers"
  })
  declare headers: any;

  async process(): Promise<Record<string, unknown>> {
    const headers = parseHeaders(this.headers);
    const res = await httpRequest(String(this.url ?? ""), "GET", headers);
    const bytes = new Uint8Array(await res.arrayBuffer());
    return { output: bytes, status: res.status };
  }
}

// ---------------------------------------------------------------------------
// POST / PUT / PATCH / DELETE
// ---------------------------------------------------------------------------

export class HttpPostNode extends BaseNode {
  static readonly nodeType = "lib.http.Post";
  static readonly title = "HTTP POST";
  static readonly description =
    "Send a POST request with JSON body.\n    http, post, request, api, send";
  static readonly metadataOutputTypes = {
    output: "any",
    status: "int"
  };
  static readonly exposeAsTool = true;

  @prop({ type: "str", default: "", title: "URL", description: "URL to send to" })
  declare url: any;

  @prop({ type: "any", default: null, title: "Body", description: "Request body (will be JSON-encoded)" })
  declare body: any;

  @prop({ type: "str", default: "", title: "Headers JSON", description: "Optional JSON object of request headers" })
  declare headers: any;

  async process(): Promise<Record<string, unknown>> {
    const headers = parseHeaders(this.headers);
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
    const bodyStr = this.body != null ? JSON.stringify(this.body) : undefined;
    const res = await httpRequest(String(this.url ?? ""), "POST", headers, bodyStr);
    const text = await res.text();
    let json: unknown;
    try { json = JSON.parse(text); } catch { json = text; }
    return { output: json, status: res.status };
  }
}

export class HttpPutNode extends BaseNode {
  static readonly nodeType = "lib.http.Put";
  static readonly title = "HTTP PUT";
  static readonly description =
    "Send a PUT request with JSON body.\n    http, put, update, request, api";
  static readonly metadataOutputTypes = {
    output: "any",
    status: "int"
  };
  static readonly exposeAsTool = true;

  @prop({ type: "str", default: "", title: "URL", description: "URL to update" })
  declare url: any;

  @prop({ type: "any", default: null, title: "Body", description: "Request body (will be JSON-encoded)" })
  declare body: any;

  @prop({ type: "str", default: "", title: "Headers JSON", description: "Optional JSON object of request headers" })
  declare headers: any;

  async process(): Promise<Record<string, unknown>> {
    const headers = parseHeaders(this.headers);
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
    const bodyStr = this.body != null ? JSON.stringify(this.body) : undefined;
    const res = await httpRequest(String(this.url ?? ""), "PUT", headers, bodyStr);
    const text = await res.text();
    let json: unknown;
    try { json = JSON.parse(text); } catch { json = text; }
    return { output: json, status: res.status };
  }
}

export class HttpPatchNode extends BaseNode {
  static readonly nodeType = "lib.http.Patch";
  static readonly title = "HTTP PATCH";
  static readonly description =
    "Send a PATCH request with JSON body.\n    http, patch, update, request, api";
  static readonly metadataOutputTypes = {
    output: "any",
    status: "int"
  };
  static readonly exposeAsTool = true;

  @prop({ type: "str", default: "", title: "URL", description: "URL to patch" })
  declare url: any;

  @prop({ type: "any", default: null, title: "Body", description: "Request body (will be JSON-encoded)" })
  declare body: any;

  @prop({ type: "str", default: "", title: "Headers JSON", description: "Optional JSON object of request headers" })
  declare headers: any;

  async process(): Promise<Record<string, unknown>> {
    const headers = parseHeaders(this.headers);
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
    const bodyStr = this.body != null ? JSON.stringify(this.body) : undefined;
    const res = await httpRequest(String(this.url ?? ""), "PATCH", headers, bodyStr);
    const text = await res.text();
    let json: unknown;
    try { json = JSON.parse(text); } catch { json = text; }
    return { output: json, status: res.status };
  }
}

export class HttpDeleteNode extends BaseNode {
  static readonly nodeType = "lib.http.Delete";
  static readonly title = "HTTP DELETE";
  static readonly description =
    "Send a DELETE request.\n    http, delete, remove, request, api";
  static readonly metadataOutputTypes = {
    output: "bool",
    status: "int"
  };
  static readonly exposeAsTool = true;

  @prop({ type: "str", default: "", title: "URL", description: "URL to delete" })
  declare url: any;

  @prop({ type: "str", default: "", title: "Headers JSON", description: "Optional JSON object of request headers" })
  declare headers: any;

  async process(): Promise<Record<string, unknown>> {
    const headers = parseHeaders(this.headers);
    const res = await httpRequest(String(this.url ?? ""), "DELETE", headers);
    return { output: res.ok, status: res.status };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseHeaders(input: unknown): Record<string, string> {
  if (!input) return {};
  if (typeof input === "string" && input.trim()) {
    try {
      return JSON.parse(input) as Record<string, string>;
    } catch {
      return {};
    }
  }
  if (typeof input === "object") return input as Record<string, string>;
  return {};
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const LIB_HTTP_NODES: readonly NodeClass[] = [
  HttpGetTextNode,
  HttpGetJsonNode,
  HttpGetBytesNode,
  HttpPostNode,
  HttpPutNode,
  HttpPatchNode,
  HttpDeleteNode
] as const;
