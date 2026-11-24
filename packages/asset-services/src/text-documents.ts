/**
 * Markdown documents read, written and versioned with no editor open: the
 * one path the document agent tools, the CLI and the version routes share.
 *
 * A document is a Markdown asset. Its file is in a project folder, or, for
 * an asset that predates project folders, under its storage key. A write
 * replaces the bytes and saves the row, which advances `updated_at`, so an
 * open editor sees the change and merges it against its draft (ADR 0001).
 *
 * Every write records the content it replaces as a version first. Writes
 * with one cause (an agent turn, a workflow run) record one version between
 * them: the state before the first.
 */
import {
  Asset,
  TextDocumentVersion,
  textDocumentContentHash,
  type TextDocumentSaveType
} from "@nodetool-ai/models";

import { getAssetStorageKey, retrieveAssetBytes } from "./asset-paths.js";
import {
  replaceProjectAssetBytes,
  saveProjectAsset,
  storeLegacyAssetBytes
} from "./project-asset.js";
import { projectAssetFile } from "./project-asset-file.js";
import { getAssetAdapter } from "./storage.js";

export const MARKDOWN_CONTENT_TYPE = "text/markdown";

/** Autosave versions kept per document. Older ones are pruned. */
export const KEPT_AUTOSAVE_VERSIONS = 20;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Thrown when a document cannot be read, written or found. */
export class TextDocumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TextDocumentError";
  }
}

/** Thrown when a document's backing file or legacy blob does not exist. */
export class TextDocumentMissingFileError extends TextDocumentError {
  constructor(message: string) {
    super(message);
    this.name = "TextDocumentMissingFileError";
  }
}

/** Whether `asset` is a Markdown document. */
export function isMarkdownDocument(asset: {
  content_type: string;
  name: string;
}): boolean {
  return (
    asset.content_type === MARKDOWN_CONTENT_TYPE ||
    asset.content_type === "text/x-markdown" ||
    /\.(md|markdown)$/i.test(asset.name)
  );
}

/** Load the user's document `assetId`, refusing a missing or non-Markdown asset. */
export async function requireTextDocument(
  userId: string,
  assetId: string
): Promise<Asset> {
  const asset = await Asset.find(userId, assetId);
  if (!asset || asset.content_type === "folder") {
    throw new TextDocumentError(`Document ${assetId} was not found.`);
  }
  if (!isMarkdownDocument(asset)) {
    throw new TextDocumentError(
      `${asset.name} is not a Markdown document (${asset.content_type}).`
    );
  }
  return asset;
}

/**
 * The bytes of any file asset: from its project folder, or under its storage
 * key for an asset that predates project folders.
 */
export async function readAssetFileBytes(asset: Asset): Promise<Uint8Array> {
  if (asset.workspace_path) {
    const file = await projectAssetFile(asset);
    if (!file) {
      throw new TextDocumentError(
        `The file of ${asset.name} cannot be reached in its project folder.`
      );
    }
    const bytes = await file.workspace.read(file.path);
    if (bytes === null) {
      throw new TextDocumentMissingFileError(
        `The file of ${asset.name} is missing.`
      );
    }
    return bytes;
  }
  const bytes = await retrieveAssetBytes(
    getAssetAdapter(),
    asset.user_id,
    asset.id,
    asset.content_type
  );
  if (!bytes) {
    throw new TextDocumentMissingFileError(`${asset.name} has no stored content.`);
  }
  return bytes;
}

/** The document's Markdown as it is saved now. */
export async function readTextDocument(asset: Asset): Promise<string> {
  return decoder.decode(await readAssetFileBytes(asset));
}

async function readTextDocumentIfPresent(asset: Asset): Promise<string | null> {
  try {
    return await readTextDocument(asset);
  } catch (error) {
    if (error instanceof TextDocumentMissingFileError) {
      return null;
    }
    throw error;
  }
}

