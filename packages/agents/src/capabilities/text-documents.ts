/**
 * The `text-documents` capability module — Markdown documents read, changed
 * and versioned with no editor open (PRD R16), through the service in
 * `@nodetool-ai/asset-services/text-documents` that the tRPC routes and the
 * CLI also call.
 *
 * Every change records the content it replaces as a version, once per agent
 * turn or workflow run (R11): the run's `jobId` is the turn id in a chat
 * turn and the job id in a workflow run.
 */

import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Asset } from "@nodetool-ai/models";
import type { Workspace } from "@nodetool-ai/runtime";
import type { CapabilityExport, CapabilityModule, CapabilityRun } from "./types.js";
import { userIdOf } from "../tools/mcp-tool-support.js";
import { isFunction, isNonBlankString, isString } from "../utils/type-guards.js";
import { resolveReadProjectId, resolveProjectId } from "./project-scope.js";
import {
  createDocumentSpec,
  createDocumentVersionSpec,
  deleteDocumentVersionSpec,
  editDocumentSpec,
  exportDocumentSpec,
  exportGoogleDocSpec,
  importDocumentSpec,
  importGoogleDocSpec,
  listDocumentVersionsSpec,
  readDocumentSpec,
  renameDocumentVersionSpec,
  restoreDocumentVersionSpec
} from "./text-documents.specs.js";

/** Context key holding the active staged-approval handler for a focused Markdown document (PRD D2, R8). */
export const STAGED_DOCUMENT_EDITS_CONTEXT_KEY = "staged_document_edits";

export interface StagedDocumentEditHandler {
  assetId: string;
  /** Optional workspace path of the staged document (normalized, project-relative). */
  workspacePath?: string | null;
  projectId?: string | null;
  /**
   * When set, the focused document could not be loaded for staged approval and
   * document edits, restores, and Markdown file writes must fail closed with
   * this reason instead of mutating disk.
   */
  refuseReason?: string | null;
  /**
   * When set, the focused document's path could not be mapped in the turn's
   * workspace so Markdown file writes in the workspace fail closed with this
   * reason while `edit_document` / `restore_document_version` by `asset_id`
   * continue staging through this handler.
   */
  workspaceRefuseReason?: string | null;
  /** Latest staged content in this turn, or null before the first edit. */
  currentContent: string | null;
  /** Initial base content captured before the first edit in this turn. */
  baseContent: string | null;
  onProposal: (proposal: {
    proposalId: string;
    assetId: string;
    baseContent: string;
    proposedContent: string;
  }) => void;
}

type StagedContextLike = {
  userId?: string;
  projectId?: string | null;
  get?: <T = unknown>(key: string) => T | undefined;
};

function getStagedDocumentEditHandler(
  context: StagedContextLike | null | undefined
): StagedDocumentEditHandler | null {
  if (!context || !isFunction(context.get)) return null;
  const value = context.get<StagedDocumentEditHandler>(
    STAGED_DOCUMENT_EDITS_CONTEXT_KEY
  );
  if (
    !value ||
    !isString(value.assetId) ||
    !isFunction(value.onProposal)
  ) {
    return null;
  }
  return value;
}

type DocumentSaveType = "agent_turn" | "workflow_run";

/** The cause a write from `context` records its pre-change version under. */
export function documentCauseOf(context: {
  jobId: string;
  threadId: string | null;
}): { saveType: DocumentSaveType; causeId: string } {
  return {
    saveType: context.threadId ? "agent_turn" : "workflow_run",
    causeId: context.jobId
  };
}

const service = () => import("@nodetool-ai/asset-services/text-documents");

const MARKDOWN_PATH_RE = /\.(md|markdown)$/i;

function normalizePath(path: string): string {
  return path.trim().replace(/\\/g, "/").replace(/^(\.\/)+/, "").replace(/^\/+/, "");
}

function isMarkdownPath(path: string): boolean {
  return MARKDOWN_PATH_RE.test(normalizePath(path));
}

