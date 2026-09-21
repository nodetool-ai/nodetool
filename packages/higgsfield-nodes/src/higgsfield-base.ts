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
  ref: unknown,
  context: ProcessingContext | undefined,
  credentials: HiggsfieldCredentials,
  mimeType: string,
  signal?: AbortSignal
): Promise<string> {
  if (typeof ref !== "object" || ref === null || Array.isArray(ref)) throw new Error("A media reference is required");
  const record = ref as Record<string, unknown>;
  const uri = typeof record.uri === "string" ? record.uri : "";
  if (/^https:\/\//.test(uri)) return uri;
  const bytes = await loadMediaRefBytes(record, context);
  if (!bytes || bytes.length === 0) throw new Error("Could not resolve Higgsfield media input");
  const upload = await higgsfieldCreateUploadUrl(credentials, mimeType, signal);
  return higgsfieldUploadMedia(upload, bytes, mimeType, signal);
}
