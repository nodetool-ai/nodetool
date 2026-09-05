import { access, readdir } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { homedir } from "node:os";
import { basename, isAbsolute, join, relative } from "node:path";
import { getSecret as getStoredSecret } from "@nodetool-ai/models";
import {
  getProvider,
  getRegisteredProvider,
  isProviderConfigured,
  listRegisteredProviderIds,
  RECOMMENDED_MODELS,
  OLLAMA_DEFAULT_URL,
  LMSTUDIO_DEFAULT_URL,
  type ASRModel,
  type EmbeddingModel,
  type ImageModel,
  type LanguageModel,
  type MusicModel,
  type ProviderId,
  type RecommendedUnifiedModel,
  type TTSModel,
  type VideoModel
} from "@nodetool-ai/runtime";
import type { BaseProvider } from "@nodetool-ai/runtime";
import type { PythonBridge } from "@nodetool-ai/runtime";
import type { WorkerManager } from "@nodetool-ai/compute";
import {
  readCachedHfModels,
  searchCachedHfModels,
  getModelsByHfType,
  deleteCachedHfModel,
  getHuggingfaceFileInfos,
  resolveWorkerHfToken,
  type HFFileRequest
} from "@nodetool-ai/huggingface";
import type { UnifiedModel } from "@nodetool-ai/protocol";
import {
  modelRankings,
  rankedForTask,
  type ModelRankingsArtifact
} from "@nodetool-ai/model-pricing";
import {
  readyProviderExecution,
  resolveModelExecutionAvailability,
  type ProviderExecutionInfo
} from "./model-execution-availability.js";

export type { UnifiedModel };

/**
 * Optional dependencies threaded into the model routes so worker-scoped
 * requests can reach the attached worker. When absent, only `scope=local`
 * (the default) works and worker-scope requests fail with a clear `409`.
 */
export interface ModelsApiDeps {
  pythonBridge?: PythonBridge;
  workerManager?: WorkerManager;
}















function wildcardToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const regex = `^${escaped.replaceAll("*", ".*").replaceAll("?", ".")}$`;
  return new RegExp(regex);
}




function getHfCacheRoot(): string {
  // HF_HUB_CACHE (modern) and HUGGINGFACE_HUB_CACHE already point AT the hub
  // directory that holds the `models--*` folders — they are used verbatim.
  // Only HF_HOME needs `/hub` appended. Appending it to the hub-cache vars
  // (the previous behavior) probed one level too deep, so every model showed as
  // not-downloaded. Mirrors electron/src/fileExplorer.ts.
  const hubDir = process.env.HF_HUB_CACHE ?? process.env.HUGGINGFACE_HUB_CACHE;
  if (hubDir) return hubDir;
  const hfHome = process.env.HF_HOME;
  if (hfHome) return join(hfHome, "hub");
  return join(homedir(), ".cache", "huggingface", "hub");
}

function repoToCacheDir(repoId: string): string {
  return `models--${repoId.replaceAll("/", "--")}`;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}









// ---------------------------------------------------------------------------
// Provider access — delegates to the runtime's single provider registry.
// No duplicate registry here; the runtime's registerProvider() calls in
// providers/index.ts are the single source of truth.
// ---------------------------------------------------------------------------

import { PythonProvider, registerProvider } from "@nodetool-ai/runtime";
import { isString } from "./lib/wire-values.js";

/**
 * Register Python-only providers (HuggingFace Local, MLX) discovered
 * via the Python stdio bridge. Call after the bridge has connected.
 */
export async function registerPythonProviders(
  bridge: PythonBridge
): Promise<string[]> {
  const providers = await bridge.listProviders();
  const registered: string[] = [];
  for (const info of providers) {
    const existingIds = listRegisteredProviderIds();
    // The TypeScript runtime already owns `huggingface` for the hosted
    // Inference API, while the Python worker uses the same id for local model
    // execution. Keep both available under stable public ids and retain the
    // worker id separately for bridge calls.
    const publicId =
      info.id === "huggingface" && existingIds.includes(info.id)
        ? "huggingface-local"
        : info.id;
    if (existingIds.includes(publicId)) continue;
    const secrets: Record<string, string> = {};
    registerProvider(
      publicId,
      PythonProvider as any,
      {
        _bridge: bridge,
        _id: publicId,
        _bridgeProviderId: info.id,
        ...secrets
      },
      {},
      {
        access: info.access ?? "in_process",
        displayName: info.display_name ?? publicId
      }
    );
    registered.push(publicId);
  }
  return registered;
}

function secretResolverFor(userId: string) {
  return (key: string) =>
    getStoredSecret(key, userId).then((v) => v ?? undefined);
}

















/**
 * The `type` a merged entry carries, by task — the same value the hand-pinned
 * RECOMMENDED_MODELS entries of that task carry. A task absent from this table
 * has no ranked surface here, so the merge is a no-op for it.
 */
const RANKED_TASK_MODEL_TYPE: Record<string, string> = {
  text_to_image: "image_model",
  image_to_image: "image_model",
  text_to_video: "video_model",
  image_to_video: "video_model",
  text_to_speech: "tts_model",
  text_to_music: "music_model"
};