/** The document a call names by asset_id or path, in the run's project. */
async function findDocument(
  run: CapabilityRun,
  params: Record<string, unknown>
): Promise<Asset | { error: string }> {
  const userId = userIdOf(run.context);
  const { requireTextDocument, TextDocumentError } = await service();
  const assetId = params["asset_id"];
  const path = params["path"];
  try {
    if (isNonBlankString(assetId)) {
      return await requireTextDocument(userId, assetId.trim());
    }
    if (isNonBlankString(path)) {
      const { Asset } = await import("@nodetool-ai/models");
      const projectId = await resolveReadProjectId(run, params);
      const [row] = await Asset.findByWorkspacePath(
        userId,
        projectId,
        normalizePath(path)
      );
      if (!row) return { error: `No document at ${path} in this project.` };
      return await requireTextDocument(userId, row.id);
    }
  } catch (error) {
    if (error instanceof TextDocumentError) return { error: error.message };
    throw error;
  }
  return { error: "Pass asset_id or path." };
}

function describe(asset: Asset) {
  return {
    asset_id: asset.id,
    name: asset.name,
    path: asset.workspace_path,
    project_id: asset.project_id,
    updated_at: asset.updated_at
  };
}

/** Run `body`, answering a document error as an `{ error }` result. */
async function answering<T>(body: () => Promise<T>): Promise<T | { error: string }> {
  const { TextDocumentError } = await service();
  try {
    return await body();
  } catch (error) {
    if (error instanceof TextDocumentError) return { error: error.message };
    throw error;
  }
}

const createDocument: CapabilityExport = {
  spec: createDocumentSpec,
  impl: async (run, params) => {
    const name = params["name"];
    const content = params["content"];
    if (!isNonBlankString(name)) return { error: "name is required." };
    if (!isString(content)) return { error: "content is required." };
    const directory = params["directory"];
    const { createTextDocument } = await service();
    return answering(async () => {
      const asset = await createTextDocument({
        userId: userIdOf(run.context),
        projectId: resolveProjectId(run, params),
        name: name.trim(),
        content,
        directory: isNonBlankString(directory) ? normalizePath(directory) : undefined
      });
      return describe(asset);
    });
  }
};

const readDocument: CapabilityExport = {
  spec: readDocumentSpec,
  impl: async (run, params) => {
    const asset = await findDocument(run, params);
    if ("error" in asset) return asset;
    const { readTextDocument } = await service();
    const staged = getStagedDocumentEditHandler(run.context);
    return answering(async () => ({
      ...describe(asset),
      content:
        staged && staged.assetId === asset.id && staged.currentContent !== null
          ? staged.currentContent
          : await readTextDocument(asset)
    }));
  }
};

const editDocument: CapabilityExport = {
  spec: editDocumentSpec,
  impl: async (run, params) => {
    const staged = getStagedDocumentEditHandler(run.context);
    if (staged && isNonBlankString(staged.refuseReason)) {
      return { error: staged.refuseReason };
    }
    const asset = await findDocument(run, params);
    if ("error" in asset) return asset;
    const edits = params["edits"];
    const content = params["content"];
    const append = params["append"];
    const given = [Array.isArray(edits), isString(content), isString(append)]
      .filter(Boolean).length;
    if (given !== 1) {
      return { error: "Pass exactly one of edits, content or append." };
    }
    const { applyTextDocumentEdits, readTextDocument, writeTextDocument } =
      await service();
    const isStaged = staged !== null && staged.assetId === asset.id;
    return answering(async () => {
      const current =
        isStaged && staged.currentContent !== null
          ? staged.currentContent
          : await readTextDocument(asset);
      let next: string;
      let replacements = 0;
      if (Array.isArray(edits)) {
        const applied = applyTextDocumentEdits(current, edits);
        next = applied.text;
        replacements = applied.replacements;
      } else if (isString(content)) {
        next = content;
      } else {
        const body = String(append).replace(/^\n+/, "");
        const base = current.replace(/\n*$/, "");
        next = base === "" ? `${body.replace(/\n*$/, "")}\n` : `${base}\n\n${body.replace(/\n*$/, "")}\n`;
      }
      if (next === current) {
        return { ...describe(asset), changed: false };
      }
      if (isStaged) {
        if (staged.baseContent === null) {
          staged.baseContent = current;
        }
        staged.currentContent = next;
        staged.onProposal({
          proposalId: randomUUID(),
          assetId: asset.id,
          baseContent: staged.baseContent,
          proposedContent: next
        });
        const result: Record<string, unknown> = {
          ...describe(asset),
          changed: true,
          staged: true,
          note: "Changes staged for user review in the editor. Disk file was not modified yet."
        };
        if (Array.isArray(edits)) result["replacements"] = replacements;
        return result;
      }
      const saved = await writeTextDocument(asset, next, {
        cause: documentCauseOf(run.context)
      });
      const result: Record<string, unknown> = { ...describe(saved), changed: true };
      if (Array.isArray(edits)) result["replacements"] = replacements;
      return result;
    });
  }
};

