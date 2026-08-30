import {
  Asset,
  getSecret,
  ImageDocument,
  Message,
  Script,
  TimelineSequence
} from "@nodetool-ai/models";
import {
  ProcessingContext as RuntimeProcessingContext,
  type ProcessingContextModelInterfaces,
  type Workspace
} from "@nodetool-ai/runtime";
import {
  createAssetModelInterface,
  updateAssetBytesModelInterface
} from "../lib/asset-model-interface.js";
import { getAssetAdapter, getTempAdapter } from "../lib/storage.js";
import { createTempUrlResolver } from "../lib/temp-url-resolver.js";
import { getAssetStoragePath } from "./asset-autosave.js";

/**
 * The server's persistence, as one object.
 *
 * Installed process-wide at startup (`setDefaultModelInterfaces`) so every
 * context built anywhere in the server — a chat turn, an MCP session, a
 * workflow run, an app build — persists through the same code, and a new
 * entrance cannot forget to wire it.
 */
export function serverModelInterfaces(): ProcessingContextModelInterfaces {
  return {
    // Shared with MCP sessions and workflow runs (lib/asset-model-interface):
    // one persistence path, one home-folder default.
    createAsset: createAssetModelInterface,
    updateAssetBytes: updateAssetBytesModelInterface,
    createMessage: async ({ userId, req }) => {
      // Persist an AgentNode thread message. `content` / `tool_calls` are stored
      // raw — the `content` column is a jsonText type that serializes them, so
      // stringifying here would double-encode and break the getMessages read
      // path (which feeds normalizeMessage, not a JSON-parsing response mapper).
      return Message.create<Message>({
        user_id: userId,
        thread_id: req.thread_id,
        role: req.role,
        name: req.name ?? null,
        content: req.content ?? null,
        tool_calls: req.tool_calls ?? null,
        tool_call_id: req.tool_call_id ?? null,
        workflow_id: req.workflow_id ?? null
      });
    },
    getMessages: async ({ userId, threadId, limit, startKey, reverse }) => {
      const [msgs, cursor] = await Message.paginate(threadId, {
        limit: limit ?? 1000,
        startKey: startKey ?? undefined,
        reverse: reverse ?? false
      });
      // Scope to the requesting user — thread_id has no ownership column of its
      // own, so filter the rows the same way the tRPC messages router does.
      const owned = msgs.filter((m) => m.user_id === userId);
      return {
        messages: owned.map((m) => ({ ...m })),
        next: cursor || null
      };
    },
    listFolderAssets: async ({ userId, folderId }) => {
      const folder = await Asset.find(userId, folderId);
      if (!folder || folder.content_type !== "folder") return null;
      const out: Array<{ id: string; content_type: string; name: string }> = [];
      const seen = new Set<string>();
      const visit = async (parentId: string): Promise<void> => {
        if (seen.has(parentId)) return; // guard against cyclic parent links
        seen.add(parentId);
        const children = await Asset.getChildren(userId, parentId, 1000);
        for (const child of children) {
          if (child.content_type === "folder") {
            await visit(child.id);
          } else {
            out.push({
              id: child.id,
              content_type: child.content_type,
              name: child.name
            });
          }
        }
      };
      await visit(folderId);
      out.sort((a, b) => a.name.localeCompare(b.name));
      return out;
    },
    getAssetInfo: async ({ userId, assetId }) => {
      const asset = await Asset.find(userId, assetId);
      if (!asset) return null;
      return {
        id: asset.id,
        content_type: asset.content_type,
        name: asset.name,
        metadata: asset.metadata ?? null
      };
    },
    getImageDocument: async ({ userId, id }) => {
      const doc = await ImageDocument.findById(id);
      if (!doc || doc.user_id !== userId) return null;
      return doc.toResponse();
    },
    createImageDocument: async ({
      userId,
      name,
      projectId,
      width,
      height,
      document
    }) => {
      const doc = new ImageDocument({
        user_id: userId,
        project_id: projectId ?? "default",
        name,
        width,
        height,
        document: JSON.stringify(document)
      });
      await doc.save();
      return doc.toResponse();
    },
    getTimelineSequence: async ({ userId, id }) => {
      const seq = await TimelineSequence.findById(id);
      if (!seq || seq.user_id !== userId) return null;
      return seq.toTimelineSequence();
    },
    createTimelineSequence: async ({ userId, sequence }) => {
      const seq = TimelineSequence.fromTimelineSequence(
        userId,
        sequence as Parameters<typeof TimelineSequence.fromTimelineSequence>[1]
      );
      await seq.save();
      return seq.toTimelineSequence();
    },
    updateTimelineSequence: async ({ userId, id, sequence }) => {
      const existing = await TimelineSequence.findById(id);
      if (!existing || existing.user_id !== userId) return null;
      const next = TimelineSequence.fromTimelineSequence(
        userId,
        sequence as Parameters<typeof TimelineSequence.fromTimelineSequence>[1]
      );
      const updated = await TimelineSequence.updateFieldsIfUnchanged(
        id,
        next.updated_at,
        {
          name: next.name,
          fps: next.fps,
          width: next.width,
          height: next.height,
          duration_ms: next.duration_ms,
          document: next.document
        }
      );
      return updated ? updated.toTimelineSequence() : null;
    },
    getScript: async ({ userId, id }) => {
      const script = await Script.findById(id);
      if (!script || script.user_id !== userId) return null;
      return script.toResponse();
    },
    createScript: async ({ userId, name, projectId, document }) => {
      const script = new Script({
        user_id: userId,
        name: name ?? "Untitled script",
        project_id: projectId ?? "default",
        document: JSON.stringify(document)
      });
      await script.save();
      return script.toResponse();
    },
    updateScript: async ({
      userId,
      id,
      document,
      timelineId,
      baseUpdatedAt
    }) => {
      const existing = await Script.findById(id);
      if (!existing || existing.user_id !== userId) return null;
      const fields: Partial<{
        document: string;
        timeline_id: string | null;
      }> = {};
      if (document !== undefined) fields.document = JSON.stringify(document);
      if (timelineId !== undefined) fields.timeline_id = timelineId;
      const updated = await Script.updateFieldsIfUnchanged(
        id,
        baseUpdatedAt ?? existing.updated_at,
        fields
      );
      return updated ? updated.toResponse() : null;
    }
  };
}

