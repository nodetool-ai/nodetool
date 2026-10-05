import { isRecord, isString } from "@nodetool-ai/node-sdk";
import type { NodeValue } from "@nodetool-ai/node-sdk";
import { loadMediaRefBytes } from "@nodetool-ai/runtime";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { higgsfieldCreateUploadUrl, higgsfieldUploadMedia, type HiggsfieldCredentials } from "@nodetool-ai/runtime";

export function getCredentials(secrets: Record<string, string> | undefined): HiggsfieldCredentials {
  const keyId = secrets?.HIGGSFIELD_API_KEY_ID || process.env.HIGGSFIELD_API_KEY_ID || "";
  const secret = secrets?.HIGGSFIELD_API_KEY_SECRET || process.env.HIGGSFIELD_API_KEY_SECRET || "";
  if (!keyId.trim() || !secret.trim()) throw new Error("HIGGSFIELD_API_KEY_ID and HIGGSFIELD_API_KEY_SECRET are required");
  return { keyId: keyId.trim(), secret: secret.trim() };
}

export async function resolveHiggsfieldMedia(
  ref: NodeValue,
  context: ProcessingContext | undefined,
  credentials: HiggsfieldCredentials,
  mimeType: string,
  signal?: AbortSignal
): Promise<string> {
  if (!isRecord(ref)) throw new Error("A media reference is required");
  const uri = isString(ref.uri) ? ref.uri : "";
  if (/^https:\/\//.test(uri)) return uri;
  const bytes = await loadMediaRefBytes(ref, context);
  if (!bytes || bytes.length === 0) throw new Error("Could not resolve Higgsfield media input");
  const upload = await higgsfieldCreateUploadUrl(credentials, mimeType, signal);
  return higgsfieldUploadMedia(upload, bytes, mimeType, signal);
}
