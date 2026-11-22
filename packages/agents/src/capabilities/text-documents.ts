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

import type { Asset } from "@nodetool-ai/models";
import type { CapabilityExport, CapabilityModule, CapabilityRun } from "./types.js";
import { userIdOf } from "../tools/mcp-tool-support.js";
import { isNonBlankString } from "../utils/type-guards.js";
import { resolveReadProjectId, resolveProjectId } from "./project-scope.js";
import {
  createDocumentSpec,
  createDocumentVersionSpec,
  editDocumentSpec,
  listDocumentVersionsSpec,
  readDocumentSpec,
  restoreDocumentVersionSpec
} from "./text-documents.specs.js";

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

function normalizePath(path: string): string {
  return path.trim().replace(/\\/g, "/").replace(/^(\.\/)+/, "").replace(/^\/+/, "");
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
    if (typeof content !== "string") return { error: "content is required." };
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
    return answering(async () => ({
      ...describe(asset),
      content: await readTextDocument(asset)
    }));
  }
};

const editDocument: CapabilityExport = {
  spec: editDocumentSpec,
  impl: async (run, params) => {
    const asset = await findDocument(run, params);
    if ("error" in asset) return asset;
    const edits = params["edits"];
    const content = params["content"];
    const append = params["append"];
    const given = [Array.isArray(edits), typeof content === "string", typeof append === "string"]
      .filter(Boolean).length;
    if (given !== 1) {
      return { error: "Pass exactly one of edits, content or append." };
    }
    const { applyTextDocumentEdits, readTextDocument, writeTextDocument } =
      await service();
    return answering(async () => {
      const current = await readTextDocument(asset);
      let next: string;
      let replacements = 0;
      if (Array.isArray(edits)) {
        const applied = applyTextDocumentEdits(current, edits);
        next = applied.text;
        replacements = applied.replacements;
      } else if (typeof content === "string") {
        next = content;
      } else {
        const body = String(append).replace(/^\n+/, "");
        const base = current.replace(/\n*$/, "");
        next = base === "" ? `${body.replace(/\n*$/, "")}\n` : `${base}\n\n${body.replace(/\n*$/, "")}\n`;
      }
      if (next === current) {
        return { ...describe(asset), changed: false };
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

const restoreDocumentVersion: CapabilityExport = {
  spec: restoreDocumentVersionSpec,
  impl: async (run, params) => {
    const asset = await findDocument(run, params);
    if ("error" in asset) return asset;
    const version = Number(params["version"]);
    if (!Number.isInteger(version)) return { error: "version must be an integer." };
    const { restoreTextDocumentVersion } = await service();
    return answering(async () => {
      const { asset: saved, restored } = await restoreTextDocumentVersion(asset, version);
      return { ...describe(saved), restored_version: restored.version };
    });
  }
};

export const TEXT_DOCUMENT_CAPABILITIES: readonly CapabilityExport[] = [
  createDocument,
  readDocument,
  editDocument,
  listDocumentVersions,
  createDocumentVersion,
  restoreDocumentVersion
];

export const module: CapabilityModule = {
  module: "text-documents",
  exports: TEXT_DOCUMENT_CAPABILITIES
};

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