export function createRuntimeContext(opts: {
  jobId: string;
  workflowId?: string | null;
  threadId?: string | null;
  userId: string;
  /**
   * The run's workspace — a local folder or a prefix in the deployment's
   * object storage, resolved by `workspaceResolver`. Null when the host wired
   * none, and file operations then say so instead of writing elsewhere.
   */
  workspace: Workspace | null;
  authToken?: string | null;
  assetOutputMode?:
    | "native"
    | "data_uri"
    | "temp_url"
    | "storage_url"
    | "workspace"
    | "raw";
  persistOutputAssets?: boolean;
}): RuntimeProcessingContext {
  const storagePath = getAssetStoragePath();
  const tempAdapter = getTempAdapter();
  const ctx = new RuntimeProcessingContext({
    ...opts,
    secretResolver: getSecret,
    storage: tempAdapter,
    // `asset://<id>.<ext>` references (chat attachments, @-mentions, prior
    // turns) resolve through the asset store, not the temp store. Without it
    // the only path left is an HTTP hop to `/api/storage`, which authorizes by
    // `x-user-id` and 404s for every user but `1` — the reference then reached
    // the provider verbatim and died in the SSRF guard.
    assetStorage: getAssetAdapter(),
    // Where file_read / file_write / file_list land. A folder on a local
    // install, a key prefix in the asset bucket on a cloud one — the tools
    // cannot tell which and do not branch on it.
    workspace: opts.workspace,
    authToken: opts.authToken,
    tempUrlResolver: createTempUrlResolver(tempAdapter, storagePath)
  });

  ctx.setModelInterfaces(serverModelInterfaces());

  return ctx;
}
