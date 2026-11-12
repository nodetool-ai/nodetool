// @nodetool-ai/runtime for the guest. Pure functions node code imports come
// from the real package modules (prefixed `guest-real:`, which guest/build.mjs
// resolves to the package itself). Functions that need the machine go
// through the host capabilities: files and directories through fs.mjs,
// asset storage, secrets and http through context.mjs and media-fetch.mjs.
// Exports the guest lacks are absent; the parity profile names them.
import { loadMediaRefBytes as loadReal } from "guest-real:@nodetool-ai/runtime/media-ref-bytes";
import { fetchExternalMedia } from "./media-fetch.mjs";

export { encodeBase64, isAbsoluteFilePath } from "guest-real:@nodetool-ai/runtime/media-ref-bytes";
export {
  assetRefToPromptToken,
  classifyAssetToken,
  classifyTextToken,
  expandAssetReferences,
  expandEntityRefs,
  expandEntitiesForGeneration,
  findAssetRefs,
  findImageAssetRefs,
  findTextAssetRefs,
  inlineTextAssetRefs,
  mapPromptAssetsToInputs,
  stripAssetRefs
} from "guest-real:@nodetool-ai/runtime/prompt-asset-refs";
export { resolveEntities } from "guest-real:@nodetool-ai/runtime/entities";
export { zodToJsonSchema } from "@nodetool-ai/protocol/zod-schema";
export { WEB_SEARCH_TOOL_NAME } from "guest-real:@nodetool-ai/runtime/providers/types.js";
export {
  detectImageMime,
  extForImageMime,
  isSvgBytes,
  sniffImageMime,
  SVG_MIME
} from "guest-real:@nodetool-ai/runtime/providers/image-mime.js";
export { sniffAudioMime, sniffAudioMimeOrNull } from "guest-real:@nodetool-ai/runtime/providers/audio-mime.js";
export { extractJson, messageText } from "guest-real:@nodetool-ai/runtime/providers/structured-output.js";
export { RecoverableNodeError, isRecoverableNodeError } from "guest-real:@nodetool-ai/runtime/recoverable-node-error.js";
export { VariableChannel } from "guest-real:@nodetool-ai/runtime/variable-channel.js";
export { getCostReconciler, registerCostReconciler } from "guest-real:@nodetool-ai/runtime/cost-reconciler.js";
export { registerWebhookWait } from "guest-real:@nodetool-ai/runtime/providers/kie-webhook-registry.js";
export { GuestContext as ProcessingContext, MemoryCache } from "./context.mjs";
export { fetchExternalMedia, safeFetch } from "./media-fetch.mjs";

/**
 * As loadMediaRefBytes in @nodetool-ai/runtime. `file:` URIs and absolute
 * paths read through the guest fs, inside the granted directories only, and
 * http(s) goes through the host's media fetch policy. A refused or failed
 * read is null, as in the original.
 */
export function loadMediaRefBytes(value, context, options = {}) {
  return loadReal(value, context, { fetchHttp: fetchHttpOrNull, ...options });
}

async function fetchHttpOrNull(uri) {
  try {
    const response = await fetchExternalMedia(uri);
    return response.ok ? new Uint8Array(await response.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

export { isToolCall, isProviderStop } from "guest-real:@nodetool-ai/runtime/providers/types.js";
export { generateStructured } from "guest-real:@nodetool-ai/runtime/providers/structured-output.js";
export { parseWithTypeCoercion } from "@nodetool-ai/protocol/zod-schema";
export { budgetFromContext, createRunBudget } from "guest-real:@nodetool-ai/runtime/turn-budget.js";
export { BaseProvider } from "guest-real:@nodetool-ai/runtime/providers/base-provider.js";
export { PERMISSION_GATE_CONTEXT_KEY } from "guest-real:@nodetool-ai/runtime/permission-gate.js";
export { getRunTraceScope, withRunTrace, recordTraceEvent } from "guest-real:@nodetool-ai/runtime/run-trace-context.js";
export { stringifyTraceContent } from "guest-real:@nodetool-ai/runtime/run-trace-serialization.js";
export { getProviderStreamTrace } from "guest-real:@nodetool-ai/runtime/providers/loop-tracing.js";
export { isChunk } from "@nodetool-ai/protocol";

export { loadCanvas } from "./canvas.mjs";
export { getTracer } from "guest-real:@nodetool-ai/runtime/telemetry.js";
export { suppressRunTraceContent } from "guest-real:@nodetool-ai/runtime/run-trace-context.js";
export { decidePermission, headlessGate } from "guest-real:@nodetool-ai/runtime/permission-gate.js";

export * from "./media-native.mjs";

export { isBlockedIpLiteral, isSafePublicHttpsUrl } from "guest-real:@nodetool-ai/runtime/providers/safe-url.js";

// The server caps concurrent timeline renders across jobs. The native runner
// renders inside its own run, so the guest honours the signal and renders.
export async function withTimelineRenderSlot(render, signal) {
  signal?.throwIfAborted();
  return await render();
}

// As rasterizeSvgInput in @nodetool-ai/runtime: raster bytes pass through.
// SVG needs sharp, which the native runner does not have.
export async function rasterizeSvgInput(bytes) {
  const { isSvgBytes: isSvg, sniffImageMime: sniff } = await import("guest-real:@nodetool-ai/runtime/providers/image-mime.js");
  if (sniff(bytes) !== null || !isSvg(bytes)) return bytes;
  throw new Error("SVG rasterization is unavailable in the native runner: it needs sharp. Export the SVG as PNG first.");
}
