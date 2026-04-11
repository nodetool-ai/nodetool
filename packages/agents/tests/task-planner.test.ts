import { describe, it, expect, vi } from "vitest";
import { CreatePlanTool } from "../src/tools/create-plan-tool.js";
import { CreateTaskPlanTool } from "../src/tools/create-task-tool.js";
import type { Step, Task, TaskPlan } from "../src/types.js";

function createMockContext() {
  return {
    set: vi.fn(),
    get: vi.fn(),
    storeStepResult: vi.fn()
  } as any;
}

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

  it("rejects steps with looping phrases", async () => {
    const tool = new CreateTaskPlanTool();
    const result = (await tool.process(createMockContext(), {
      title: "Loop Task",
      steps: [
        {
          id: "process_items",
          instructions: "For each URL, fetch the content",
          depends_on: []
        }
      ]
    })) as Record<string, unknown>;

    expect(result.status).toBe("validation_failed");
    const errors = result.errors as string[];
    expect(errors.some((e) => e.includes("looping phrase"))).toBe(true);
  });

  it("allows aggregator steps to have looping language", async () => {
    const tool = new CreateTaskPlanTool();
    const result = (await tool.process(createMockContext(), {
      title: "Agg Task",
      steps: [
        {
          id: "aggregate_results",
          instructions: "For each result, combine into final report",
          depends_on: []
        }
      ]
    })) as Record<string, unknown>;

    expect(result.status).toBe("task_created");
  });

  it("detects missing aggregator dependencies on extractor steps", async () => {
    const tool = new CreateTaskPlanTool();
    const result = (await tool.process(createMockContext(), {
      title: "Missing Agg Deps",
      steps: [
        {
          id: "extract_data_1",
          instructions: "Get data from source 1",
          depends_on: []
        },
        {
          id: "extract_data_2",
          instructions: "Get data from source 2",
          depends_on: []
        },
        {
          id: "aggregate_results",
          instructions: "Combine all data",
          depends_on: ["extract_data_1"]
        }
      ]
    })) as Record<string, unknown>;

    expect(result.status).toBe("validation_failed");
    const errors = result.errors as string[];
    expect(errors.some((e) => e.includes("extract_data_2"))).toBe(true);
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

// ---------------------------------------------------------------------------
// CreatePlanTool (multi-task planning)
// ---------------------------------------------------------------------------

describe("CreatePlanTool", () => {
  it("creates a valid multi-task plan", async () => {
    const tool = new CreatePlanTool();
    const result = (await tool.process(createMockContext(), {
      title: "Multi-Task Plan",
      tasks: [
        {
          id: "task_a",
          title: "Task A",
          depends_on: [],
          steps: [
            { id: "s1", instructions: "Do A step 1", depends_on: [] }
          ]
        },
        {
          id: "task_b",
          title: "Task B",
          depends_on: [],
          steps: [
            { id: "s2", instructions: "Do B step 1", depends_on: [] }
          ]
        },
        {
          id: "task_merge",
          title: "Merge",
          depends_on: ["task_a", "task_b"],
          steps: [
            { id: "s3", instructions: "Merge results", depends_on: [] }
          ]
        }
      ]
    })) as Record<string, unknown>;

    expect(result.status).toBe("plan_created");
    expect(result.tasks).toBe(3);

    const plan = tool.plan;
    expect(plan).not.toBeNull();
    expect(plan!.title).toBe("Multi-Task Plan");
    expect(plan!.tasks).toHaveLength(3);
    expect(plan!.tasks[0].id).toBe("task_a");
    expect(plan!.tasks[2].dependsOn).toEqual(["task_a", "task_b"]);
  });

  it("rejects duplicate task IDs", async () => {
    const tool = new CreatePlanTool();
    const result = (await tool.process(createMockContext(), {
      title: "Duplicate Plan",
      tasks: [
        {
          id: "task_a",
          title: "A",
          depends_on: [],
          steps: [
            { id: "s1", instructions: "Do A", depends_on: [] }
          ]
        },
        {
          id: "task_a",
          title: "A duplicate",
          depends_on: [],
          steps: [
            { id: "s2", instructions: "Do A again", depends_on: [] }
          ]
        }
      ]
    })) as Record<string, unknown>;

    expect(result.status).toBe("validation_failed");
    const errors = result.errors as string[];
    expect(errors.some((e) => e.includes("Duplicate task ID"))).toBe(true);
  });

  it("rejects missing task dependencies", async () => {
    const tool = new CreatePlanTool();
    const result = (await tool.process(createMockContext(), {
      title: "Missing Dep",
      tasks: [
        {
          id: "task_a",
          title: "A",
          depends_on: ["nonexistent"],
          steps: [
            { id: "s1", instructions: "Do A", depends_on: [] }
          ]
        }
      ]
    })) as Record<string, unknown>;

    expect(result.status).toBe("validation_failed");
    const errors = result.errors as string[];
    expect(errors.some((e) => e.includes("nonexistent"))).toBe(true);
  });

  it("rejects duplicate step IDs across tasks", async () => {
    const tool = new CreatePlanTool();
    const result = (await tool.process(createMockContext(), {
      title: "Duplicate Steps",
      tasks: [
        {
          id: "task_a",
          title: "A",
          depends_on: [],
          steps: [
            { id: "s1", instructions: "Do A", depends_on: [] }
          ]
        },
        {
          id: "task_b",
          title: "B",
          depends_on: [],
          steps: [
            { id: "s1", instructions: "Do B", depends_on: [] }
          ]
        }
      ]
    })) as Record<string, unknown>;

    expect(result.status).toBe("validation_failed");
    const errors = result.errors as string[];
    expect(errors.some((e) => e.includes("Duplicate step ID"))).toBe(true);
  });

  it("rejects empty plan", async () => {
    const tool = new CreatePlanTool();
    const result = (await tool.process(createMockContext(), {
      title: "Empty",
      tasks: []
    })) as Record<string, unknown>;

    expect(result.status).toBe("validation_failed");
    const errors = result.errors as string[];
    expect(errors.some((e) => e.includes("at least one task"))).toBe(true);
  });

  it("detects circular task dependencies", async () => {
    const tool = new CreatePlanTool();
    const result = (await tool.process(createMockContext(), {
      title: "Cyclic",
      tasks: [
        {
          id: "task_a",
          title: "A",
          depends_on: ["task_b"],
          steps: [
            { id: "s1", instructions: "Do A", depends_on: [] }
          ]
        },
        {
          id: "task_b",
          title: "B",
          depends_on: ["task_a"],
          steps: [
            { id: "s2", instructions: "Do B", depends_on: [] }
          ]
        }
      ]
    })) as Record<string, unknown>;

    expect(result.status).toBe("validation_failed");
    const errors = result.errors as string[];
    expect(errors.some((e) => e.includes("Circular"))).toBe(true);
  });

  it("accepts valid task DAGs", async () => {
    const tool = new CreatePlanTool();
    const result = (await tool.process(createMockContext(), {
      title: "Valid DAG",
      tasks: [
        {
          id: "task_a",
          title: "A",
          depends_on: [],
          steps: [
            { id: "s1", instructions: "Do A", depends_on: [] }
          ]
        },
        {
          id: "task_b",
          title: "B",
          depends_on: ["task_a"],
          steps: [
            { id: "s2", instructions: "Do B", depends_on: [] }
          ]
        },
        {
          id: "task_c",
          title: "C",
          depends_on: ["task_a", "task_b"],
          steps: [
            { id: "s3", instructions: "Do C", depends_on: [] }
          ]
        }
      ]
    })) as Record<string, unknown>;

    expect(result.status).toBe("plan_created");
    expect(tool.plan).not.toBeNull();
  });

  it("handles camelCase dependsOn in task data", async () => {
    const tool = new CreatePlanTool();
    const result = (await tool.process(createMockContext(), {
      title: "CamelCase Plan",
      tasks: [
        {
          id: "task_1",
          title: "One",
          depends_on: [],
          steps: [{ id: "s1", instructions: "Do it", depends_on: [] }]
        },
        {
          id: "task_2",
          title: "Two",
          dependsOn: ["task_1"],
          steps: [{ id: "s2", instructions: "Do it", dependsOn: [] }]
        }
      ]
    })) as Record<string, unknown>;

    expect(result.status).toBe("plan_created");
    const plan = tool.plan!;
    expect(plan.tasks[1].dependsOn).toEqual(["task_1"]);
  });

  it("validates step dependencies within tasks", async () => {
    const tool = new CreatePlanTool();
    const result = (await tool.process(createMockContext(), {
      title: "Bad Step Deps",
      tasks: [
        {
          id: "task_a",
          title: "A",
          depends_on: [],
          steps: [
            { id: "s1", instructions: "Do A", depends_on: ["nonexistent_step"] }
          ]
        }
      ]
    })) as Record<string, unknown>;

    expect(result.status).toBe("validation_failed");
    const errors = result.errors as string[];
    expect(errors.some((e) => e.includes("nonexistent_step"))).toBe(true);
  });
});