const listDocumentVersions: CapabilityExport = {
  spec: listDocumentVersionsSpec,
  impl: async (run, params) => {
    const asset = await findDocument(run, params);
    if ("error" in asset) return asset;
    const { TextDocumentVersion } = await import("@nodetool-ai/models");
    const versions = await TextDocumentVersion.listForAsset(asset.id);
    return {
      ...describe(asset),
      versions: versions.map((version) => ({
        version: version.version,
        name: version.name,
        save_type: version.save_type,
        cause_id: version.cause_id,
        created_at: version.created_at
      }))
    };
  }
};

const createDocumentVersion: CapabilityExport = {
  spec: createDocumentVersionSpec,
  impl: async (run, params) => {
    const asset = await findDocument(run, params);
    if ("error" in asset) return asset;
    const name = params["name"];
    const { readTextDocument, recordTextDocumentVersion } = await service();
    return answering(async () => {
      const version = await recordTextDocumentVersion(
        asset,
        await readTextDocument(asset),
        { saveType: "manual" },
        isNonBlankString(name) ? name.trim() : null
      );
      return { ...describe(asset), version: version.version };
    });
  }
};

const renameDocumentVersion: CapabilityExport = {
  spec: renameDocumentVersionSpec,
  impl: async (run, params) => {
    const asset = await findDocument(run, params);
    if ("error" in asset) return asset;
    const version = Number(params["version"]);
    if (!Number.isInteger(version) || version < 1) {
      return { error: "version must be a positive integer." };
    }
    const rawName = params["name"];
    if (rawName !== undefined && rawName !== null && !isString(rawName)) {
      return { error: "name must be a string or null." };
    }
    const name = isString(rawName) ? rawName.trim() || null : null;
    const { renameTextDocumentVersion } = await service();
    return answering(async () => {
      const updated = await renameTextDocumentVersion(asset, version, name);
      return { ...describe(asset), version: updated.version, name: updated.name };
    });
  }
};

const deleteDocumentVersion: CapabilityExport = {
  spec: deleteDocumentVersionSpec,
  impl: async (run, params) => {
    const asset = await findDocument(run, params);
    if ("error" in asset) return asset;
    const version = Number(params["version"]);
    if (!Number.isInteger(version) || version < 1) {
      return { error: "version must be a positive integer." };
    }
    const { deleteTextDocumentVersion } = await service();
    return answering(async () => {
      await deleteTextDocumentVersion(asset, version);
      return { ...describe(asset), deleted_version: version };
    });
  }
};

