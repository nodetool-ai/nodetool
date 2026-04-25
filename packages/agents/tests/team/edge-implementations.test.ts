import { describe, it, expect, beforeEach, vi } from "vitest";
import { EdgeMessageBus } from "../../src/team/edge-message-bus.js";
import { EdgeTaskBoard } from "../../src/team/edge-task-board.js";
import { TaskBoard } from "../../src/team/task-board.js";
import type { ProcessingContext } from "@nodetool/runtime";

// Minimal mock for ProcessingContext
function mockContext(opts?: {
  hasControlSupport?: boolean;
  sendResult?: Record<string, unknown>;
}): ProcessingContext {
  const sendControlEvent = vi.fn().mockResolvedValue(opts?.sendResult ?? {});
  return {
    hasControlEventSupport: opts?.hasControlSupport ?? false,
    sendControlEvent
  } as unknown as ProcessingContext;
}

describe("EdgeMessageBus", () => {
  it("works identically to MessageBus without context (in-memory fallback)", () => {
    const bus = new EdgeMessageBus();
    bus.register("alice");
    bus.register("bob");

    bus.send({
      from: "alice",
      to: "bob",
      type: "info",
      subject: "hello",
      body: "Hi!"
    });

    expect(bus.receive("bob")).toHaveLength(1);
    expect(bus.receive("alice")).toHaveLength(0);
  });

  it("broadcasts work in fallback mode", () => {
    const bus = new EdgeMessageBus();
    bus.register("alice");
    bus.register("bob");
    bus.register("carol");

    bus.send({
      from: "alice",
      to: "all",
      type: "info",
      subject: "news",
      body: "update"
    });

    expect(bus.receive("bob")).toHaveLength(1);
    expect(bus.receive("carol")).toHaveLength(1);
    expect(bus.receive("alice")).toHaveLength(0);
  });

  it("routes via control events when agent is mapped to a node", () => {
    const ctx = mockContext({ hasControlSupport: true });
    const bus = new EdgeMessageBus(ctx);
    bus.register("alice");
    bus.register("bob");
    bus.mapAgentToNode("bob", "node_bob");

    bus.send({
      from: "alice",
      to: "bob",
      type: "request",
      subject: "help",
      body: "Need help"
    });

    // Should have called sendControlEvent for the node
    expect(ctx.sendControlEvent).toHaveBeenCalledWith(
      "node_bob",
      expect.objectContaining({
        __agent_message__: true,
        message: expect.objectContaining({
          from: "alice",
          to: "bob",
          subject: "help"
        })
      })
    );
  });

  it("falls back to in-memory when no node mapping exists", () => {
    const ctx = mockContext({ hasControlSupport: true });
    const bus = new EdgeMessageBus(ctx);
    bus.register("alice");
    bus.register("bob");
    // No mapAgentToNode call

    bus.send({
      from: "alice",
      to: "bob",
      type: "info",
      subject: "test",
      body: "msg"
    });

    // Should NOT have called sendControlEvent
    expect(ctx.sendControlEvent).not.toHaveBeenCalled();
    // Should be in inbox via fallback
    expect(bus.receive("bob")).toHaveLength(1);
  });

  it("getHistory tracks all messages regardless of delivery method", () => {
    const ctx = mockContext({ hasControlSupport: true });
    const bus = new EdgeMessageBus(ctx);
    bus.register("alice");
    bus.register("bob");
    bus.mapAgentToNode("bob", "node_bob");

    bus.send({
      from: "alice",
      to: "bob",
      type: "info",
      subject: "s1",
      body: "b1"
    });

    const history = bus.getHistory();
    expect(history).toHaveLength(1);
    expect(history[0].subject).toBe("s1");
  });

  it("subscribers work in edge mode", () => {
    const bus = new EdgeMessageBus();
    bus.register("alice");
    bus.register("bob");

    const handler = vi.fn();
    bus.subscribe("bob", handler);

    bus.send({
      from: "alice",
      to: "bob",
      type: "info",
      subject: "test",
      body: "msg"
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("pendingCount works", () => {
    const bus = new EdgeMessageBus();
    bus.register("bob");

    expect(bus.pendingCount("bob")).toBe(0);
    bus.send({
      from: "alice",
      to: "bob",
      type: "info",
      subject: "s",
      body: "b"
    });
    // In fallback mode, message goes to inbox
    expect(bus.pendingCount("bob")).toBe(1);
  });
});

describe("EdgeTaskBoard", () => {
  it("delegates all operations to inner TaskBoard", () => {
    const edge = new EdgeTaskBoard();

    const task = edge.create({
      title: "Test task",
      description: "Do something",
      createdBy: "coord"
    });

    expect(task.id).toBeDefined();
    expect(task.status).toBe("open");
    expect(edge.getSnapshot()).toHaveLength(1);

    edge.claim(task.id, "worker");
    expect(edge.get(task.id)?.status).toBe("claimed");

    edge.startWork(task.id, "worker");
    expect(edge.get(task.id)?.status).toBe("working");

    edge.complete(task.id, { result: "done!" });
    expect(edge.get(task.id)?.status).toBe("done");
    expect(edge.isComplete()).toBe(true);
  });

  it("notifies board node via control events when context is available", () => {
    const ctx = mockContext({ hasControlSupport: true });
    const edge = new EdgeTaskBoard({ context: ctx, boardNodeId: "board_node" });

    edge.create({
      title: "Task",
      description: "desc",
      createdBy: "coord"
    });

    // Should have fired notification
    expect(ctx.sendControlEvent).toHaveBeenCalledWith(
      "board_node",
      expect.objectContaining({
        __task_board_op__: true,
        operation: "task_created"
      })
    );
  });

  it("does not call sendControlEvent without board node ID", () => {
    const ctx = mockContext({ hasControlSupport: true });
    const edge = new EdgeTaskBoard({ context: ctx }); // no boardNodeId

    edge.create({
      title: "Task",
      description: "desc",
      createdBy: "coord"
    });

    expect(ctx.sendControlEvent).not.toHaveBeenCalled();
  });

  it("wraps a pre-populated TaskBoard", () => {
    const inner = new TaskBoard();
    const t1 = inner.create({
      title: "Existing",
      description: "pre-populated",
      createdBy: "system"
    });

    const edge = new EdgeTaskBoard({ inner });
    expect(edge.getSnapshot()).toHaveLength(1);
    expect(edge.get(t1.id)?.title).toBe("Existing");
  });

  it("dependency chain works through edge board", () => {
    const edge = new EdgeTaskBoard();

    const taskA = edge.create({
      title: "First",
      description: "d",
      createdBy: "c"
    });
    const taskB = edge.create({
      title: "Second",
      description: "d",
      createdBy: "c",
      dependsOn: [taskA.id]
    });

    // Can't claim B yet
    expect(edge.claim(taskB.id, "w")).toBe(false);

    // Complete A
    edge.claim(taskA.id, "w");
    edge.startWork(taskA.id, "w");
    edge.complete(taskA.id, { result: "ok" });

    // Now B is claimable
    expect(edge.claim(taskB.id, "w")).toBe(true);
  });

  it("decompose works and notifies", () => {
    const ctx = mockContext({ hasControlSupport: true });
    const edge = new EdgeTaskBoard({ context: ctx, boardNodeId: "bn" });

    const parent = edge.create({
      title: "Big task",
      description: "d",
      createdBy: "c"
    });
    edge.claim(parent.id, "w");
    edge.startWork(parent.id, "w");

    const subs = edge.decompose(parent.id, [
      { title: "Sub 1", description: "d1", createdBy: "c" },
      { title: "Sub 2", description: "d2", createdBy: "c" }
    ]);

    expect(subs).toHaveLength(2);
    expect(edge.get(parent.id)?.status).toBe("blocked");

    // Notification was sent
    expect(ctx.sendControlEvent).toHaveBeenCalledWith(
      "bn",
      expect.objectContaining({
        operation: "task_decomposed"
      })
    );
  });

  it("event listeners still work", () => {
    const edge = new EdgeTaskBoard();
    const events: string[] = [];
    edge.onEvent((e) => events.push(e.type));

    const task = edge.create({
      title: "T",
      description: "d",
      createdBy: "c"
    });
    edge.claim(task.id, "w");
    edge.startWork(task.id, "w");
    edge.complete(task.id);

    expect(events).toEqual([
      "task_created",
      "task_claimed",
      "task_working",
      "task_completed"
    ]);
  });

  it("resolveParents works", () => {
    const edge = new EdgeTaskBoard();

    const parent = edge.create({
      title: "P",
      description: "d",
      createdBy: "c"
    });
    edge.claim(parent.id, "w");
    edge.startWork(parent.id, "w");

    const subs = edge.decompose(parent.id, [
      { title: "S1", description: "d", createdBy: "c" }
    ]);

    edge.claim(subs[0].id, "w");
    edge.startWork(subs[0].id, "w");
    edge.complete(subs[0].id, { result: "ok" });

    edge.resolveParents();
    expect(edge.get(parent.id)?.status).toBe("done");
  });
});

