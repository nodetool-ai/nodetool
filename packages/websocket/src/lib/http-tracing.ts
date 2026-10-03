/**
 * One OpenTelemetry server span per HTTP request.
 *
 * The span is made active for the rest of the request lifecycle, so the
 * storage, fetch, subprocess and workflow spans a handler starts nest under
 * it. An incoming W3C `traceparent` header continues the caller's trace.
 * Nothing happens while telemetry is off: `getTracer()` returns null until
 * `initTelemetry` finds a configured sink.
 */
import {
  context,
  propagation,
  SpanKind,
  SpanStatusCode,
  trace,
  type Span
} from "@opentelemetry/api";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { getTracer } from "@nodetool-ai/runtime";

/** Probes a load balancer polls; a trace per poll is noise. */
const UNTRACED_PATHS = new Set(["/health", "/ready"]);

export function registerHttpTracing(app: FastifyInstance): void {
  const spans = new WeakMap<FastifyRequest, Span>();

  app.addHook("onRequest", (request, _reply, done) => {
    const tracer = getTracer();
    const path = request.url.split("?")[0] ?? "/";
    // A WebSocket upgrade holds its socket for the whole session. A span
    // around it would stay open and parent every job the socket runs.
    if (
      !tracer ||
      request.headers.upgrade !== undefined ||
      UNTRACED_PATHS.has(path)
    ) {
      done();
      return;
    }
    const parent = propagation.extract(context.active(), request.headers);
    const span = tracer.startSpan(
      request.method,
      {
        kind: SpanKind.SERVER,
        attributes: {
          "http.request.method": request.method,
          "url.path": path,
          "url.scheme": request.protocol
        }
      },
      parent
    );
    spans.set(request, span);
    context.with(trace.setSpan(parent, span), done);
  });

  app.addHook("onError", (request, _reply, error, done) => {
    spans.get(request)?.recordException(error);
    done();
  });

  app.addHook("onResponse", (request, reply, done) => {
    const span = spans.get(request);
    if (span) {
      spans.delete(request);
      const route = request.routeOptions.url;
      if (route !== undefined) {
        span.setAttribute("http.route", route);
        span.updateName(`${request.method} ${route}`);
      }
      span.setAttribute("http.response.status_code", reply.statusCode);
      if (reply.statusCode >= 500) {
        span.setAttribute("error.type", String(reply.statusCode));
        span.setStatus({ code: SpanStatusCode.ERROR });
      }
      span.end();
    }
    done();
  });

  app.addHook("onRequestAbort", (request, done) => {
    const span = spans.get(request);
    if (span) {
      spans.delete(request);
      span.setStatus({ code: SpanStatusCode.ERROR, message: "aborted" });
      span.end();
    }
    done();
  });
}
