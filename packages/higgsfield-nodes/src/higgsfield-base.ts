import { isRecord, isString } from "@nodetool-ai/node-sdk";
import type { NodeValue } from "@nodetool-ai/node-sdk";
import { PROVIDER_IDS } from "@nodetool-ai/protocol";
import { loadMediaRefBytes } from "@nodetool-ai/runtime";
import type { ProcessingContext } from "@nodetool-ai/runtime";

/** Pass a public https URL through, otherwise upload the ref's bytes through the Higgsfield provider. */
export async function resolveHiggsfieldMedia(
  ref: NodeValue,
  context: ProcessingContext,
  mimeType: string,
  signal?: AbortSignal
): Promise<string> {
  if (!isRecord(ref)) throw new Error("A media reference is required");
  const uri = isString(ref.uri) ? ref.uri : "";
  if (/^https:\/\//.test(uri)) return uri;
  const bytes = await loadMediaRefBytes(ref, context);
  if (!bytes || bytes.length === 0) throw new Error("Could not resolve Higgsfield media input");
  const upload: Parameters<ProcessingContext["uploadProviderMedia"]>[0] = { provider: PROVIDER_IDS.HIGGSFIELD, bytes, mimeType };
  if (signal) upload.signal = signal;
  return context.uploadProviderMedia(upload);
}
