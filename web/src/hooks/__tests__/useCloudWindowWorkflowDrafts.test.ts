import { beforeEach, describe, it, expect, jest } from "@jest/globals";

import type { CloudDraftMirror, MirrorStatus } from "../../lib/cloud/CloudDraftMirror";
import { CloudSendPacer } from "../../lib/cloud/CloudSendPacer";
import { createNodeStore } from "../../stores/NodeStore";
import type { WorkflowManagerStore } from "../../stores/WorkflowManagerStore";
import type { StoredDraft } from "../../lib/cloud/CloudDocumentSaver";
import type { Workflow } from "../../stores/ApiTypes";
import { resumeWorkflowDraft, sendWhenDue, workflowSnapshot } from "../useCloudWindowWorkflowDrafts";

const mockAutosave = jest.fn(async (..._args: unknown[]): Promise<void> => undefined);
jest.mock("../useWorkflowAutosave", () => ({
  autosaveIfDirty: (...args: unknown[]) => mockAutosave(...args)
}));

const workflow = {
  id: "w1",
  name: "Flow",
  access: "private",
  description: "",
  thumbnail: "",
  tags: [],
  created_at: "2026-11-19T09:00:00Z",
  updated_at: "2026-11-19T10:00:00Z",
  graph: { nodes: [], edges: [] }
} as unknown as Workflow;

const stored = (draft: string): StoredDraft => ({
  key: { serverKey: "k", accountId: "a", kind: "workflow", documentId: "w1" },
  draftId: "d1",
  base: { updatedAt: "2026-11-19T10:00:00Z", contentHash: "" },
  draft,
  state: "waiting",
  refusal: ""
});

describe("cloud window workflow drafts", () => {
  it("takes a stored draft up again as unsaved edits", () => {
    const store = createNodeStore(workflow);
    const graph = {
      nodes: [{ id: "n1", type: "nodetool.constant.String", data: { value: "hi" }, ui_properties: { position: { x: 0, y: 0 } } }],
      edges: []
    };
    expect(resumeWorkflowDraft(store, stored(JSON.stringify({ graph, name: "Flow" })))).toBe(true);

    expect(store.getState().nodes.map((node) => node.id)).toEqual(["n1"]);
    const snapshot = workflowSnapshot(store);
    expect(snapshot.dirty).toBe(true);
    expect(snapshot.revision).toBe("2026-11-19T10:00:00Z");
    expect(JSON.parse(snapshot.document()).graph.nodes.map((node: { id: string }) => node.id)).toEqual(["n1"]);
  });

  it("refuses a draft that is not a workflow graph", () => {
    const store = createNodeStore(workflow);
    expect(resumeWorkflowDraft(store, stored("{"))).toBe(false);
    expect(resumeWorkflowDraft(store, stored(JSON.stringify({ tracks: [] })))).toBe(false);
    expect(store.getState().workflowIsDirty).toBe(false);
  });
});

describe("sending a cloud workflow's waiting changes", () => {
  const mirrorWith = (status: MirrorStatus): CloudDraftMirror =>
    ({ status: () => status }) as unknown as CloudDraftMirror;
  const manager = {} as WorkflowManagerStore;

  beforeEach(() => {
    mockAutosave.mockClear();
  });

  it("saves through the editor's autosave once the edits are stored and the computer is online", async () => {
    const store = createNodeStore(workflow);
    const pacer = new CloudSendPacer();
    expect(sendWhenDue(store, manager, mirrorWith("storing"), pacer, 0, true)).toBeNull();
    expect(sendWhenDue(store, manager, mirrorWith("stored"), pacer, 0, false)).toBeNull();
    expect(mockAutosave).not.toHaveBeenCalled();

    await sendWhenDue(store, manager, mirrorWith("stored"), pacer, 0, true);
    expect(mockAutosave).toHaveBeenCalledTimes(1);
    expect(mockAutosave.mock.calls[0][0]).toBe(store);
  });

  it("does not start a second save while one runs", () => {
    const store = createNodeStore(workflow);
    const pacer = new CloudSendPacer();
    mockAutosave.mockImplementationOnce(() => new Promise(() => undefined));
    expect(sendWhenDue(store, manager, mirrorWith("stored"), pacer, 0, true)).not.toBeNull();
    expect(sendWhenDue(store, manager, mirrorWith("stored"), pacer, 10_000, true)).toBeNull();
    expect(mockAutosave).toHaveBeenCalledTimes(1);
  });
});