async function assertExpectedUpdatedAt(
  asset: Asset,
  expectedUpdatedAt: string
): Promise<void> {
  if (asset.updated_at !== expectedUpdatedAt) {
    throw new TextDocumentError(
      `${asset.name} changed since it was read. Read it again and repeat the edit.`
    );
  }
  const fresh = await Asset.find(asset.user_id, asset.id);
  if (!fresh || fresh.updated_at !== expectedUpdatedAt) {
    throw new TextDocumentError(
      `${asset.name} changed since it was read. Read it again and repeat the edit.`
    );
  }
}

/** Why a version is recorded, and the turn or run it belongs to. */
export interface TextDocumentCause {
  saveType: TextDocumentSaveType;
  /** Turn or job id. Writes with one cause record one version. */
  causeId?: string | null;
}

export interface WriteTextDocumentOptions {
  /** Records the replaced content as a version before writing. */
  cause?: TextDocumentCause;
  /** Refuse the write when the row changed after this revision was read. */
  expectedUpdatedAt?: string;
}

/** Record `content` as a version of `asset`. Returns the existing version for a repeated cause. */
export async function recordTextDocumentVersion(
  asset: Asset,
  content: string,
  cause: TextDocumentCause,
  name?: string | null
): Promise<TextDocumentVersion> {
  const version = await TextDocumentVersion.snapshot({
    assetId: asset.id,
    userId: asset.user_id,
    content,
    saveType: cause.saveType,
    causeId: cause.causeId ?? null,
    name: name ?? null
  });
  if (cause.saveType === "autosave") {
    await TextDocumentVersion.pruneAutosaves(asset.id, KEPT_AUTOSAVE_VERSIONS);
  }
  return version;
}

/**
 * Replace the document's Markdown. Returns the saved row, with its new
 * `updated_at`.
 */
export async function writeTextDocument(
  asset: Asset,
  text: string,
  options: WriteTextDocumentOptions = {}
): Promise<Asset> {
  if (options.expectedUpdatedAt !== undefined) {
    await assertExpectedUpdatedAt(asset, options.expectedUpdatedAt);
  }
  if (options.cause) {
    const previous = await readTextDocumentIfPresent(asset);
    if (options.expectedUpdatedAt !== undefined) {
      await assertExpectedUpdatedAt(asset, options.expectedUpdatedAt);
    }
    if (previous !== null && previous !== text) {
      const shouldDedupAutomatic =
        options.cause.saveType === "agent_turn" ||
        options.cause.saveType === "autosave";
      const [newest] = shouldDedupAutomatic
        ? await TextDocumentVersion.listForAsset(asset.id, { limit: 1 })
        : [];
      if (!shouldDedupAutomatic || newest?.content_hash !== textDocumentContentHash(previous)) {
        await recordTextDocumentVersion(asset, previous, options.cause);
      }
    }
  }
  const bytes = encoder.encode(text);
  if (!asset.workspace_path) {
    const outcome = await storeLegacyAssetBytes(asset, async () => {
      await getAssetAdapter().store(
        getAssetStorageKey(asset.user_id, asset.id, asset.content_type),
        bytes,
        asset.content_type
      );
      asset.size = bytes.byteLength;
      await asset.save();
    });
    if (outcome === "stored") return asset;
  }
  const change = await replaceProjectAssetBytes(asset, bytes);
  if (!change) {
    throw new TextDocumentError(`${asset.name} has no file to write to.`);
  }
  try {
    await asset.save();
  } catch (error) {
    await change.undo();
    throw error;
  }
  await change.commit();
  return asset;
}

export interface CreateTextDocumentArgs {
  userId: string;
  projectId: string | null;
  name: string;
  content: string;
  /** Directory in the project folder. Defaults to the folder's root. */
  directory?: string | undefined;
}

