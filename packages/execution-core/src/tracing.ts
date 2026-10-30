import { trace, SpanStatusCode, type Span } from '@opentelemetry/api';
export { SpanStatusCode };
/** Uses the caller's configured tracer, without selecting or installing an exporter. */
async function withSpan<T>(name: string, attributes: Record<string, string | number>, fn: (span: Span) => Promise<T>): Promise<T> {
  return trace.getTracer('nodetool.execution').startActiveSpan(name, {attributes}, async span => {
    try { return await fn(span); } catch (error) { markSpanError(span, error); throw error; } finally { span.end(); }
  });
}
export function withWorkflowSpan<T>(options: {workflowId?: string; nodeCount: number; extra?: Record<string, string>}, fn: (span: Span) => Promise<T>): Promise<T> {
  return withSpan('workflow.run', {'workflow.id': options.workflowId ?? '', 'workflow.node_count': options.nodeCount, ...options.extra}, fn);
}
export function withNodeSpan<T>(options: {nodeId: string; nodeType: string}, fn: (span: Span) => Promise<T>): Promise<T> {
  return withSpan('node.process', {'node.id': options.nodeId, 'node.type': options.nodeType}, fn);
}
export function markSpanError(span: Span | undefined, error: unknown): void {
  if (error instanceof Error) { span?.recordException(error); }
  span?.setStatus({code: SpanStatusCode.ERROR, message:String(error)});
}
