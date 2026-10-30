import { trace, SpanStatusCode, type Attributes, type Span } from "@opentelemetry/api";

export async function withTaskSpan<T>(kind: string, name: string, attributes: Attributes, task: (span: Span) => Promise<T>): Promise<T> {
  return trace.getTracer("nodetool.runtime-core").startActiveSpan(name, { attributes: { ...attributes, "nodetool.task.kind": kind } }, async (span) => {
    try {
      return await task(span);
    } catch (error) {
      if (error instanceof Error) {
        span.recordException(error);
      }
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw error;
    } finally {
      span.end();
    }
  });
}