const restoreDocumentVersion: CapabilityExport = {
  spec: restoreDocumentVersionSpec,
  impl: async (run, params) => {
    const staged = getStagedDocumentEditHandler(run.context);
    if (staged && isNonBlankString(staged.refuseReason)) {
      return { error: staged.refuseReason };
    }
    const asset = await findDocument(run, params);
    if ("error" in asset) return asset;
    const version = Number(params["version"]);
    if (!Number.isInteger(version)) return { error: "version must be an integer." };
    if (staged !== null && staged.assetId === asset.id) {
      const { TextDocumentVersion } = await import("@nodetool-ai/models");
      const { readTextDocument } = await service();
      return answering(async () => {
        const restored = await TextDocumentVersion.findByVersion(asset.id, version);
        if (!restored) {
          return { error: `${asset.name} has no version ${version}.` };
        }
        const current = staged.currentContent ?? (await readTextDocument(asset));
        if (restored.content === current) {
          return {
            ...describe(asset),
            restored_version: restored.version,
            changed: false
          };
        }
        if (staged.baseContent === null) {
          staged.baseContent = current;
        }
        staged.currentContent = restored.content;
        staged.onProposal({
          proposalId: randomUUID(),
          assetId: asset.id,
          baseContent: staged.baseContent,
          proposedContent: restored.content
        });
        return {
          ...describe(asset),
          restored_version: restored.version,
          staged: true,
          changed: true,
          note: "Restore staged for user review in the editor. Disk file was not modified yet."
        };
      });
    }
    const { restoreTextDocumentVersion } = await service();
    return answering(async () => {
      const { asset: saved, restored, latest, changed } =
        await restoreTextDocumentVersion(asset, version);
      return {
        ...describe(saved),
        restored_version: restored.version,
        latest_version: latest.version,
        changed
      };
    });
  }
};

const transfer = () => import("../text-document-transfer.js");

/** Run `body`, answering a document or transfer error as an `{ error }` result. */
async function transferring<T>(body: () => Promise<T>): Promise<T | { error: string }> {
  const { DocumentTransferError } = await transfer();
  return answering(async () => {
    try {
      return await body();
    } catch (error) {
      if (error instanceof DocumentTransferError) return { error: error.message };
      throw error;
    }
  });
}

/** The file a call names by asset_id or path, in the run's project. */
async function findFileAssetId(
  run: CapabilityRun,
  params: Record<string, unknown>
): Promise<string | { error: string }> {
  const assetId = params["asset_id"];
  if (isNonBlankString(assetId)) return assetId.trim();
  const path = params["path"];
  if (!isNonBlankString(path)) return { error: "Pass asset_id or path." };
  const { Asset } = await import("@nodetool-ai/models");
  const projectId = await resolveReadProjectId(run, params);
  const [row] = await Asset.findByWorkspacePath(userIdOf(run.context), projectId, normalizePath(path));
  return row ? row.id : { error: `No file at ${path} in this project.` };
}

const importDocument: CapabilityExport = {
  spec: importDocumentSpec,
  impl: async (run, params) => {
    const sourceAssetId = await findFileAssetId(run, params);
    if (!isString(sourceAssetId)) return sourceAssetId;
    const name = params["name"];
    const { importAssetAsDocument } = await transfer();
    return transferring(async () =>
      describe(
        await importAssetAsDocument({
          userId: userIdOf(run.context),
          sourceAssetId,
          projectId: resolveProjectId(run, params),
          name: isNonBlankString(name) ? name : undefined
        })
      )
    );
  }
};

function isExportFormat(
  value: unknown
): value is "md" | "txt" | "pdf" | "html" {
  return value === "md" || value === "txt" || value === "pdf" || value === "html";
}

const exportDocument: CapabilityExport = {
  spec: exportDocumentSpec,
  impl: async (run, params) => {
    const format = params["format"];
    if (!isExportFormat(format)) {
      return { error: "format must be md, txt, pdf or html." };
    }
    const asset = await findDocument(run, params);
    if ("error" in asset) return asset;
    const directory = isString(params["directory"])
      ? params["directory"]
      : undefined;
    const name = isNonBlankString(params["name"]) ? params["name"] : undefined;
    const staged = getStagedDocumentEditHandler(run.context);
    const contentOverride =
      staged && staged.assetId === asset.id && staged.currentContent !== null
        ? staged.currentContent
        : undefined;
    const { exportDocumentFile } = await transfer();
    return transferring(async () =>
      describe(
        await exportDocumentFile(asset, format, {
          directory,
          name,
          contentOverride
        })
      )
    );
  }
};

