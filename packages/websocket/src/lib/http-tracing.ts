/** Owner-validated incoming ancestry is reserved for durable run roots.
 * HTTP request spans remain independent of run traces.
 */
import {
  context,
  propagation,
  SpanKind,
  ROOT_CONTEXT,
  isSpanContextValid,
  type SpanContext,
  SpanStatusCode,
  trace,
  type Span
} from "@opentelemetry/api";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { getTracer } from "@nodetool-ai/runtime";

/** Probes a load balancer polls; a trace per poll is noise. */
const UNTRACED_PATHS = new Set(["/health", "/ready"]);

const acceptedParents = new WeakMap<FastifyRequest, SpanContext>();

export function acceptedRunTraceParent(request: FastifyRequest): SpanContext | undefined {
  return acceptedParents.get(request);
}

export interface HttpTracingOptions {
  readonly authorizeTraceParent?: (request: FastifyRequest, parent: SpanContext) => Promise<boolean>;
}

/** Called after authentication. A visitor session cannot join its owner's trace. */
export function registerHttpTracing(app: FastifyInstance, options: HttpTracingOptions = {}): void {
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
    const extracted = propagation.extract(ROOT_CONTEXT, request.headers);
    const incoming = trace.getSpanContext(extracted);
    const authorize = incoming && isSpanContextValid(incoming) && options.authorizeTraceParent
      ? options.authorizeTraceParent(request, incoming)
      : Promise.resolve(false);
    void authorize.then((allowed) => {
      if (allowed && incoming) { acceptedParents.set(request, incoming); }
      // Run roots consume the validated parent directly. Request spans remain unrelated.
      const parent = ROOT_CONTEXT;
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
    }).catch(done);
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
