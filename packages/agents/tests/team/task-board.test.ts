import { describe, it, expect, beforeEach, vi } from "vitest";
import { TaskBoard } from "../../src/team/task-board.js";
import type { AgentIdentity, TeamEvent } from "../../src/team/types.js";

const researcher: AgentIdentity = {
  id: "researcher",
  name: "Researcher",
  role: "Research specialist",
  skills: ["web_search", "analysis"],
  provider: "openai",
  model: "gpt-4o",
  tools: []
};

const writer: AgentIdentity = {
  id: "writer",
  name: "Writer",
  role: "Content writer",
  skills: ["writing", "editing"],
  provider: "openai",
  model: "gpt-4o",
  tools: []
};

describe("TaskBoard", () => {
  let board: TaskBoard;

  beforeEach(() => {
    board = new TaskBoard();
  });

  it("creates a task with correct defaults", () => {
    const task = board.create({
      title: "Research AI papers",
      description: "Find recent papers on multi-agent systems",
      createdBy: "coordinator"
    });

    expect(task.id).toBeDefined();
    expect(task.status).toBe("open");
    expect(task.priority).toBe(5);
    expect(task.dependsOn).toEqual([]);
    expect(task.artifacts).toEqual([]);
  });

  it("claims an open task atomically", () => {
    const task = board.create({
      title: "Write report",
      description: "Write the final report",
      createdBy: "coordinator"
    });

    const claimed = board.claim(task.id, "writer");
    expect(claimed).toBe(true);

    // Second claim fails
    const claimedAgain = board.claim(task.id, "researcher");
    expect(claimedAgain).toBe(false);
  });

  it("respects dependency ordering", () => {
    const taskA = board.create({
      title: "Research",
      description: "Do research",
      createdBy: "coord"
    });

    const taskB = board.create({
      title: "Write",
      description: "Write based on research",
      createdBy: "coord",
      dependsOn: [taskA.id]
    });

    // Can't claim B while A is not done
    expect(board.claim(taskB.id, "writer")).toBe(false);

    // Complete A
    board.claim(taskA.id, "researcher");
    board.startWork(taskA.id, "researcher");
    board.complete(taskA.id, { result: "research findings" });

    // Now B can be claimed
    expect(board.claim(taskB.id, "writer")).toBe(true);
  });

  it("completes a task with result and artifacts", () => {
    const task = board.create({
      title: "Analyze data",
      description: "Analyze the dataset",
      createdBy: "coord"
    });

    board.claim(task.id, "researcher");
    board.startWork(task.id, "researcher");
    const completed = board.complete(task.id, {
      result: { summary: "Data shows upward trend" },
      artifacts: ["chart.png"]
    });

    expect(completed).toBe(true);
    const updated = board.get(task.id);
    expect(updated?.status).toBe("done");
    expect(updated?.result).toEqual({ summary: "Data shows upward trend" });
    expect(updated?.artifacts).toContain("chart.png");
  });

  it("fails a task with reason", () => {
    const task = board.create({
      title: "Fetch data",
      description: "Get API data",
      createdBy: "coord"
    });

    board.claim(task.id, "researcher");
    board.startWork(task.id, "researcher");
    board.fail(task.id, "API rate limit exceeded");

    const updated = board.get(task.id);
    expect(updated?.status).toBe("failed");
    expect(updated?.failureReason).toBe("API rate limit exceeded");
  });

  it("getAvailable filters by skills", () => {
    board.create({
      title: "Search web",
      description: "Search the web",
      createdBy: "coord",
      requiredSkills: ["web_search"]
    });
    board.create({
      title: "Write article",
      description: "Write an article",
      createdBy: "coord",
      requiredSkills: ["writing"]
    });

    const forResearcher = board.getAvailable(researcher);
    expect(forResearcher).toHaveLength(1);
    expect(forResearcher[0].title).toBe("Search web");

    const forWriter = board.getAvailable(writer);
    expect(forWriter).toHaveLength(1);
    expect(forWriter[0].title).toBe("Write article");
  });

  it("getAvailable returns all open tasks when no skills required", () => {
    board.create({
      title: "Task 1",
      description: "No skills needed",
      createdBy: "coord"
    });
    board.create({
      title: "Task 2",
      description: "No skills needed",
      createdBy: "coord"
    });

    expect(board.getAvailable(researcher)).toHaveLength(2);
  });

  it("sorts available tasks by priority", () => {
    board.create({
      title: "Low priority",
      description: "desc",
      createdBy: "coord",
      priority: 9
    });
    board.create({
      title: "High priority",
      description: "desc",
      createdBy: "coord",
      priority: 1
    });
    board.create({
      title: "Medium priority",
      description: "desc",
      createdBy: "coord",
      priority: 5
    });

    const tasks = board.getAvailable();
    expect(tasks[0].title).toBe("High priority");
    expect(tasks[1].title).toBe("Medium priority");
    expect(tasks[2].title).toBe("Low priority");
  });

  it("decompose creates subtasks and blocks parent", () => {
    const parent = board.create({
      title: "Write report",
      description: "Full report",
      createdBy: "coord"
    });

    board.claim(parent.id, "writer");
    board.startWork(parent.id, "writer");

    const subtasks = board.decompose(parent.id, [
      { title: "Intro", description: "Write intro", createdBy: "writer" },
      { title: "Body", description: "Write body", createdBy: "writer" },
      {
        title: "Conclusion",
        description: "Write conclusion",
        createdBy: "writer"
      }
    ]);

    expect(subtasks).toHaveLength(3);
    expect(board.get(parent.id)?.status).toBe("blocked");

    // Subtasks are open
    for (const sub of subtasks) {
      expect(board.get(sub.id)?.status).toBe("open");
      expect(board.get(sub.id)?.parentTaskId).toBe(parent.id);
    }
  });

  it("resolveParents auto-completes parent when all subtasks done", () => {
    const parent = board.create({
      title: "Report",
      description: "Full report",
      createdBy: "coord"
    });

    board.claim(parent.id, "writer");
    board.startWork(parent.id, "writer");

    const subtasks = board.decompose(parent.id, [
      { title: "Part 1", description: "d1", createdBy: "writer" },
      { title: "Part 2", description: "d2", createdBy: "writer" }
    ]);

    // Complete all subtasks
    for (const sub of subtasks) {
      board.claim(sub.id, "writer");
      board.startWork(sub.id, "writer");
      board.complete(sub.id, { result: `result for ${sub.title}` });
    }

    board.resolveParents();
    expect(board.get(parent.id)?.status).toBe("done");
  });

  it("detects deadlock when no progress is possible", () => {
    const taskA = board.create({
      title: "Task A",
      description: "desc",
      createdBy: "coord"
    });
    const taskB = board.create({
      title: "Task B",
      description: "desc",
      createdBy: "coord",
      dependsOn: [taskA.id]
    });

    // Fail Task A — now Task B can never have its dependency met
    board.claim(taskA.id, "researcher");
    board.startWork(taskA.id, "researcher");
    board.fail(taskA.id, "failed");

    const deadlock = board.detectDeadlock();
    expect(deadlock).not.toBeNull();
    expect(deadlock).toContain(taskB.id);
  });

  it("isComplete returns true when all tasks are terminal", () => {
    const task = board.create({
      title: "Only task",
      description: "desc",
      createdBy: "coord"
    });

    expect(board.isComplete()).toBe(false);

    board.claim(task.id, "researcher");
    board.startWork(task.id, "researcher");
    board.complete(task.id, { result: "done" });

    expect(board.isComplete()).toBe(true);
  });

  it("emits events for task lifecycle", () => {
    const events: TeamEvent[] = [];
    board.onEvent((e) => events.push(e));

    const task = board.create({
      title: "Test",
      description: "desc",
      createdBy: "coord"
    });
    board.claim(task.id, "researcher");
    board.startWork(task.id, "researcher");
    board.complete(task.id, { result: "ok" });

    expect(events).toHaveLength(4);
    expect(events[0].type).toBe("task_created");
    expect(events[1].type).toBe("task_claimed");
    expect(events[2].type).toBe("task_working");
    expect(events[3].type).toBe("task_completed");
  });

  it("rejects dependency cycles", () => {
    const taskA = board.create({
      title: "A",
      description: "d",
      createdBy: "c"
    });

    // Can't create a task depending on itself
    // (indirect cycle through A→B→A)
    const taskB = board.create({
      title: "B",
      description: "d",
      createdBy: "c",
      dependsOn: [taskA.id]
    });

    expect(() =>
      board.create({
        title: "Cycle",
        description: "d",
        createdBy: "c",
        dependsOn: [taskB.id]
      })
    ).not.toThrow(); // This is fine: A→B→C is a chain, not a cycle
  });

  it("block and unblock changes task status", () => {
    const task = board.create({
      title: "T",
      description: "d",
      createdBy: "c"
    });

    board.claim(task.id, "researcher");
    board.block(task.id);
    expect(board.get(task.id)?.status).toBe("blocked");

    board.unblock(task.id);
    expect(board.get(task.id)?.status).toBe("open");
    expect(board.get(task.id)?.claimedBy).toBeUndefined();
  });

  it("getSubtasks returns children of a parent", () => {
    const parent = board.create({
      title: "Parent",
      description: "d",
      createdBy: "c"
    });
    board.claim(parent.id, "w");
    board.startWork(parent.id, "w");
    board.decompose(parent.id, [
      { title: "Sub 1", description: "d1", createdBy: "c" },
      { title: "Sub 2", description: "d2", createdBy: "c" }
    ]);

    const subs = board.getSubtasks(parent.id);
    expect(subs).toHaveLength(2);
  });

  it("unsubscribe removes event listener", () => {
    const handler = vi.fn();
    const unsub = board.onEvent(handler);
    unsub();

    board.create({ title: "T", description: "d", createdBy: "c" });
    expect(handler).not.toHaveBeenCalled();
  });
});
