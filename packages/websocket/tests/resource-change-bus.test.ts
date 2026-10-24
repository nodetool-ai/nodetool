import { afterEach, expect, it, vi } from "vitest";
import { DBModel, ModelChangeEvent, ModelObserver } from "@nodetool-ai/models";
import { resourceEvents } from "../src/resource-events.js";
import {
  ResourceChangeBus,
  resourceChangeBus,
  startResourceChangeFeeds,
  stopResourceChangeFeeds,
  type ResourceChange
} from "../src/lib/resource-change-bus.js";
import { WebSocketClientSession } from "../src/websocket-client-session.js";

const payload: ResourceChange = {
  resource_type: "timelinesequence",
  event: "updated",
  resource: { id: "a".repeat(32), etag: "etag", updated_at: "2026-10-23" },
  ops: [{ tool: "ui_update_clip", input: { clip_id: "clip", name: "Edited" } }],
  owner_user_id: "A"
};

afterEach(() => {
  stopResourceChangeFeeds();
  vi.restoreAllMocks();
});

it("delivers synchronously once locally and suppresses its own notification", () => {
  const bus = new ResourceChangeBus("one");
  const seen = vi.fn();
  const unsubscribe = bus.subscribe(seen);
  bus.publish(payload);
  expect(seen).toHaveBeenCalledExactlyOnceWith(payload);
  bus.receive(JSON.stringify({ origin: "one", payload }));
  expect(seen).toHaveBeenCalledTimes(1);
  bus.receive(JSON.stringify({ origin: "two", payload }));
  expect(seen).toHaveBeenCalledTimes(2);
  unsubscribe();
  bus.publish(payload);
  expect(seen).toHaveBeenCalledTimes(2);
});

it("local transport cannot deliver to another bus", () => {
  const one = new ResourceChangeBus("one");
  const two = new ResourceChangeBus("two");
  const seen = vi.fn();
  two.subscribe(seen);
  one.publish(payload);
  expect(seen).not.toHaveBeenCalled();
});

it("serializes once per write and attaches one listener to each feed", () => {
  class Example extends DBModel {}
  const instance = new Example({
    id: "a".repeat(32),
    user_id: "A",
    workflow_id: "b".repeat(32)
  });
  const etag = vi.spyOn(instance, "getEtag").mockReturnValue("etag");
  vi.spyOn(instance, "partitionValue").mockReturnValue("a".repeat(32));
  const first = vi.fn();
  const second = vi.fn();
  const before = resourceEvents.listenerCount("change");
  startResourceChangeFeeds();
  startResourceChangeFeeds();
  const off1 = resourceChangeBus.subscribe(first);
  const off2 = resourceChangeBus.subscribe(second);
  try {
    ModelObserver.notify(instance, ModelChangeEvent.UPDATED, {
      ops: payload.ops
    });
    expect(etag).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledWith(first.mock.calls[0]?.[0]);
    expect(first.mock.calls[0]?.[0]).toMatchObject({
      owner_user_id: "A",
      resource: { workflow_id: "b".repeat(32) },
      ops: payload.ops
    });
    expect(resourceEvents.listenerCount("change")).toBe(before + 1);
    resourceEvents.emitChange({
      event: "updated",
      resource_type: "workspacefile",
      resource: { id: "workspace" },
      userId: "B"
    });
    expect(first.mock.calls[1]?.[0]).toMatchObject({ owner_user_id: "B" });
  } finally {
    off1();
    off2();
  }
});

it("filters sockets by owner and preserves the wire frame", () => {
  const a = new WebSocketClientSession({ resolveExecutor: vi.fn() });
  const b = new WebSocketClientSession({ resolveExecutor: vi.fn() });
  const sentA = vi.spyOn(a, "sendDetached").mockImplementation(() => {});
  const sentB = vi.spyOn(b, "sendDetached").mockImplementation(() => {});
  // Register real subscriptions without starting unrelated chat/runtime services.
  Object.assign(a, { userId: "A", websocket: {} });
  Object.assign(b, { userId: "B", websocket: {} });
  a["registerObserver"]();
  b["registerObserver"]();
  try {
    resourceChangeBus.receive(JSON.stringify({ origin: "writer", payload }));
    const { owner_user_id: _owner, ...wire } = payload;
    expect(sentA).toHaveBeenCalledExactlyOnceWith({
      type: "resource_change",
      ...wire
    });
    expect(sentB).not.toHaveBeenCalled();
    resourceChangeBus.resync();
    expect(sentB).toHaveBeenCalledExactlyOnceWith({ type: "resource_resync" });
  } finally {
    a["unregisterObserver"]();
    b["unregisterObserver"]();
  }
  sentA.mockClear();
  resourceChangeBus.publish(payload);
  expect(sentA).not.toHaveBeenCalled();
});
