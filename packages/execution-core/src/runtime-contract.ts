import type { ProcessingMessage } from '@nodetool-ai/protocol';
import type { TriggerEvent } from './node-executor.js';
export * from './node-executor.js';
export * from './invocation-account.js';
export * from './recoverable-node-error.js';
export { isContentFilterRefusal } from './content-filter.js';
/** Context operations consumed by the actor kernel, independent of media/providers. */
export interface ProcessingContext {
  signal?: AbortSignal;
  triggerEvent?: TriggerEvent | null;
  emit(message: ProcessingMessage): void;
  setSendControlEvent?(fn: (targetNodeId: string, properties: Record<string, unknown>) => Promise<Record<string, unknown>>): void;
  getResolvedSecretValues?(): ReadonlySet<string>;
  getTotalCost?(): number;
  registerChannelWriters?(name: string, count: number): void;
  markChannelWriterDone?(name: string): void;
  closeAllChannels?(): void;
  clearProviderCost?(): void;
  getProviderCost?(): unknown;
}
interface ProviderFailureDetail { code: 'provider_auth' | 'context_exceeded'; provider: string; secretKey: string | null }
const FAILURE_DETAIL = Symbol.for('nodetool.provider.failureDetail');
/** Reads the canonical provider error annotation without importing concrete providers. */
export function providerFailureDetail(error: unknown): ProviderFailureDetail | null {
  if (typeof error !== 'object' || error === null || !(FAILURE_DETAIL in error)) { return null; }
  const detail = error[FAILURE_DETAIL];
  if (typeof detail !== 'object' || detail === null || !('code' in detail) || !('provider' in detail) || !('secretKey' in detail)) { return null; }
  if ((detail.code !== 'provider_auth' && detail.code !== 'context_exceeded') || typeof detail.provider !== 'string' || (detail.secretKey !== null && typeof detail.secretKey !== 'string')) { return null; }
  return {code: detail.code, provider: detail.provider, secretKey: detail.secretKey};
}
