/**
 * The `hf-downloads` capability module — download a Hugging Face model into
 * the host's Hugging Face cache, and read its progress.
 *
 * Model downloads write gigabytes to the host disk, so `download_hf_model`
 * adds three guards to the `external` permission category:
 *
 * 1. It asks the user every time, through the run's own permission gate, with
 *    the repository and the bytes it would write. The rule key is
 *    `download_hf_model:<repo>`, so "Always allow" covers that repository only.
 *    A headless host has nobody to ask and denies the call.
 * 2. It refuses when the download would leave less than
 *    {@link MIN_FREE_BYTES_AFTER_DOWNLOAD} free on the cache's file system.
 * 3. It refuses on a production server, where `/ws/download` is not
 *    registered either, and on any shared server: the cloud profile or
 *    enforced authentication. There the approval prompt reaches the user who
 *    asked, not the operator whose disk and cache the download fills.
 *
 * The download itself runs on the same per-user `DownloadManager` the Model
 * Manager's `/ws/download` socket uses, so the app's download list shows it.
 * There is no delete: removing a model other runs depend on stays in the app.
 */

import { statfs } from "node:fs/promises";
import { dirname } from "node:path";
import { getHfHubCacheDir, isAuthEnforced } from "@nodetool-ai/config";
import {
  CLOUD_PROFILE_ENV,
  NODE_ENV_VAR,
  isCloudProfileActive
} from "@nodetool-ai/protocol";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { CapabilityExport, CapabilityModule, CapabilityRun } from "./types.js";
import { userIdOf } from "../tools/mcp-tool-support.js";
import { grantsStandingApproval, isPreapproved } from "../tools/tool-permissions.js";
import { isString } from "../utils/type-guards.js";
import { downloadHfModelSpec, getHfDownloadSpec } from "./hf-downloads.specs.js";

/** Free space a download must leave on the cache's file system. */
export const MIN_FREE_BYTES_AFTER_DOWNLOAD = 5 * 1024 ** 3;

const REPO_ID = /^[A-Za-z0-9][\w.-]*\/[\w.-]+$/;

/** True where downloads into the host cache are refused. */
export const isSharedDownloadHost = (): boolean =>
  process.env["NODETOOL_ENV"] === "production" ||
  isCloudProfileActive(process.env[CLOUD_PROFILE_ENV], process.env[NODE_ENV_VAR]) ||
  isAuthEnforced();

/** Test seam: the free bytes on the file system holding `dir`. */
export type FreeBytesProbe = (dir: string) => Promise<number>;

let probeFreeBytes: FreeBytesProbe = async (dir) => {
  // The cache directory may not exist yet. Its nearest existing ancestor is on
  // the file system the download will fill.
  let current = dir;
  for (;;) {
    try {
      const stats = await statfs(current);
      return stats.bavail * stats.bsize;
    } catch (error) {
      const parent = dirname(current);
      if (parent === current) throw error;
      current = parent;
    }
  }
};

/** Replace the free-space probe. Returns the previous one. Tests only. */
export function setFreeBytesProbeForTesting(probe: FreeBytesProbe): FreeBytesProbe {
  const previous = probeFreeBytes;
  probeFreeBytes = probe;
  return previous;
}

