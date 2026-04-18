import { describe, it, expect, vi } from "vitest";
import {
  PlanBuilder,
  AddTaskTool,
  RemoveTaskTool,
  FinishPlanTool
} from "../src/tools/plan-builder-tools.js";

function createMockContext() {
  return {
    set: vi.fn(),
    get: vi.fn(),
    storeStepResult: vi.fn()
  } as any;
}

describe("PlanBuilder.addTask", () => {
  it("accepts a valid first task", () => {
    const builder = new PlanBuilder();
    const result = builder.addTask({
      id: "task_a",
      title: "A",
      depends_on: [],
      steps: [{ id: "task_a_s1", instructions: "Do A", depends_on: [] }]
    });
    expect(result.ok).toBe(true);
    expect(builder.taskCount).toBe(1);
  });

  it("rejects duplicate task IDs", () => {
    const builder = new PlanBuilder();
    builder.addTask({
      id: "task_a",
      title: "A",
      depends_on: [],
      steps: [{ id: "task_a_s1", instructions: "Do A", depends_on: [] }]
    });
    const result = builder.addTask({
      id: "task_a",
      title: "dup",
      depends_on: [],
      steps: [{ id: "task_a_s2", instructions: "Do A", depends_on: [] }]
    });
    expect(result.ok).toBe(false);
    expect(builder.taskCount).toBe(1);
  });

  it("rejects step IDs colliding across tasks", () => {
    const builder = new PlanBuilder();
    builder.addTask({
      id: "task_a",
      title: "A",
      depends_on: [],
      steps: [{ id: "shared", instructions: "Do A", depends_on: [] }]
    });
    const result = builder.addTask({
      id: "task_b",
      title: "B",
      depends_on: [],
      steps: [{ id: "shared", instructions: "Do B", depends_on: [] }]
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some((e) => e.toLowerCase().includes("collides"))
      ).toBe(true);
    }
  });

  it("rejects task-level forward references", () => {
    const builder = new PlanBuilder();
    const result = builder.addTask({
      id: "task_a",
      title: "A",
      depends_on: ["task_b"],
      steps: [{ id: "task_a_s1", instructions: "Do A", depends_on: [] }]
    });
    expect(result.ok).toBe(false);
  });

  it("accepts task deps on previously added tasks", () => {
    const builder = new PlanBuilder();
    builder.addTask({
      id: "task_a",
      title: "A",
      depends_on: [],
      steps: [{ id: "task_a_s1", instructions: "Do A", depends_on: [] }]
    });
    const result = builder.addTask({
      id: "task_b",
      title: "B",
      depends_on: ["task_a"],
      steps: [{ id: "task_b_s1", instructions: "Do B", depends_on: [] }]
    });
    expect(result.ok).toBe(true);
  });

  it("accepts input keys as step dependencies", () => {
    const builder = new PlanBuilder({ in1: "x" });
    const result = builder.addTask({
      id: "task_a",
      title: "A",
      depends_on: [],
      steps: [{ id: "task_a_s1", instructions: "Use input", depends_on: ["in1"] }]
    });
    expect(result.ok).toBe(true);
  });

  it("rejects empty tasks", () => {
    const builder = new PlanBuilder();
    const result = builder.addTask({
      id: "task_a",
      title: "A",
      depends_on: [],
      steps: []
    });
    expect(result.ok).toBe(false);
  });
});

describe("PlanBuilder.removeTask + finish", () => {
  it("removes and re-adds tasks", () => {
    const builder = new PlanBuilder();
    builder.addTask({
      id: "task_a",
      title: "A",
      depends_on: [],
      steps: [{ id: "task_a_s1", instructions: "Do A", depends_on: [] }]
    });
    expect(builder.taskCount).toBe(1);
    const removed = builder.removeTask("task_a");
    expect(removed.ok).toBe(true);
    expect(builder.taskCount).toBe(0);
  });

  it("commits a valid plan", () => {
    const builder = new PlanBuilder();
    builder.addTask({
      id: "task_a",
      title: "A",
      depends_on: [],
      steps: [{ id: "task_a_s1", instructions: "Do A", depends_on: [] }]
    });
    const result = builder.finish("My Plan");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.plan.tasks).toHaveLength(1);
  });

  it("rejects empty plan at finish", () => {
    const builder = new PlanBuilder();
    const result = builder.finish("Empty");
    expect(result.ok).toBe(false);
  });
});

describe("Tool wrappers", () => {
  it("AddTaskTool returns structured success/failure", async () => {
    const builder = new PlanBuilder();
    const tool = new AddTaskTool(builder);
    const ok = (await tool.process(createMockContext(), {
      id: "t1",
      title: "T1",
      depends_on: [],
      steps: [{ id: "t1_s1", instructions: "do", depends_on: [] }]
    })) as Record<string, unknown>;
    expect(ok.status).toBe("task_added");
    expect(ok.tasksSoFar).toBe(1);

    const fail = (await tool.process(createMockContext(), {
      id: "t2",
      title: "T2",
      depends_on: [],
      steps: [{ id: "t2_s1", instructions: "do", depends_on: ["missing"] }]
    })) as Record<string, unknown>;
    expect(fail.status).toBe("validation_failed");
    expect(Array.isArray(fail.errors)).toBe(true);
  });

  it("RemoveTaskTool removes the task", async () => {
    const builder = new PlanBuilder();
    const add = new AddTaskTool(builder);
    const remove = new RemoveTaskTool(builder);
    await add.process(createMockContext(), {
      id: "t1",
      title: "T1",
      depends_on: [],
      steps: [{ id: "t1_s1", instructions: "do", depends_on: [] }]
    });
    const result = (await remove.process(createMockContext(), {
      id: "t1"
    })) as Record<string, unknown>;
    expect(result.status).toBe("task_removed");
    expect(builder.taskCount).toBe(0);
  });

  it("FinishPlanTool commits and exposes the plan", async () => {
    const builder = new PlanBuilder();
    const add = new AddTaskTool(builder);
    const finish = new FinishPlanTool(builder);
    await add.process(createMockContext(), {
      id: "t1",
      title: "T1",
      depends_on: [],
      steps: [{ id: "t1_s1", instructions: "do", depends_on: [] }]
    });
    const result = (await finish.process(createMockContext(), {
      title: "P"
    })) as Record<string, unknown>;
    expect(result.status).toBe("plan_finished");
    expect(builder.plan).not.toBeNull();
  });
});
