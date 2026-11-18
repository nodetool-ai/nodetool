/**
 * The document kinds a transfer carries as whole documents, and what a
 * transfer reads and writes of each (docs/plans/native-cloud-sync/
 * technical-design.md, "Identity" and "Operations of a transfer").
 *
 * A document's payload is the content a transfer sends and compares: what
 * a person edits, without ids, owners, projects, sharing or file state. Its
 * hash is the SHA-256 of the payload's identity encoding, so the client and
 * the server compute the same hash from the same content.
 */
import { createHash } from "node:crypto";
import {
  lockTransferDocumentRow,
  TimelineSequence,
  TimelineSequenceVersion,
  Workflow,
  WorkflowVersion
} from "@nodetool-ai/models";
import { identityEncode, refsOf } from "@nodetool-ai/protocol";
import type { TransferDocumentKind } from "@nodetool-ai/protocol/api-schemas/transfer.js";

export type TransferPayloadContent = Record<string, unknown>;

/** SHA-256 of the identity encoding of `value`. */
export function identityHash(value: unknown): string {
  return createHash("sha256").update(identityEncode(value)).digest("hex");
}

/** A stored document as a transfer sees it. */
export interface TransferDocument {
  id: string;
  userId: string;
  projectId: string;
  name: string;
  payload: TransferPayloadContent;
}

/** What a transfer does with one kind. */
export interface TransferDocumentKindHandler {
  /**
   * Reads the document. On PostgreSQL it locks the row until the surrounding
   * transaction ends, so nothing changes it between the checks and the write.
   */
  lock(id: string): Promise<TransferDocument | null>;
  /** Why the payload cannot be stored as this kind, or null when it can. */
  invalid(payload: TransferPayloadContent): string | null;
  /** The part of the payload that refers to files, as the attach rule reads it. */
  content(payload: TransferPayloadContent): unknown;
  /** The asset ids the payload refers to. */
  files(payload: TransferPayloadContent): string[];
  create(input: { id: string; userId: string; projectId: string; payload: TransferPayloadContent }): Promise<void>;
  /** Keeps the stored revision as a saved version, then writes the payload. */
  replace(document: TransferDocument, payload: TransferPayloadContent): Promise<void>;
  rename(document: TransferDocument, name: string): Promise<void>;
  /** Deletes the document as its owner. It keeps its restore period. */
  remove(document: TransferDocument): Promise<void>;
}

function isFullId(id: string): boolean {
  return /^[0-9a-f]{32}$/.test(id);
}

const REPLACED_VERSION_NAME = "Before a transfer replaced it";

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function finite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function objectOf(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : {};
}

function workflowPayload(workflow: Workflow): TransferPayloadContent {
  return {
    name: workflow.name,
    description: workflow.description ?? "",
    tags: workflow.tags ?? [],
    graph: workflow.graph,
    settings: workflow.settings ?? null,
    run_mode: workflow.run_mode ?? null
  };
}

function workflowFields(payload: TransferPayloadContent) {
  const graph = objectOf(payload.graph);
  return {
    name: text(payload.name, "Workflow"),
    description: text(payload.description),
    tags: Array.isArray(payload.tags) ? payload.tags.filter((tag): tag is string => typeof tag === "string") : [],
    graph: {
      nodes: Array.isArray(graph.nodes) ? graph.nodes : [],
      edges: Array.isArray(graph.edges) ? graph.edges : []
    },
    settings: payload.settings === null ? null : objectOf(payload.settings),
    run_mode: typeof payload.run_mode === "string" ? payload.run_mode : null
  };
}

function toTransferDocument(
  row: { id: string; user_id: string; project_id: string; name: string },
  payload: TransferPayloadContent
): TransferDocument {
  return { id: row.id, userId: row.user_id, projectId: row.project_id, name: row.name, payload };
}

function hasArrays(value: unknown, keys: readonly string[]): boolean {
  const object = objectOf(value);
  return keys.every((key) => Array.isArray(object[key]));
}

