import { describe, it, expect } from "@jest/globals";

import { createNodeStore } from "../../stores/NodeStore";
import type { StoredDraft } from "../../lib/cloud/CloudDocumentSaver";
import type { Workflow } from "../../stores/ApiTypes";
import { resumeWorkflowDraft, workflowSnapshot } from "../useCloudWindowWorkflowDrafts";

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
