import { describe, it, expect, beforeEach, vi } from "vitest";
import { MessageBus } from "../../src/team/message-bus.js";

describe("MessageBus", () => {
  let bus: MessageBus;

  beforeEach(() => {
    bus = new MessageBus();
    bus.register("alice");
    bus.register("bob");
    bus.register("carol");
  });

  it("delivers a message to a specific agent", () => {
    bus.send({
      from: "alice",
      to: "bob",
      type: "info",
      subject: "hello",
      body: "Hi Bob!"
    });

    const bobMessages = bus.receive("bob");
    expect(bobMessages).toHaveLength(1);
    expect(bobMessages[0].from).toBe("alice");
    expect(bobMessages[0].subject).toBe("hello");
    expect(bobMessages[0].body).toBe("Hi Bob!");

    // Alice should have no messages
    expect(bus.receive("alice")).toHaveLength(0);
  });

  it("broadcasts to all agents except sender", () => {
    bus.send({
      from: "alice",
      to: "all",
      type: "info",
      subject: "announcement",
      body: "Team meeting!"
    });

    expect(bus.receive("bob")).toHaveLength(1);
    expect(bus.receive("carol")).toHaveLength(1);
    expect(bus.receive("alice")).toHaveLength(0); // sender excluded
  });

  it("receive drains the inbox", () => {
    bus.send({
      from: "alice",
      to: "bob",
      type: "info",
      subject: "test",
      body: "msg1"
    });
    bus.send({
      from: "carol",
      to: "bob",
      type: "info",
      subject: "test",
      body: "msg2"
    });

    const first = bus.receive("bob");
    expect(first).toHaveLength(2);

    const second = bus.receive("bob");
    expect(second).toHaveLength(0);
  });

  it("peek does not consume messages", () => {
    bus.send({
      from: "alice",
      to: "bob",
      type: "info",
      subject: "test",
      body: "msg"
    });

    expect(bus.peek("bob")).toHaveLength(1);
    expect(bus.peek("bob")).toHaveLength(1); // still there
    expect(bus.receive("bob")).toHaveLength(1); // now consumed
    expect(bus.peek("bob")).toHaveLength(0);
  });

  it("subscribers get notified in real-time", () => {
    const handler = vi.fn();
    bus.subscribe("bob", handler);

    bus.send({
      from: "alice",
      to: "bob",
      type: "request",
      subject: "help",
      body: "Need help"
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].subject).toBe("help");
  });

  it("unsubscribe stops notifications", () => {
    const handler = vi.fn();
    const unsub = bus.subscribe("bob", handler);
    unsub();

    bus.send({
      from: "alice",
      to: "bob",
      type: "info",
      subject: "test",
      body: "msg"
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it("getThread returns the full conversation thread", () => {
    const msg1 = bus.send({
      from: "alice",
      to: "bob",
      type: "request",
      subject: "question",
      body: "What's the status?"
    });

    const msg2 = bus.send({
      from: "bob",
      to: "alice",
      type: "response",
      subject: "re: question",
      body: "All good!",
      replyTo: msg1.id
    });

    const msg3 = bus.send({
      from: "alice",
      to: "bob",
      type: "response",
      subject: "re: re: question",
      body: "Great!",
      replyTo: msg2.id
    });

    const thread = bus.getThread(msg3.id);
    expect(thread).toHaveLength(3);
    expect(thread[0].id).toBe(msg1.id);
    expect(thread[2].id).toBe(msg3.id);
  });

  it("pendingCount returns correct count", () => {
    expect(bus.pendingCount("bob")).toBe(0);

    bus.send({
      from: "alice",
      to: "bob",
      type: "info",
      subject: "test",
      body: "msg1"
    });
    bus.send({
      from: "carol",
      to: "bob",
      type: "info",
      subject: "test",
      body: "msg2"
    });

    expect(bus.pendingCount("bob")).toBe(2);
    bus.receive("bob");
    expect(bus.pendingCount("bob")).toBe(0);
  });

  it("getHistory returns all messages", () => {
    bus.send({
      from: "alice",
      to: "bob",
      type: "info",
      subject: "s1",
      body: "b1"
    });
    bus.send({
      from: "bob",
      to: "carol",
      type: "info",
      subject: "s2",
      body: "b2"
    });

    const history = bus.getHistory();
    expect(history).toHaveLength(2);
  });

  it("messages to unregistered agents are silently dropped", () => {
    const msg = bus.send({
      from: "alice",
      to: "unknown_agent",
      type: "info",
      subject: "test",
      body: "msg"
    });

    // Message was created
    expect(msg.id).toBeDefined();
    // But not delivered
    expect(bus.getHistory()).toHaveLength(1);
  });
});