const workflowHandler: TransferDocumentKindHandler = {
  invalid(payload) {
    if (typeof payload.name !== "string" || payload.name.length === 0) return "A workflow needs a name";
    if (!hasArrays(payload.graph, ["nodes", "edges"])) return "A workflow graph needs nodes and edges arrays";
    return null;
  },
  async lock(id) {
    await lockTransferDocumentRow("workflow", id);
    const workflow = await Workflow.get<Workflow>(id);
    return workflow ? toTransferDocument(workflow, workflowPayload(workflow)) : null;
  },
  content(payload) {
    return payload.graph ?? null;
  },
  files(payload) {
    return refsOf("workflow", payload.graph ?? null).filter(isFullId);
  },
  async create({ id, userId, projectId, payload }) {
    await Workflow.create<Workflow>({
      id,
      user_id: userId,
      project_id: projectId,
      access: "private",
      ...workflowFields(payload)
    });
  },
  async replace(document, payload) {
    const workflow = await Workflow.get<Workflow>(document.id);
    if (!workflow) throw new Error(`Workflow ${document.id} is gone`);
    await WorkflowVersion.create<WorkflowVersion>({
      workflow_id: workflow.id,
      user_id: workflow.user_id,
      name: REPLACED_VERSION_NAME,
      description: null,
      graph: workflow.graph,
      version: await WorkflowVersion.nextVersion(workflow.id)
    });
    Object.assign(workflow, workflowFields(payload));
    await workflow.save();
  },
  async rename(document, name) {
    const workflow = await Workflow.get<Workflow>(document.id);
    if (!workflow) throw new Error(`Workflow ${document.id} is gone`);
    workflow.name = name;
    await workflow.save();
  },
  async remove(document) {
    await Workflow.deleteOwned(document.userId, document.id);
  }
};

function parsedTimelineDocument(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // A document that does not parse travels as its text.
    return text;
  }
}

function timelinePayload(timeline: TimelineSequence): TransferPayloadContent {
  const document = parsedTimelineDocument(timeline.document);
  return {
    name: timeline.name,
    fps: timeline.fps,
    width: timeline.width,
    height: timeline.height,
    document
  };
}

function timelineFields(payload: TransferPayloadContent) {
  const document =
    typeof payload.document === "string" ? payload.document : JSON.stringify(payload.document ?? {});
  return {
    name: text(payload.name, "Timeline"),
    fps: finite(payload.fps, 30),
    width: finite(payload.width, 1920),
    height: finite(payload.height, 1080),
    document
  };
}

function positive(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

const timelineHandler: TransferDocumentKindHandler = {
  invalid(payload) {
    if (typeof payload.name !== "string" || payload.name.length === 0) return "A timeline needs a name";
    if (!positive(payload.fps) || !positive(payload.width) || !positive(payload.height)) {
      return "A timeline needs a positive frame rate, width and height";
    }
    if (!hasArrays(payload.document, ["tracks", "clips", "markers"])) {
      return "A timeline document needs tracks, clips and markers arrays";
    }
    return null;
  },
  async lock(id) {
    await lockTransferDocumentRow("timeline", id);
    const timeline = await TimelineSequence.findById(id);
    return timeline ? toTransferDocument(timeline, timelinePayload(timeline)) : null;
  },
  content(payload) {
    return payload.document ?? null;
  },
  files(payload) {
    return refsOf("timeline", payload.document ?? null).filter(isFullId);
  },
  async create({ id, userId, projectId, payload }) {
    const created = await TimelineSequence.insertNew({
      id,
      user_id: userId,
      project_id: projectId,
      ...timelineFields(payload)
    });
    if (!created) throw new Error(`Timeline ${id} exists`);
  },
  async replace(document, payload) {
    const timeline = await TimelineSequence.findById(document.id);
    if (!timeline) throw new Error(`Timeline ${document.id} is gone`);
    await TimelineSequenceVersion.snapshot(timeline, { saveType: "manual", name: REPLACED_VERSION_NAME });
    const updated = await TimelineSequence.updateFieldsIfUnchanged(
      timeline.id,
      timeline.updated_at,
      timelineFields(payload)
    );
    if (!updated) throw new Error(`Timeline ${document.id} changed during the transfer`);
  },
  async rename(document, name) {
    const updated = await TimelineSequence.update(document.id, { name });
    if (!updated) throw new Error(`Timeline ${document.id} is gone`);
  },
  async remove(document) {
    await TimelineSequence.deleteOwned(document.userId, document.id);
  }
};

export const TRANSFER_DOCUMENT_KINDS: Record<TransferDocumentKind, TransferDocumentKindHandler> = {
  workflow: workflowHandler,
  timeline: timelineHandler
};

/** The payload of a stored document, for the client's capture and for tests. */
export async function transferPayloadOf(
  kind: TransferDocumentKind,
  id: string
): Promise<TransferPayloadContent | null> {
  if (kind === "workflow") {
    const workflow = await Workflow.get<Workflow>(id);
    return workflow ? workflowPayload(workflow) : null;
  }
  const timeline = await TimelineSequence.findById(id);
  return timeline ? timelinePayload(timeline) : null;
}