/** The user's Google access token, or an error naming the sign-in. */
async function googleToken(run: CapabilityRun): Promise<string | { error: string }> {
  const { requireGoogleAccessToken } = await import("@nodetool-ai/runtime");
  try {
    return await requireGoogleAccessToken(run.context);
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

const importGoogleDocCapability: CapabilityExport = {
  spec: importGoogleDocSpec,
  impl: async (run, params) => {
    const { googleDocIdOf, importGoogleDoc } = await transfer();
    const raw = params["document_id"];
    const documentId = isNonBlankString(raw) ? googleDocIdOf(raw) : null;
    if (!documentId) return { error: "document_id must be a Google Doc id or its URL." };
    const token = await googleToken(run);
    if (!isString(token)) return token;
    const directory = params["directory"];
    try {
      return describe(
        await importGoogleDoc({
          userId: userIdOf(run.context),
          token,
          documentId,
          projectId: resolveProjectId(run, params),
          directory: isNonBlankString(directory) ? normalizePath(directory) : undefined
        })
      );
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }
};

const exportGoogleDocCapability: CapabilityExport = {
  spec: exportGoogleDocSpec,
  impl: async (run, params) => {
    const asset = await findDocument(run, params);
    if ("error" in asset) return asset;
    const token = await googleToken(run);
    if (!isString(token)) return token;
    const title = params["title"];
    const staged = getStagedDocumentEditHandler(run.context);
    const contentOverride =
      staged && staged.assetId === asset.id && staged.currentContent !== null
        ? staged.currentContent
        : undefined;
    const { exportGoogleDoc } = await transfer();
    try {
      const doc = await exportGoogleDoc({
        token,
        document: asset,
        title: isNonBlankString(title) ? title : undefined,
        contentOverride
      });
      return { document_id: doc.id, name: doc.name, url: doc.url };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }
};

export const TEXT_DOCUMENT_CAPABILITIES: readonly CapabilityExport[] = [
  createDocument,
  readDocument,
  editDocument,
  listDocumentVersions,
  createDocumentVersion,
  renameDocumentVersion,
  deleteDocumentVersion,
  restoreDocumentVersion,
  importDocument,
  exportDocument,
  importGoogleDocCapability,
  exportGoogleDocCapability
];

export const module: CapabilityModule = {
  module: "text-documents",
  exports: TEXT_DOCUMENT_CAPABILITIES
};

async function matchStagedHandlerForPath(
  context: StagedContextLike,
  path: string
): Promise<StagedDocumentEditHandler | null> {
  if (!isMarkdownPath(path)) return null;
  const handler = getStagedDocumentEditHandler(context);
  if (!handler) return null;
  if (
    isNonBlankString(handler.refuseReason) ||
    isNonBlankString(handler.workspaceRefuseReason)
  ) {
    return null;
  }
  const normalized = normalizePath(path);
  if (isNonBlankString(handler.workspacePath)) {
    const samePath = normalizePath(handler.workspacePath) === normalized;
    const sameProject =
      !isNonBlankString(handler.projectId) ||
      !isNonBlankString(context.projectId) ||
      handler.projectId === context.projectId;
    if (samePath && sameProject) return handler;
  }
  if (isNonBlankString(context.userId) && isNonBlankString(context.projectId)) {
    try {
      const { Asset } = await import("@nodetool-ai/models");
      const [asset] = await Asset.findByWorkspacePath(
        context.userId,
        context.projectId,
        normalized
      );
      if (asset && asset.id === handler.assetId) return handler;
    } catch {
      // A host with no database falls back to workspacePath matching above.
    }
  }
  return null;
}

/**
 * Return the latest staged Markdown content when `path` matches the active
 * staged-edit handler on `context`, or null when no staged edit exists for it.
 */
export async function readStagedFileContentIfActive(
  context: StagedContextLike,
  path: string
): Promise<string | null> {
  const handler = await matchStagedHandlerForPath(context, path);
  return handler ? handler.currentContent : null;
}

/**
 * Stage a Markdown file write when `context` has a matching staged-edit handler
 * (PRD D2, R8). Returns true when staged so `write_file`/`edit_file` skip
 * modifying disk bytes. Throws when staged approval failed closed for Markdown
 * writes in this workspace.
 */
export async function stageFileWriteIfActive(
  context: StagedContextLike,
  path: string,
  previous: string,
  nextContent: string
): Promise<boolean> {
  if (!isMarkdownPath(path)) return false;
  const activeHandler = getStagedDocumentEditHandler(context);
  if (activeHandler) {
    const blockReason = isNonBlankString(activeHandler.refuseReason)
      ? activeHandler.refuseReason
      : isNonBlankString(activeHandler.workspaceRefuseReason)
        ? activeHandler.workspaceRefuseReason
        : null;
    if (blockReason !== null) {
      throw new Error(blockReason);
    }
  }
  const handler = await matchStagedHandlerForPath(context, path);
  if (!handler) return false;
  if (handler.baseContent === null) {
    handler.baseContent = previous;
  }
  handler.currentContent = nextContent;
  handler.onProposal({
    proposalId: randomUUID(),
    assetId: handler.assetId,
    baseContent: handler.baseContent,
    proposedContent: nextContent
  });
  return true;
}

/**
 * Wrap a {@link Workspace} so every read, write, copy, move, delete, or absorb
 * targeting the open Markdown document at `stagedPath` routes through `handler`
 * instead of mutating disk bytes (PRD D2, R8).
 */
export function stageWorkspaceDocument(
  inner: Workspace,
  stagedPath: string,
  handler: StagedDocumentEditHandler
): Workspace {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder("utf-8");

  let normalizedTarget: string;
  try {
    normalizedTarget = normalizePath(inner.key(stagedPath));
  } catch {
    normalizedTarget = normalizePath(stagedPath);
  }

  const matchesStaged = (path: string): boolean => {
    try {
      return normalizePath(inner.key(path)) === normalizedTarget;
    } catch {
      return false;
    }
  };

  const containsStaged = (path: string): boolean => {
    try {
      const normalized =
        path === "" || path === "." || path === "/"
          ? ""
          : normalizePath(inner.key(path));
      if (normalized === "") return true;
      return (
        normalized === normalizedTarget ||
        normalizedTarget.startsWith(`${normalized}/`)
      );
    } catch {
      return false;
    }
  };

  const decodeData = (data: Uint8Array | string): string =>
    isString(data) ? data : decoder.decode(data);

  const stageNextContent = async (next: string): Promise<void> => {
    const current =
      handler.currentContent ?? (await inner.readText(normalizedTarget)) ?? "";
    if (next === current) {
      return;
    }
    if (handler.baseContent === null) {
      handler.baseContent = current;
    }
    handler.currentContent = next;
    handler.onProposal({
      proposalId: randomUUID(),
      assetId: handler.assetId,
      baseContent: handler.baseContent,
      proposedContent: next
    });
  };

  return {
    get localDir() {
      return null;
    },
    key: (path) => inner.key(path),
    uri: (path) => inner.uri(path),
    list: (path, opts) => inner.list(path, opts),
    mkdir: (path) => inner.mkdir(path),
    isNestedFolder: (path) => inner.isNestedFolder(path),
    async materialize(path) {
      if (matchesStaged(path)) {
        throw new Error(
          "Cannot materialize the open document while staged approval is active."
        );
      }
      return inner.materialize(path);
    },
    scratchDir: () => inner.scratchDir(),
    cleanupScratch: () => inner.cleanupScratch?.() ?? Promise.resolve(),

    async read(path) {
      if (matchesStaged(path) && handler.currentContent !== null) {
        return encoder.encode(handler.currentContent);
      }
      return inner.read(path);
    },
    async readText(path) {
      if (matchesStaged(path) && handler.currentContent !== null) {
        return handler.currentContent;
      }
      return inner.readText(path);
    },
    async exists(path) {
      if (matchesStaged(path) && handler.currentContent !== null) {
        return true;
      }
      return inner.exists(path);
    },
    async stat(path) {
      if (matchesStaged(path) && handler.currentContent !== null) {
        const base = await inner.stat(path);
        return {
          path: base?.path ?? normalizedTarget,
          size: encoder.encode(handler.currentContent).byteLength,
          modifiedAt: base?.modifiedAt ?? Date.now(),
          contentType: base?.contentType ?? "text/markdown",
          isDirectory: false
        };
      }
      return inner.stat(path);
    },
    async write(path, data, contentType) {
      if (matchesStaged(path)) {
        await stageNextContent(decodeData(data));
        return;
      }
      await inner.write(path, data, contentType);
    },
    async writeNew(path, data, contentType, options) {
      if (matchesStaged(path)) {
        if (
          handler.currentContent !== null ||
          (await inner.exists(normalizedTarget))
        ) {
          return false;
        }
        await stageNextContent(decodeData(data));
        return true;
      }
      return inner.writeNew(path, data, contentType, options);
    },
    async delete(path) {
      if (matchesStaged(path)) {
        throw new Error(
          "Cannot delete the open document while staged approval is active."
        );
      }
      return inner.delete(path);
    },
    async deleteAll(path) {
      if (containsStaged(path)) {
        throw new Error(
          "Cannot delete the open document while staged approval is active."
        );
      }
      return inner.deleteAll(path);
    },
    async move(from, to) {
      if (matchesStaged(from) || matchesStaged(to) || containsStaged(from)) {
        throw new Error(
          "Cannot move or overwrite the open document while staged approval is active."
        );
      }
      await inner.move(from, to);
    },
    async copy(from, to) {
      if (matchesStaged(to)) {
        let next: string;
        if (matchesStaged(from) && handler.currentContent !== null) {
          next = handler.currentContent;
        } else {
          const bytes = await inner.read(from);
          if (bytes === null) {
            throw new Error(`ENOENT: no such file: ${from}`);
          }
          next = decoder.decode(bytes);
        }
        await stageNextContent(next);
        return;
      }
      if (matchesStaged(from) && handler.currentContent !== null) {
        await inner.write(to, encoder.encode(handler.currentContent));
        return;
      }
      await inner.copy(from, to);
    },
    async absorb(localPath, path) {
      if (matchesStaged(path)) {
        const bytes = await readFile(localPath);
        await stageNextContent(decoder.decode(bytes));
        return;
      }
      await inner.absorb(localPath, path);
    },
    async absorbNew(localPath, path, contentType) {
      if (matchesStaged(path)) {
        if (
          handler.currentContent !== null ||
          (await inner.exists(normalizedTarget))
        ) {
          return false;
        }
        const bytes = await readFile(localPath);
        await stageNextContent(decoder.decode(bytes));
        return true;
      }
      return inner.absorbNew(localPath, path, contentType);
    }
  };
}

/**
 * Wrap a {@link Workspace} so every mutation or materialization targeting a
 * Markdown file (or deleting a directory) fails closed with `reason`, while
 * reads and non-Markdown operations continue delegating to `inner`.
 *
 * Exposes `localDir: null` so tools cannot bypass the `Workspace` boundary and
 * write directly to disk while staged approval is active.
 */
export function blockWorkspaceMarkdownWrites(
  inner: Workspace,
  reason: string
): Workspace {
  const isMarkdownTarget = (path: string): boolean => {
    try {
      return isMarkdownPath(inner.key(path));
    } catch {
      return isMarkdownPath(path);
    }
  };

  const isDirectoryTarget = async (path: string): Promise<boolean> => {
    const trimmed = path.trim();
    if (trimmed === "" || trimmed === "." || trimmed === "/") {
      return true;
    }
    try {
      const entry = await inner.stat(path);
      if (entry?.isDirectory) return true;
      if (entry === null) {
        const listed = await inner.list(path);
        return listed.length > 0;
      }
      return false;
    } catch {
      return false;
    }
  };

  return {
    get localDir() {
      return null;
    },
    key: (path) => inner.key(path),
    uri: (path) => inner.uri(path),
    read: (path) => inner.read(path),
    readText: (path) => inner.readText(path),
    exists: (path) => inner.exists(path),
    stat: (path) => inner.stat(path),
    list: (path, opts) => inner.list(path, opts),
    mkdir: (path) => inner.mkdir(path),
    isNestedFolder: (path) => inner.isNestedFolder(path),
    scratchDir: () => inner.scratchDir(),
    cleanupScratch: () => inner.cleanupScratch?.() ?? Promise.resolve(),

    async materialize(path) {
      if (isMarkdownTarget(path)) {
        throw new Error(reason);
      }
      return inner.materialize(path);
    },
    async write(path, data, contentType) {
      if (isMarkdownTarget(path)) {
        throw new Error(reason);
      }
      await inner.write(path, data, contentType);
    },
    async writeNew(path, data, contentType, options) {
      if (isMarkdownTarget(path)) {
        throw new Error(reason);
      }
      return inner.writeNew(path, data, contentType, options);
    },
    async delete(path) {
      if (isMarkdownTarget(path)) {
        throw new Error(reason);
      }
      return inner.delete(path);
    },
    async deleteAll(path) {
      if (isMarkdownTarget(path) || (await isDirectoryTarget(path))) {
        throw new Error(reason);
      }
      return inner.deleteAll(path);
    },
    async move(from, to) {
      if (isMarkdownTarget(from) || isMarkdownTarget(to)) {
        throw new Error(reason);
      }
      if (await isDirectoryTarget(from)) {
        const entries = await inner.list(from, { recursive: true });
        if (entries.some((entry) => !entry.isDirectory && isMarkdownPath(entry.path))) {
          throw new Error(reason);
        }
      }
      await inner.move(from, to);
    },
    async copy(from, to) {
      if (isMarkdownTarget(to)) {
        throw new Error(reason);
      }
      await inner.copy(from, to);
    },
    async absorb(localPath, path) {
      if (isMarkdownTarget(path)) {
        throw new Error(reason);
      }
      await inner.absorb(localPath, path);
    },
    async absorbNew(localPath, path, contentType) {
      if (isMarkdownTarget(path)) {
        throw new Error(reason);
      }
      return inner.absorbNew(localPath, path, contentType);
    }
  };
}

/**
 * Record the version an agent turn or workflow run replaces when it writes a
 * Markdown document through `write_file` or `edit_file` (R8, R11), so a write
 * to the file and an `edit_document` call leave the same history. Does
 * nothing outside a project, for a file with no asset row, or when the
 * database cannot be reached: the write itself goes ahead either way.
 */
export async function recordDocumentVersionBeforeFileWrite(
  context: {
    userId: string;
    projectId: string | null;
    jobId: string;
    threadId: string | null;
  },
  path: string,
  previous: string
): Promise<void> {
  if (!/\.(md|markdown)$/i.test(path) || !isNonBlankString(context.projectId)) {
    return;
  }
  try {
    const { Asset } = await import("@nodetool-ai/models");
    const [asset] = await Asset.findByWorkspacePath(
      context.userId,
      context.projectId,
      normalizePath(path)
    );
    if (!asset) return;
    const { recordTextDocumentVersion } = await service();
    await recordTextDocumentVersion(asset, previous, documentCauseOf(context));
  } catch {
    // A host with no database records no version; the file write still runs.
  }
}
