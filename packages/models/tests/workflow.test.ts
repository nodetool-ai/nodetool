import { beforeEach, describe, expect, it } from "vitest";
import { initTestDb } from "../src/db.js";
import { Workflow } from "../src/workflow.js";
import { TimelineSequence } from "../src/timeline-sequence.js";

async function createWorkflow(
  overrides: Partial<{
    id: string;
    user_id: string;
    run_mode: string | null;
    tags: string[];
    graph: { nodes: Array<Record<string, unknown>>; edges: Array<Record<string, unknown>> };
  }> = {}
): Promise<Workflow> {
  return Workflow.create<Workflow>({
    id: overrides.id,
    user_id: overrides.user_id ?? "user-1",
    name: "Workflow",
    access: "private",
    graph: overrides.graph ?? { nodes: [], edges: [] },
    run_mode: overrides.run_mode ?? "workflow",
    tags: overrides.tags ?? []
  });
}

async function createSequenceWithWorkflowRefs(
  refs: string[],
  userId = "user-1"
): Promise<TimelineSequence> {
  return TimelineSequence.create<TimelineSequence>({
    user_id: userId,
    project_id: "project-1",
    name: "Timeline",
    document: JSON.stringify({
      tracks: [],
      clips: refs.map((workflowId, index) => ({
        id: `clip-${index}`,
        trackId: "track-1",
        name: `Clip ${index}`,
        startMs: index * 1000,
        durationMs: 1000,
        mediaType: "video",
        sourceType: "generated",
        workflowId,
        status: "draft",
        locked: false,
        versions: []
      })),
      markers: []
    })
  });
}

describe("Workflow model clip lifecycle helpers", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("cloneAsClipPrivate creates a clip workflow clone", async () => {
    const source = await createWorkflow({
      id: "wf-source",
      run_mode: "workflow",
      tags: ["template"],
      graph: {
        nodes: [{ id: "n1", type: "nodetool.output.ImageOutput" }],
        edges: []
      }
    });

    const clone = await Workflow.cloneAsClipPrivate(source.id, "user-2");
    expect(clone.id).not.toBe(source.id);
    expect(clone.user_id).toBe("user-2");
    expect(clone.run_mode).toBe("clip");
    expect(clone.tags).toEqual([]);
    expect(clone.tool_name).toBeNull();
    expect(clone.graph).toEqual(source.graph);
  });

  it("countClipReferences counts references across multiple sequences", async () => {
    await createSequenceWithWorkflowRefs(["wf-a", "wf-b"]);
    await createSequenceWithWorkflowRefs(["wf-a"], "user-2");
    await createSequenceWithWorkflowRefs(["wf-c"]);

    expect(await Workflow.countClipReferences("wf-a")).toBe(2);
    expect(await Workflow.countClipReferences("wf-b")).toBe(1);
    expect(await Workflow.countClipReferences("wf-missing")).toBe(0);
  });

  it("paginate defaults to standalone workflows and legacy null run_mode", async () => {
    await createWorkflow({ id: "wf-workflow", run_mode: "workflow" });
    await createWorkflow({ id: "wf-legacy", run_mode: null });
    await createWorkflow({ id: "wf-clip-only", run_mode: "clip" });

    const [items] = await Workflow.paginate("user-1", { limit: 10 });
    expect(items.map((workflow) => workflow.id).sort()).toEqual(
      ["wf-legacy", "wf-workflow"].sort()
    );
  });

  it("deleteIfOrphaned refuses standalone workflows", async () => {
    const standalone = await createWorkflow({
      id: "wf-standalone",
      run_mode: "workflow"
    });

    const deleted = await Workflow.deleteIfOrphaned(standalone.id);
    expect(deleted).toBe(false);
    expect(await Workflow.get<Workflow>(standalone.id)).not.toBeNull();
  });

  it("deleteIfOrphaned deletes clip workflow only when no clips reference it", async () => {
    const clipWf = await createWorkflow({ id: "wf-clip", run_mode: "clip" });
    await createSequenceWithWorkflowRefs([clipWf.id]);

    expect(await Workflow.deleteIfOrphaned(clipWf.id)).toBe(false);
    expect(await Workflow.get<Workflow>(clipWf.id)).not.toBeNull();

    const seq = await TimelineSequence.listByUser("user-1", 1);
    const current = seq[0];
    if (!current) {
      throw new Error("expected sequence");
    }
    await TimelineSequence.update(current.id, {
      document: JSON.stringify({ tracks: [], clips: [], markers: [] })
    });

    expect(await Workflow.deleteIfOrphaned(clipWf.id)).toBe(true);
    expect(await Workflow.get<Workflow>(clipWf.id)).toBeNull();
  });

  it("promoteToTemplate updates run_mode and timeline-template tag", async () => {
    const clipWf = await createWorkflow({
      id: "wf-promote",
      run_mode: "clip",
      tags: ["foo"]
    });

    await Workflow.promoteToTemplate(clipWf.id);
    const updated = await Workflow.get<Workflow>(clipWf.id);
    expect(updated).not.toBeNull();
    expect(updated!.run_mode).toBe("workflow");
    expect(updated!.tags).toContain("foo");
    expect(updated!.tags).toContain("timeline-template");

    await Workflow.promoteToTemplate(clipWf.id);
    const updatedAgain = await Workflow.get<Workflow>(clipWf.id);
    const templateTagCount = updatedAgain!.tags.filter(
      (tag) => tag === "timeline-template"
    ).length;
    expect(templateTagCount).toBe(1);
  });
});
