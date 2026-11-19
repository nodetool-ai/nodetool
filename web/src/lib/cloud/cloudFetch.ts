/**
 * `fetch` for the signed-in cloud server in the desktop app (technical
 * design, "Cloud documents, sharing and transfer in the desktop app";
 * WP1.15).
 *
 * The renderer holds no token. A request goes over IPC to the main process,
 * which checks it against its list of routes and has the account helper
 * attach the credential. This adapter turns that call into a `fetch`, so the
 * tRPC links and media code use it unchanged.
 */
import type { CloudRequestInput, CloudResponse } from "../../window";

export type CloudRequester = (input: CloudRequestInput) => Promise<CloudResponse>;

export type CloudRequestErrorCode =
  | "SIGNED_OUT"
  | "OFFLINE"
  | "REFUSED"
  | "CANCELLED"
  | "BUSY";

/** A cloud request that did not reach the server, or was refused before it. */
export class CloudRequestError extends Error {
  constructor(readonly code: CloudRequestErrorCode) {
    super(
      code === "SIGNED_OUT"
        ? "Signed out of NodeTool Cloud. Sign in again to open cloud documents."
        : code === "REFUSED"
          ? "The desktop app does not send this request to the cloud."
          : "NodeTool Cloud could not be reached."
    );
    this.name = "CloudRequestError";
  }
}

/** The desktop app's cloud requests, or null in a browser. */
export function desktopCloudRequester(): CloudRequester | null {
  const cloud = typeof window !== "undefined" ? window.api?.cloud : undefined;
  return cloud ? (input) => cloud.request(input) : null;
}

const NO_BODY_STATUSES = new Set([204, 205, 304]);

function requestBody(body: BodyInit | null | undefined): string | Uint8Array | undefined {
  if (body === null || body === undefined) {
    return undefined;
  }
  if (typeof body === "string") {
    return body;
  }
  if (body instanceof Uint8Array) {
    return body;
  }
  if (body instanceof ArrayBuffer) {
    return new Uint8Array(body);
  }
  throw new CloudRequestError("REFUSED");
}

/**
 * A `fetch` that sends to `serverOrigin` through `request`. A URL on another
 * origin, a method other than GET, HEAD and POST, or a body the IPC call
 * cannot carry is refused without a request.
 */
export function createCloudFetch(serverOrigin: string, request: CloudRequester): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const asRequest = typeof Request !== "undefined" && input instanceof Request ? input : null;
    const href =
      typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
    const url = new URL(href);
    if (url.origin !== serverOrigin) {
      throw new CloudRequestError("REFUSED");
    }
    const method = (init?.method ?? asRequest?.method ?? "GET").toUpperCase();
    if (method !== "GET" && method !== "HEAD" && method !== "POST") {
      throw new CloudRequestError("REFUSED");
    }
    const headers: Record<string, string> = {};
    new Headers(init?.headers ?? asRequest?.headers).forEach(
      (value, name) => {
        headers[name] = value;
      }
    );
    const signal = init?.signal ?? undefined;
    if (signal?.aborted) {
      throw new DOMException("The request was aborted.", "AbortError");
    }
    const call = request({
      method,
      path: url.pathname + url.search,
      headers,
      body: requestBody(init?.body)
    });
    // The IPC call cannot be cancelled. An abort rejects here and the answer
    // is dropped when it comes.
    const answer = await (signal
      ? Promise.race([
          call,
          new Promise<never>((_resolve, reject) =>
            signal.addEventListener(
              "abort",
              () => reject(new DOMException("The request was aborted.", "AbortError")),
              { once: true }
            )
          )
        ])
      : call);
    if (!answer.ok) {
      throw new CloudRequestError(answer.error);
    }
    if (answer.status < 200 || answer.status > 599) {
      throw new CloudRequestError("OFFLINE");
    }
    const empty = method === "HEAD" || NO_BODY_STATUSES.has(answer.status);
    return new Response(empty ? null : (answer.body as Uint8Array<ArrayBuffer>), {
      status: answer.status,
      headers: answer.headers
    });
  };
}