const formatBytes = (bytes: number): string => {
  if (bytes < 1024 ** 2) return `${Math.max(0, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
};

function readRepoId(params: Record<string, unknown>): string | { error: string } {
  const value = params["repo_id"];
  const repoId = isString(value) ? value.trim() : "";
  if (!REPO_ID.test(repoId) || repoId.includes("..")) {
    return { error: "repo_id must be a Hugging Face repository such as `org/name`." };
  }
  return repoId;
}

function readPath(params: Record<string, unknown>): string | null | { error: string } {
  const value = params["path"];
  if (value === undefined || value === null || value === "") return null;
  const path = isString(value) ? value.trim() : "";
  if (path === "" || path.startsWith("/") || path.split("/").includes("..")) {
    return { error: "path must be a file path inside the repository." };
  }
  return path;
}

function readPatterns(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const patterns = value.filter(isString).map((p) => p.trim()).filter(Boolean);
  return patterns.length > 0 ? patterns : null;
}

function secretReader(context: ProcessingContext) {
  return (key: string) => context.getSecret(key);
}

async function approve(run: CapabilityRun, repoId: string, message: string): Promise<boolean> {
  const ruleKey = `${downloadHfModelSpec.name}:${repoId}`;
  if (isPreapproved(run.gate, ruleKey)) return true;
  const decision = await run.gate.requestApproval({
    toolName: downloadHfModelSpec.name,
    category: "external",
    args: { repo_id: repoId },
    message,
    ruleKey
  });
  if (grantsStandingApproval(decision)) {
    run.gate.sessionAllow.add(ruleKey);
    return true;
  }
  return decision === "allow";
}

const downloadHfModel: CapabilityExport = {
  spec: downloadHfModelSpec,
  impl: async (run, params) => {
    if (isSharedDownloadHost()) {
      return { error: "Hugging Face downloads are disabled on a shared server." };
    }
    const repoId = readRepoId(params);
    if (typeof repoId !== "string") return repoId;
    const path = readPath(params);
    if (path !== null && typeof path !== "string") return path;
    const allowPatterns = readPatterns(params["allow_patterns"]);
    const ignorePatterns = readPatterns(params["ignore_patterns"]);

    const hf = await import("@nodetool-ai/huggingface");
    const readSecret = secretReader(run.context);
    const access = await hf.resolveHfHubAccess(readSecret, "download");
    const endpoint = access.endpoint;

    let plan: Awaited<ReturnType<typeof hf.planHfDownload>>;
    try {
      plan = await hf.planHfDownload(repoId, {
        path,
        allowPatterns,
        ignorePatterns,
        token: access.token ?? null,
        endpoint
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { error: `Could not list ${repoId} on Hugging Face: ${message}` };
    }
    const target = path === null ? repoId : `${repoId}/${path}`;
    if (plan.files.length === 0) {
      return plan.cachedFiles.length > 0
        ? { status: "already_cached", repo_id: repoId, path, cached_files: plan.cachedFiles.length }
        : { error: `No downloadable files match ${target}.` };
    }

    const cacheDir = getHfHubCacheDir();
    const freeBytes = await probeFreeBytes(cacheDir);
    const freeAfter = freeBytes - plan.totalBytes;
    if (freeAfter < MIN_FREE_BYTES_AFTER_DOWNLOAD) {
      return {
        error: "insufficient_disk_space",
        message:
          `Downloading ${target} needs ${formatBytes(plan.totalBytes)} and ` +
          `${formatBytes(freeBytes)} is free on the disk holding ${cacheDir}. ` +
          `A download must leave at least ${formatBytes(MIN_FREE_BYTES_AFTER_DOWNLOAD)} free. ` +
          "Tell the user how much space to free; do not retry the same call."
      };
    }

    const approved = await approve(
      run,
      repoId,
      `Download ${target} from Hugging Face: ${plan.files.length} ` +
        `file${plan.files.length === 1 ? "" : "s"}, ${formatBytes(plan.totalBytes)}, ` +
        `into ${cacheDir}. ${formatBytes(freeAfter)} will stay free.`
    );
    if (!approved) {
      return {
        error: "permission_denied",
        message:
          `The user declined to download ${target}. Do not retry the same ` +
          "call; explain what the model was for or propose an alternative."
      };
    }

    const manager = hf.getDownloadManager(userIdOf(run.context));
    // startDownload resolves when the download ends and records failures in
    // its own state, which get_hf_download reads. The call does not wait.
    void manager.startDownload(repoId, {
      path,
      allowPatterns,
      ignorePatterns,
      // `false`: no implicit fallback to the server's token in the manager.
      token: access.token ?? false,
      endpoint
    });
    return {
      status: "started",
      repo_id: repoId,
      path,
      files: plan.files.length,
      total_bytes: plan.totalBytes,
      cached_files: plan.cachedFiles.length,
      cache_dir: cacheDir
    };
  }
};

const getHfDownload: CapabilityExport = {
  spec: getHfDownloadSpec,
  impl: async (run, params) => {
    const repoId = readRepoId(params);
    if (typeof repoId !== "string") return repoId;
    const path = readPath(params);
    if (path !== null && typeof path !== "string") return path;
    const hf = await import("@nodetool-ai/huggingface");
    const manager = hf.getExistingDownloadManager(userIdOf(run.context));
    const state = manager?.getDownloadState(path === null ? repoId : `${repoId}/${path}`);
    if (!state) return { status: "unknown", repo_id: repoId, path };
    const result: Record<string, unknown> = {
      status: state.status,
      repo_id: state.repoId,
      path: state.path,
      downloaded_bytes: state.downloadedBytes,
      total_bytes: state.totalBytes,
      downloaded_files: state.downloadedFiles.length,
      total_files: state.totalFiles,
      current_files: [...state.currentFiles]
    };
    if (state.errorMessage) result["error"] = state.errorMessage;
    return result;
  }
};

export const HF_DOWNLOAD_CAPABILITIES: readonly CapabilityExport[] = [
  downloadHfModel,
  getHfDownload
];

export const module: CapabilityModule = {
  module: "hf-downloads",
  exports: HF_DOWNLOAD_CAPABILITIES
};

export { downloadHfModel, getHfDownload };