/**
 * Append the ranked leaderboard for one task to the hand-pinned entries that
 * already answer an endpoint. RECOMMENDED_MODELS is the override list: its
 * entries keep their order and always come first; ranked models follow, best
 * rank first.
 *
 * One entry per canonical model, taking its first route — a model reachable
 * through FAL and kie is one row, not two. A canonical model any of whose
 * routes is already pinned is skipped, so an override is never duplicated by
 * the leaderboard.
 *
 * An empty artifact returns `base` unchanged, which is the shipped state until
 * the rankings sync writes a snapshot.
 */
export function mergeRankedRecommendations(
  base: UnifiedModel[],
  task: string,
  artifact: ModelRankingsArtifact = modelRankings
): UnifiedModel[] {
  const type = RANKED_TASK_MODEL_TYPE[task];
  if (!type) return base;

  const seen = new Set(
    base.map((model) => `${model.provider ?? ""}::${model.id}`)
  );
  const merged = [...base];

  for (const entry of rankedForTask(task, artifact)) {
    const keys = entry.routes.map(
      (route) => `${route.provider}::${route.modelId}`
    );
    if (keys.some((key) => seen.has(key))) continue;
    const route = entry.routes[0];
    if (!route) continue;
    for (const key of keys) {
      seen.add(key);
    }
    merged.push({
      id: route.modelId,
      type,
      name: entry.name,
      repo_id: null,
      path: null,
      downloaded: false,
      provider: route.provider
    });
  }

  return merged;
}








// ---------------------------------------------------------------------------
// Worker-scoped model download relay
// ---------------------------------------------------------------------------

/** Minimal sink the relay writes JSON progress frames to (the /ws/download socket). */
interface DownloadSocket {
  send(data: string): void;
}

/** The `start_download` command JSON, with the optional `scope: "worker"` flag. */
export interface StartDownloadCommand {
  command: string;
  repo_id?: string;
  path?: string | null;
  allow_patterns?: string[] | null;
  ignore_patterns?: string[] | null;
  model_type?: string | null;
  scope?: string;
}

/**
 * Relay a worker-scoped model download: forward each bridge `progress` frame
 * onto the /ws/download socket using the same JSON shape the local download
 * manager emits, so the web ModelDownloadStore consumes it unchanged.
 *
 * No attached worker (or an image too old for `models.*`) yields an `error`
 * progress frame instead. A mid-download failure (e.g. the worker detaching)
 * surfaces as an `error` frame too.
 *
 * `requestId` is the stable cancel key: it must match the id the web sends in
 * `cancel_download` (`path ? repo_id + "/" + path : repo_id`) so the bridge can
 * correlate a later `cancelModelDownload(requestId)` to this download. The
 * default reproduces that composite so callers that don't track cancellation
 * still get a sensible, matching id.
 */
export async function relayWorkerDownload(
  socket: DownloadSocket,
  bridge: PythonBridge | undefined,
  workerManager: WorkerManager | undefined,
  msg: StartDownloadCommand,
  requestId: string = msg.path
    ? `${msg.repo_id ?? ""}/${msg.path}`
    : (msg.repo_id ?? ""),
  userId: string = "1"
): Promise<void> {
  const repoId = msg.repo_id ?? "";
  // The worker already emits a terminal `error`-status progress frame on
  // failure (forwarded verbatim below); track it so the catch doesn't send a
  // second, redundant error frame.
  let sawError = false;
  const fail = (error: string) => {
    try {
      socket.send(
        JSON.stringify({
          status: "error",
          repo_id: repoId,
          path: msg.path ?? null,
          model_type: msg.model_type ?? null,
          downloaded_bytes: 0,
          total_bytes: 0,
          downloaded_files: 0,
          current_files: [],
          total_files: 0,
          error
        })
      );
    } catch {
      /* socket gone */
    }
  };

  if (!workerManager) {
    fail("Worker support is not configured on this server");
    return;
  }
  const active = await workerManager.getActiveWorker();
  if (!active) {
    fail("No worker attached");
    return;
  }
  if (!bridge || !bridge.supportsModelManagement()) {
    fail("This worker's image is too old for model management.");
    return;
  }

  // The worker has no HuggingFace credential of its own, so a gated repo 401s
  // unless this server supplies one. Resolved here, never taken from `msg` —
  // that JSON comes from the client.
  const token = await resolveWorkerHfToken((key) =>
    getStoredSecret(key, userId)
  );

  try {
    await bridge.downloadModel(
      {
        repo_id: repoId,
        path: msg.path ?? null,
        allow_patterns: msg.allow_patterns ?? null,
        ignore_patterns: msg.ignore_patterns ?? null,
        model_type: msg.model_type ?? null,
        token
      },
      (update) => {
        if (update.status === "error") {
          sawError = true;
        }
        try {
          socket.send(JSON.stringify(update));
        } catch {
          /* socket gone */
        }
      },
      requestId
    );
  } catch (err) {
    // Suppress the redundant error frame if the worker already forwarded one.
    if (!sawError) {
      fail(err instanceof Error ? err.message : String(err));
    }
  }
}
