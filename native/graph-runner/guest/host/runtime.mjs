// @nodetool-ai/runtime for the guest. Pure functions node code imports come
// from the real package modules (prefixed `guest-real:`, which guest/build.mjs
// resolves to the package itself). Functions that need the machine go
// through the host capabilities: files and directories through fs.mjs,
// asset storage, secrets and http through context.mjs and media-fetch.mjs.
// Exports the guest lacks are absent; the parity profile names them.
import { loadMediaRefBytes as loadReal } from "guest-real:@nodetool-ai/runtime/media-ref-bytes";
import { fetchExternalMedia } from "./media-fetch.mjs";
import * as fs from "./fs.mjs";
import * as path from "./path.mjs";
import {
  NestedFolders,
  WorkspaceReservedPathError,
  isReservedWorkspaceKey
} from "guest-real:@nodetool-ai/runtime-core/workspace.js";

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
export { creditBlockReason } from "guest-real:@nodetool-ai/runtime/providers/provider-credits.js";
export {
  RESERVED_WORKSPACE_DIR,
  WorkspaceReservedPathError,
  setProjectFolderResolver
} from "guest-real:@nodetool-ai/runtime-core/workspace.js";

// As assertLocalPathIsOwn in @nodetool-ai/runtime-core, which checks a path on
// the local disk before a tool opens it there. The guest has no local disk,
// so it refuses every path with the error that code throws when node:path is
// missing. Its own module would bring the storage adapters into the bundle.
export async function assertLocalPathIsOwn() {
  throw new Error(
    "Local workspace file access requires a Node.js runtime; this workspace " +
      "operation is not available here"
  );
}
export { PERMISSION_GATE_CONTEXT_KEY } from "guest-real:@nodetool-ai/runtime/permission-gate.js";
export { getRunTraceScope, withRunTrace, recordTraceEvent } from "guest-real:@nodetool-ai/runtime/run-trace-context.js";
export { stringifyTraceContent } from "guest-real:@nodetool-ai/runtime/run-trace-serialization.js";
export { getProviderStreamTrace } from "guest-real:@nodetool-ai/runtime/providers/loop-tracing.js";
export { isChunk } from "@nodetool-ai/protocol";

export { loadCanvas } from "./canvas.mjs";
export { getTracer } from "guest-real:@nodetool-ai/runtime/telemetry.js";
export { suppressRunTraceContent } from "guest-real:@nodetool-ai/runtime/run-trace-context.js";
export {
  APPROVAL_DECISIONS,
  decidePermission,
  grantsStandingApproval,
  headlessGate,
  isApprovingDecision,
  isPreapproved
} from "guest-real:@nodetool-ai/runtime/permission-gate.js";

export * from "./media-native.mjs";

export { isBlockedIpLiteral, isSafePublicHttpsUrl } from "guest-real:@nodetool-ai/runtime/providers/safe-url.js";

// As ensureRunFile and saveRunFileAsset in @nodetool-ai/runtime, which share
// a file with the project folder only when the run's workspace is that
// folder. The native runner keeps no project folders, so the file always goes
// to the run's workspace (the files capability) and the asset, when there is
// one, to the assets capability. The runtime's own module would bring the
// whole runtime-core package into the bundle for a resolver that is never
// installed here.
export async function ensureRunFile(context, bytes, path, contentType) {
  if (!context.workspace) return null;
  await context.workspace.write(path, bytes, contentType);
  return path;
}

export async function saveRunFileAsset(context, bytes, opts) {
  let assetId = null;
  let assetError;
  if (context.hasModelInterface?.("createAsset")) {
    try {
      const created = await context.createAsset({
        name: opts.name,
        contentType: opts.contentType,
        content: bytes,
        path: opts.path,
        metadata: opts.metadata ?? null
      });
      assetId = typeof created?.id === "string" && created.id ? created.id : null;
    } catch (error) {
      assetError = error instanceof Error ? error.message : String(error);
    }
  }
  const path = await ensureRunFile(context, bytes, opts.path, opts.contentType);
  const saved = { asset_id: assetId, path };
  if (assetError !== undefined) saved.asset_error = assetError;
  return saved;
}

// As assertLocalPathIsOwn in @nodetool-ai/runtime-core: a path inside the
// run's folder may not be the reserved `.nodetool/` directory or lie in the
// folder of another project, whether it is spelled that way or reaches it
// through a link. A path outside the folder is not judged here. The real
// module needs node:fs at load, which the guest does not bundle, so this
// asks the same rule through the guest's fs and the workspace's
// isNestedFolder.
function keyWithin(root, target) {
  const inside = path.relative(path.resolve(root), path.resolve(target));
  if (!inside || inside.startsWith("..") || path.isAbsolute(inside)) return null;
  return inside.split(path.sep).join("/");
}

export async function assertLocalPathIsOwn(workspace, root, target, shown = target) {
  const key = keyWithin(root, target);
  if (key === null) return;
  const nested = new NestedFolders(workspace);
  const refuse = async (candidate) => {
    if (isReservedWorkspaceKey(candidate)) throw new WorkspaceReservedPathError(shown);
    if (await nested.covers(candidate)) throw new WorkspaceReservedPathError(shown, "nested");
  };
  await refuse(key);
  // The same question for where the path really is, links resolved.
  let realKey = null;
  try {
    realKey = keyWithin(fs.realpathSync(root), fs.realpathSync(target));
  } catch {
    // Nothing is there yet to be a link.
  }
  if (realKey !== null && realKey !== key) await refuse(realKey);
}

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