/** Create a Markdown document in a project folder. */
export async function createTextDocument(
  args: CreateTextDocumentArgs
): Promise<Asset> {
  const name = /\.(md|markdown)$/i.test(args.name) ? args.name : `${args.name}.md`;
  return saveProjectAsset({
    userId: args.userId,
    projectId: args.projectId,
    name,
    contentType: MARKDOWN_CONTENT_TYPE,
    directory: args.directory ?? "",
    bytes: encoder.encode(args.content)
  });
}


/** Rename a stored version of `asset`, throwing when the version does not exist. */
export async function renameTextDocumentVersion(
  asset: Asset,
  version: number,
  name: string | null
): Promise<TextDocumentVersion> {
  const normalized = name === null ? null : name.trim() || null;
  const updated = await TextDocumentVersion.renameVersion(
    asset.id,
    version,
    normalized
  );
  if (!updated) {
    throw new TextDocumentError(`${asset.name} has no version ${version}.`);
  }
  return updated;
}

/** Delete a stored version of `asset`, throwing when the version does not exist. */
export async function deleteTextDocumentVersion(
  asset: Asset,
  version: number
): Promise<void> {
  const deleted = await TextDocumentVersion.deleteVersion(asset.id, version);
  if (!deleted) {
    throw new TextDocumentError(`${asset.name} has no version ${version}.`);
  }
}

/**
 * Restore version `version` of the document. Preserves any unsaved or
 * overwritten current draft in history first (unless the newest version
 * already holds identical content), writes the restored content to the
 * document, and records a new latest `restore` entry so prior history stays
 * intact and the restored state is the latest snapshot.
 */
export async function restoreTextDocumentVersion(
  asset: Asset,
  version: number
): Promise<{
  asset: Asset;
  restored: TextDocumentVersion;
  latest: TextDocumentVersion;
  changed: boolean;
}> {
  const restored = await TextDocumentVersion.findByVersion(asset.id, version);
  if (!restored) {
    throw new TextDocumentError(
      `${asset.name} has no version ${version}.`
    );
  }
  const expectedUpdatedAt = asset.updated_at;
  const current = await readTextDocumentIfPresent(asset);
  const [newest] = await TextDocumentVersion.listForAsset(asset.id, {
    limit: 1
  });
  if (current !== null && current === restored.content) {
    return { asset, restored, latest: newest ?? restored, changed: false };
  }
  await assertExpectedUpdatedAt(asset, expectedUpdatedAt);
  let preRestoreSnapshot: TextDocumentVersion | null = null;
  if (
    current !== null &&
    (!newest || newest.content_hash !== textDocumentContentHash(current))
  ) {
    preRestoreSnapshot = await recordTextDocumentVersion(asset, current, {
      saveType: "restore"
    });
  }
  let saved: Asset;
  try {
    saved = await writeTextDocument(asset, restored.content, {
      expectedUpdatedAt
    });
  } catch (error) {
    if (preRestoreSnapshot) {
      await TextDocumentVersion.deleteVersion(
        asset.id,
        preRestoreSnapshot.version
      ).catch(() => undefined);
    }
    throw error;
  }
  const label = restored.name || `Version ${restored.version}`;
  const latest = await recordTextDocumentVersion(
    saved,
    restored.content,
    { saveType: "restore" },
    `Restored from ${label}`
  );
  return { asset: saved, restored, latest, changed: true };
}

/** Apply exact-text replacements, as `edit_file` does. */
export interface TextDocumentEdit {
  old_text: string;
  new_text: string;
  /** Replace every occurrence instead of requiring exactly one. */
  replace_all?: boolean;
}

