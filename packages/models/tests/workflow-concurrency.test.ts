import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ModelObserver } from "../src/base-model.js";
import { initTestDb } from "../src/db.js";
import { Workflow } from "../src/workflow.js";

describe("Workflow optimistic concurrency", () => {
  beforeEach(() => initTestDb());
  afterEach(() => ModelObserver.clear());

  it("preserves the first update when a stale writer follows", async () => {
    const workflow = await Workflow.create<Workflow>({
      id: "workflow-1",
      user_id: "user-1",
      name: "Original",
      access: "private",
      graph: { nodes: [], edges: [] }
    });
    const revision = workflow.updated_at;

    const first = await Workflow.updateFieldsIfUnchanged(
      workflow.id,
      revision,
      { name: "First writer" }
    );
    const stale = await Workflow.updateFieldsIfUnchanged(
      workflow.id,
      revision,
      { name: "Stale writer" }
    );

    expect(first?.name).toBe("First writer");
    expect(first?.updated_at).not.toBe(revision);
    expect(stale).toBeNull();
    expect((await Workflow.get<Workflow>(workflow.id))?.name).toBe(
      "First writer"
    );
  });
});
