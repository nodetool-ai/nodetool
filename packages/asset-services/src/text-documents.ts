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

/** The document's Markdown as it is saved now. */
export async function readTextDocument(asset: Asset): Promise<string> {
  if (asset.workspace_path) {
    const file = await projectAssetFile(asset);
    if (!file) {
      throw new TextDocumentError(
        `The file of ${asset.name} cannot be reached in its project folder.`
      );
    }
    const text = await file.workspace.readText(file.path);
    if (text === null) {
      throw new TextDocumentError(`The file of ${asset.name} is missing.`);
    }
    return text;
  }
  const bytes = await retrieveAssetBytes(
    getAssetAdapter(),
    asset.user_id,
    asset.id,
    asset.content_type
  );
  if (!bytes) {
    throw new TextDocumentError(`${asset.name} has no stored content.`);
  }
  return decoder.decode(bytes);
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
  if (
    options.expectedUpdatedAt !== undefined &&
    asset.updated_at !== options.expectedUpdatedAt
  ) {
    throw new TextDocumentError(
      `${asset.name} changed since it was read. Read it again and repeat the edit.`
    );
  }
  if (options.cause) {
    const previous = await readTextDocument(asset).catch(() => null);
    if (previous !== null && previous !== text) {
      await recordTextDocumentVersion(asset, previous, options.cause);
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


/**
 * Restore version `version` of the document. The current content is
 * recorded first as a `restore` version, so the restore can be undone.
 */
export async function restoreTextDocumentVersion(
  asset: Asset,
  version: number
): Promise<{ asset: Asset; restored: TextDocumentVersion }> {
  const restored = await TextDocumentVersion.findByVersion(asset.id, version);
  if (!restored) {
    throw new TextDocumentError(
      `${asset.name} has no version ${version}.`
    );
  }
  const saved = await writeTextDocument(asset, restored.content, {
    cause: { saveType: "restore" }
  });
  return { asset: saved, restored };
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
