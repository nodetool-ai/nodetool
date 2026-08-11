import { describe, it, expect } from "vitest";
import { CreateTaskPlanTool } from "../src/tools/create-task-tool.js";
import type { Step, Task, TaskPlan } from "../src/types.js";
import { createMockContext } from "./_helpers/mock-context.js";

// ---------------------------------------------------------------------------
// CreateTaskPlanTool (single-task planning)
// ---------------------------------------------------------------------------

describe("CreateTaskPlanTool", () => {
  it("creates a valid task from raw data", async () => {
    const tool = new CreateTaskPlanTool();
    const result = (await tool.process(createMockContext(), {
      title: "Test Task",
      steps: [
        { id: "s1", instructions: "Do first thing", depends_on: [] },
        { id: "s2", instructions: "Do second thing", depends_on: ["s1"] }
      ]
    })) as Record<string, unknown>;

    expect(result.status).toBe("task_created");
    expect(result.steps).toBe(2);

    const task = tool.task;
    expect(task).not.toBeNull();
    expect(task!.title).toBe("Test Task");
    expect(task!.steps).toHaveLength(2);
    expect(task!.steps[0].id).toBe("s1");
    expect(task!.steps[1].dependsOn).toEqual(["s1"]);
  });

  it("rejects steps with missing dependency IDs", async () => {
    const tool = new CreateTaskPlanTool();
    const result = (await tool.process(createMockContext(), {
      title: "Bad Task",
      steps: [
        { id: "s1", instructions: "Do A", depends_on: ["nonexistent"] }
      ]
    })) as Record<string, unknown>;

    expect(result.status).toBe("validation_failed");
    const errors = result.errors as string[];
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("nonexistent");
    expect(tool.task).toBeNull();
  });

  it("accepts input keys as valid dependencies", async () => {
    const tool = new CreateTaskPlanTool({ myInput: "value" });
    const result = (await tool.process(createMockContext(), {
      title: "Task with inputs",
      steps: [
        { id: "s1", instructions: "Do A", depends_on: ["myInput"] }
      ]
    })) as Record<string, unknown>;

    expect(result.status).toBe("task_created");
    expect(tool.task).not.toBeNull();
  });

  it("rejects duplicate step IDs", async () => {
    const tool = new CreateTaskPlanTool();
    const result = (await tool.process(createMockContext(), {
      title: "Dupe Task",
      steps: [
        { id: "s1", instructions: "Do A", depends_on: [] },
        { id: "s1", instructions: "Do B", depends_on: [] }
      ]
    })) as Record<string, unknown>;

    expect(result.status).toBe("validation_failed");
    const errors = result.errors as string[];
    expect(errors.some((e) => e.includes("Duplicate"))).toBe(true);
  });

  it("detects circular dependencies", async () => {
    const tool = new CreateTaskPlanTool();
    const result = (await tool.process(createMockContext(), {
      title: "Cyclic Task",
      steps: [
        { id: "s1", instructions: "A", depends_on: ["s2"] },
        { id: "s2", instructions: "B", depends_on: ["s1"] }
      ]
    })) as Record<string, unknown>;

    expect(result.status).toBe("validation_failed");
    const errors = result.errors as string[];
    expect(errors.some((e) => e.includes("Circular"))).toBe(true);
  });

  it("accepts valid DAGs", async () => {
    const tool = new CreateTaskPlanTool();
    const result = (await tool.process(createMockContext(), {
      title: "Valid DAG",
      steps: [
        { id: "s1", instructions: "A", depends_on: [] },
        { id: "s2", instructions: "B", depends_on: ["s1"] },
        { id: "s3", instructions: "C", depends_on: ["s1", "s2"] }
      ]
    })) as Record<string, unknown>;

    expect(result.status).toBe("task_created");
    expect(tool.task).not.toBeNull();
  });

  it("rejects empty task", async () => {
    const tool = new CreateTaskPlanTool();
    const result = (await tool.process(createMockContext(), {
      title: "Empty",
      steps: []
    })) as Record<string, unknown>;

    expect(result.status).toBe("validation_failed");
    const errors = result.errors as string[];
    expect(errors.some((e) => e.includes("at least one step"))).toBe(true);
  });
});
