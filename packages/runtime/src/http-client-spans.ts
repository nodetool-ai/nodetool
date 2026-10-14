/**
 * Outbound `fetch` (provider APIs, S3, Supabase, safeFetch) becomes
 * `HTTP <method>` client spans.
 *
 * Node's fetch is undici, and undici publishes every request on
 * `diagnostics_channel`. Subscribing there works in ESM and in the bundled
 * backend without a loader hook or a patched global. The OTLP exporter also
 * uses fetch, but the span processors run it with tracing suppressed, and the
 * tracer returns a span that records nothing there, so the exporter never
 * traces itself.
 */
import diagnosticsChannel from "node:diagnostics_channel";
import {
  context,
  SpanKind,
  SpanStatusCode,
  trace,
  type Span,
  type Tracer
} from "@opentelemetry/api";

/** The fields of an undici request that the spans read. */
interface UndiciRequest {
  method?: string;
  origin?: string | URL;
  path?: string;
}

interface RequestMessage {
  request: UndiciRequest;
}

interface HeadersMessage extends RequestMessage {
  response: { statusCode: number };
}

interface ErrorMessage extends RequestMessage {
  error: unknown;
}

const CREATE = "undici:request:create";
const HEADERS = "undici:request:headers";
const TRAILERS = "undici:request:trailers";
const ERROR = "undici:request:error";

/**
 * Start recording outbound fetch requests with `tracer`. Returns the function
 * that stops the recording.
 */
export function installHttpClientSpans(tracer: Tracer): () => void {
  const spans = new WeakMap<UndiciRequest, Span>();

  const onCreate = (message: unknown): void => {
    const { request } = message as RequestMessage;
    const active = context.active();
    const method = (request.method ?? "GET").toUpperCase();
    const attributes: Record<string, string | number> = {
      "http.request.method": method
    };
    try {
      const url = new URL(request.path ?? "/", request.origin);
      // Keep the query string out of the span: it can hold API keys.
      attributes["url.full"] = `${url.origin}${url.pathname}`;
      attributes["server.address"] = url.hostname;
      if (url.port) attributes["server.port"] = Number(url.port);
    } catch {
      // An origin that does not parse leaves only the method on the span.
    }
    spans.set(
      request,
      tracer.startSpan(
        `HTTP ${method}`,
        { kind: SpanKind.CLIENT, attributes },
        active
      )
    );
  };

  const onHeaders = (message: unknown): void => {
    const { request, response } = message as HeadersMessage;
    const span = spans.get(request);
    if (!span) return;
    span.setAttribute("http.response.status_code", response.statusCode);
    if (response.statusCode >= 400) {
      span.setStatus({ code: SpanStatusCode.ERROR });
    }
  };

  const onTrailers = (message: unknown): void => {
    const { request } = message as RequestMessage;
    spans.get(request)?.end();
    spans.delete(request);
  };

  const onError = (message: unknown): void => {
    const { request, error } = message as ErrorMessage;
    const span = spans.get(request);
    if (!span) return;
    if (error instanceof Error) span.recordException(error);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : String(error)
    });
    span.end();
    spans.delete(request);
  };

  diagnosticsChannel.subscribe(CREATE, onCreate);
  diagnosticsChannel.subscribe(HEADERS, onHeaders);
  diagnosticsChannel.subscribe(TRAILERS, onTrailers);
  diagnosticsChannel.subscribe(ERROR, onError);

  return () => {
    diagnosticsChannel.unsubscribe(CREATE, onCreate);
    diagnosticsChannel.unsubscribe(HEADERS, onHeaders);
    diagnosticsChannel.unsubscribe(TRAILERS, onTrailers);
    diagnosticsChannel.unsubscribe(ERROR, onError);
  };
}

/** The tracer the HTTP client spans use. */
export function httpClientTracer(): Tracer {
  return trace.getTracer("nodetool.http");
}