/** Apply `edits` in order. Throws naming the first edit that does not apply. */
export function applyTextDocumentEdits(
  text: string,
  edits: readonly TextDocumentEdit[]
): { text: string; replacements: number } {
  let result = text;
  let replacements = 0;
  edits.forEach((edit, index) => {
    if (edit.old_text === "") {
      throw new TextDocumentError(`Edit ${index + 1} has an empty old_text.`);
    }
    const count = result.split(edit.old_text).length - 1;
    if (count === 0) {
      throw new TextDocumentError(
        `Edit ${index + 1}: old_text was not found. Read the document again and copy the text exactly.`
      );
    }
    if (count > 1 && !edit.replace_all) {
      throw new TextDocumentError(
        `Edit ${index + 1}: old_text occurs ${count} times. Add surrounding text to make it unique, or set replace_all.`
      );
    }
    if (edit.replace_all) {
      result = result.split(edit.old_text).join(edit.new_text);
      replacements += count;
    } else {
      const at = result.indexOf(edit.old_text);
      result =
        result.slice(0, at) + edit.new_text + result.slice(at + edit.old_text.length);
      replacements += 1;
    }
  });
  return { text: result, replacements };
}

/** The text between appended content and what was there. */
export function appendSeparator(previous: string): string {
  if (previous === "" || previous.endsWith("\n\n")) return "";
  return previous.endsWith("\n") ? "\n" : "\n\n";
}

/** Arguments of the `writeTextDocument` model interface. */
export interface WriteTextDocumentInterfaceArgs {
  userId: string;
  assetId: string;
  content: string;
  mode: "replace" | "append";
  causeId: string | null;
  provenance?: {
    workflowId?: string | null;
    nodeId?: string | null;
    jobId?: string | null;
  };
}

/**
 * A workflow run's write to a document (PRD R13): replace or append, keep
 * the content before the run's first write as one version, and record the
 * workflow, node and job on the asset (R15).
 */
export async function writeTextDocumentModelInterface(
  args: WriteTextDocumentInterfaceArgs
): Promise<{
  id: string;
  content_type: string;
  name: string;
  metadata: Record<string, unknown> | null;
  workspace_path: string | null;
} | null> {
  const found = await Asset.find(args.userId, args.assetId);
  if (!found) return null;
  const asset = await requireTextDocument(args.userId, found.id);
  const previous = await readTextDocument(asset);
  const next =
    args.mode === "append"
      ? previous + appendSeparator(previous) + args.content
      : args.content;
  if (args.provenance) {
    asset.metadata = {
      ...(asset.metadata ?? {}),
      written_by: {
        workflow_id: args.provenance.workflowId ?? null,
        node_id: args.provenance.nodeId ?? null,
        job_id: args.provenance.jobId ?? null,
        written_at: new Date().toISOString()
      }
    };
  }
  const saved = await writeTextDocument(asset, next, {
    cause: { saveType: "workflow_run", causeId: args.causeId }
  });
  return {
    id: saved.id,
    content_type: saved.content_type,
    name: saved.name,
    metadata: saved.metadata ?? null,
    workspace_path: saved.workspace_path ?? null
  };
}

/** The `findProjectAsset` model interface: the asset of a project file. */
export async function findProjectAssetModelInterface(args: {
  userId: string;
  projectId: string;
  path: string;
}): Promise<{
  id: string;
  content_type: string;
  name: string;
  metadata: Record<string, unknown> | null;
} | null> {
  const path = args.path.replaceAll("\\", "/").replace(/^(\.\/)+/, "").replace(/^\/+/, "");
  if (!path || path.split("/").includes("..")) return null;
  const [asset] = await Asset.findByWorkspacePath(args.userId, args.projectId, path);
  if (!asset) return null;
  return {
    id: asset.id,
    content_type: asset.content_type,
    name: asset.name,
    metadata: asset.metadata ?? null
  };
}

/** The document model interfaces a workflow run host installs. */
export function textDocumentModelInterfaces(): {
  writeTextDocument: typeof writeTextDocumentModelInterface;
  findProjectAsset: typeof findProjectAssetModelInterface;
} {
  return {
    writeTextDocument: writeTextDocumentModelInterface,
    findProjectAsset: findProjectAssetModelInterface
  };
}
