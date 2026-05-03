import { describe, it, expect, beforeEach } from "vitest";
import { MessageBus } from "../../src/team/message-bus.js";
import { TaskBoard } from "../../src/team/task-board.js";
import { createTeamTools } from "../../src/team/team-tools.js";
import type { AgentIdentity } from "../../src/team/types.js";
import type { ProcessingContext } from "@nodetool-ai/runtime";

const alice: AgentIdentity = {
  id: "alice",
  name: "Alice",
  role: "Coordinator",
  skills: ["planning", "analysis"],
  provider: "openai",
  model: "gpt-4o",
  tools: []
};

const bob: AgentIdentity = {
  id: "bob",
  name: "Bob",
  role: "Researcher",
  skills: ["web_search", "analysis"],
  provider: "openai",
  model: "gpt-4o",
  tools: []
};

const mockContext = {} as ProcessingContext;

describe("Team Tools", () => {
  let bus: MessageBus;
  let board: TaskBoard;
  let aliceTools: ReturnType<typeof createTeamTools>;
  let bobTools: ReturnType<typeof createTeamTools>;

  beforeEach(() => {
    bus = new MessageBus();
    board = new TaskBoard();
    bus.register("alice");
    bus.register("bob");
    const roster = [alice, bob];
    aliceTools = createTeamTools(alice, roster, bus, board);
    bobTools = createTeamTools(bob, roster, bus, board);
  });

  function findTool(tools: ReturnType<typeof createTeamTools>, name: string) {
    return tools.find((t) => t.name === name)!;
  }

  describe("SendMessageTool", () => {
    it("sends a message to a specific agent", async () => {
      const tool = findTool(aliceTools, "send_message");
      const result = await tool.process(mockContext, {
        to: "bob",
        subject: "hello",
        body: "Hi Bob!"
      });

      expect((result as Record<string, unknown>).status).toBe("sent");
      expect(bus.receive("bob")).toHaveLength(1);
    });

    it("rejects messages to unknown agents", async () => {
      const tool = findTool(aliceTools, "send_message");
      const result = await tool.process(mockContext, {
        to: "unknown",
        subject: "hello",
        body: "msg"
      });

      expect((result as Record<string, unknown>).error).toBeDefined();
    });
  });

  describe("BroadcastTool", () => {
    it("broadcasts to all teammates", async () => {
      const tool = findTool(aliceTools, "broadcast");
      await tool.process(mockContext, {
        subject: "update",
        body: "Big news!"
      });

      expect(bus.receive("bob")).toHaveLength(1);
      expect(bus.receive("alice")).toHaveLength(0); // sender excluded
    });
  });

  describe("CheckMessagesTool", () => {
    it("returns and clears pending messages", async () => {
      bus.send({
        from: "alice",
        to: "bob",
        type: "info",
        subject: "test",
        body: "msg"
      });

      const tool = findTool(bobTools, "check_messages");
      const result = (await tool.process(mockContext, {})) as Record<
        string,
        unknown
      >;

      expect((result.messages as unknown[]).length).toBe(1);

      // Second call returns empty
      const result2 = (await tool.process(mockContext, {})) as Record<
        string,
        unknown
      >;
      expect((result2.messages as unknown[]).length).toBe(0);
    });
  });

  describe("CreateTaskTool", () => {
    it("creates a task on the board", async () => {
      const tool = findTool(aliceTools, "create_task");
      const result = (await tool.process(mockContext, {
        title: "Research AI",
        description: "Find papers on multi-agent systems",
        required_skills: ["web_search"],
        priority: 2
      })) as Record<string, unknown>;

      expect(result.status).toBe("created");
      expect(result.taskId).toBeDefined();
      expect(board.getSnapshot()).toHaveLength(1);
    });
  });

  describe("ListTasksTool", () => {
    it("lists all tasks", async () => {
      board.create({
        title: "Task 1",
        description: "d1",
        createdBy: "alice"
      });
      board.create({
        title: "Task 2",
        description: "d2",
        createdBy: "alice"
      });

      const tool = findTool(bobTools, "list_tasks");
      const result = (await tool.process(mockContext, {})) as Record<
        string,
        unknown
      >;
      expect((result.tasks as unknown[]).length).toBe(2);
    });

    it("filters to available only", async () => {
      const t1 = board.create({
        title: "Available",
        description: "d1",
        createdBy: "alice"
      });
      board.create({
        title: "Claimed",
        description: "d2",
        createdBy: "alice"
      });
      board.claim(
        board.getSnapshot().find((t) => t.title === "Claimed")!.id,
        "alice"
      );

      const tool = findTool(bobTools, "list_tasks");
      const result = (await tool.process(mockContext, {
        available_only: true
      })) as Record<string, unknown>;
      expect((result.tasks as unknown[]).length).toBe(1);
    });
  });

  describe("ClaimTaskTool", () => {
    it("claims and starts work on a task", async () => {
      const task = board.create({
        title: "Research",
        description: "do research",
        createdBy: "alice"
      });

      const tool = findTool(bobTools, "claim_task");
      const result = (await tool.process(mockContext, {
        task_id: task.id
      })) as Record<string, unknown>;

      expect(result.status).toBe("claimed_and_working");
      expect(board.get(task.id)?.status).toBe("working");
      expect(board.get(task.id)?.claimedBy).toBe("bob");
    });
  });

  describe("CompleteTaskTool", () => {
    it("completes a task with result", async () => {
      const task = board.create({
        title: "Research",
        description: "do research",
        createdBy: "alice"
      });
      board.claim(task.id, "bob");
      board.startWork(task.id, "bob");

      const tool = findTool(bobTools, "complete_task");
      const result = (await tool.process(mockContext, {
        task_id: task.id,
        result: { findings: ["multi-agent systems are cool"] }
      })) as Record<string, unknown>;

      expect(result.status).toBe("completed");
      expect(board.get(task.id)?.status).toBe("done");
    });
  });

  describe("FailTaskTool", () => {
    it("marks a task as failed", async () => {
      const task = board.create({
        title: "Fetch",
        description: "fetch data",
        createdBy: "alice"
      });
      board.claim(task.id, "bob");
      board.startWork(task.id, "bob");

      const tool = findTool(bobTools, "fail_task");
      const result = (await tool.process(mockContext, {
        task_id: task.id,
        reason: "API down"
      })) as Record<string, unknown>;

      expect(result.status).toBe("marked_failed");
      expect(board.get(task.id)?.status).toBe("failed");
    });
  });

  describe("DecomposeTaskTool", () => {
    it("decomposes a task into subtasks", async () => {
      const task = board.create({
        title: "Report",
        description: "write full report",
        createdBy: "alice"
      });
      board.claim(task.id, "bob");
      board.startWork(task.id, "bob");

      const tool = findTool(bobTools, "decompose_task");
      const result = (await tool.process(mockContext, {
        task_id: task.id,
        subtasks: [
          { title: "Intro", description: "write intro" },
          { title: "Body", description: "write body" }
        ]
      })) as Record<string, unknown>;

      expect(result.status).toBe("decomposed");
      expect((result.subtasks as unknown[]).length).toBe(2);
      expect(board.get(task.id)?.status).toBe("blocked");
    });
  });

  it("createTeamTools returns all 9 team tools", () => {
    expect(aliceTools).toHaveLength(9);
    const names = aliceTools.map((t) => t.name).sort();
    expect(names).toEqual([
      "broadcast",
      "check_messages",
      "claim_task",
      "complete_task",
      "create_task",
      "decompose_task",
      "fail_task",
      "list_tasks",
      "send_message"
    ]);
  });
});
