/**
 * Every connection used to put its own callback on `ModelObserver` and build
 * the `resource_change` frame itself, so one save with K tabs open ran
 * `getEtag()` (a JSON round-trip of every JSON column plus a sha256) K times.
 * The fanout builds the frame once per write and hands it to each connection,
 * which keeps its own owner filtering.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { unpack } from "msgpackr";
import {
  DBModel,
  ModelChangeEvent,
  ModelObserver
} from "@nodetool-ai/models";
import { resourceChangeMessageOutSchema } from "@nodetool-ai/protocol";
import {
  WebSocketClientSession,
  type WebSocketConnection,
  type WebSocketReceiveFrame
} from "../src/websocket-client-session.js";
import { notifyResourceChange, resourceEvents } from "../src/resource-events.js";
import { notifyPythonBridgeResourceChanges } from "../src/python-bridge-resource-events.js";
import {
  subscribeResourceChanges,
  type ResourceChangeFrame
} from "../src/lib/resource-change-fanout.js";

class MockWS implements WebSocketConnection {
  clientState: "connected" | "disconnected" = "connected";
  applicationState: "connected" | "disconnected" = "connected";
  sentBytes: Uint8Array[] = [];
  async accept(): Promise<void> {}
  async receive(): Promise<WebSocketReceiveFrame> {
    return { type: "websocket.disconnect" };
  }
  async sendBytes(data: Uint8Array): Promise<void> {
    this.sentBytes.push(data);
  }
  async sendText(): Promise<void> {}
  async close(): Promise<void> {
    this.clientState = "disconnected";
    this.applicationState = "disconnected";
  }
}

class Workflow extends DBModel {
  override getEtag(): string {
    return "etag-1";
  }
}

/** A runtime-internal model: no `user_id`, so every connection gets it. */
class RunNodeState extends DBModel {
  override getEtag(): string {
    return "etag-2";
  }
}

const changeFrames = (ws: MockWS): Record<string, unknown>[] =>
  ws.sentBytes
    .map((b) => unpack(b) as Record<string, unknown>)
    .filter((m) => m["type"] === "resource_change");

const flush = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

interface Connected {
  session: WebSocketClientSession;
  ws: MockWS;
}

async function connectAs(userId: string): Promise<Connected> {
  const session = new WebSocketClientSession({
    userId,
    systemStatsEnabled: false
  });
  const ws = new MockWS();
  await session.connect(ws);
  return { session, ws };
}

let open: Connected[] = [];

beforeEach(() => {
  ModelObserver.clear();
  open = [];
});

afterEach(async () => {
  for (const { session } of open) await session.disconnect();
  open = [];
  vi.restoreAllMocks();
  ModelObserver.clear();
});

describe("resource change fanout", () => {
  it("computes the etag once per write and delivers it to each of the owner's connections", async () => {
    open = [
      await connectAs("u1"),
      await connectAs("u1"),
      await connectAs("u1"),
      await connectAs("u2")
    ];
    const etag = vi.spyOn(Workflow.prototype, "getEtag");

    ModelObserver.notify(
      new Workflow({
        id: "w1",
        user_id: "u1",
        project_id: "p1",
        updated_at: "2026-10-23T10:00:00.000Z"
      }),
      ModelChangeEvent.UPDATED
    );
    await flush();

    expect(etag).toHaveBeenCalledTimes(1);
    const expected = {
      type: "resource_change",
      event: "updated",
      resource_type: "workflow",
      resource: {
        id: "w1",
        etag: "etag-1",
        project_id: "p1",
        updated_at: "2026-10-23T10:00:00.000Z"
      }
    };
    for (const { ws } of open.slice(0, 3)) {
      expect(changeFrames(ws)).toEqual([expected]);
    }
    expect(changeFrames(open[3].ws)).toEqual([]);
    expect(resourceChangeMessageOutSchema.safeParse(expected).success).toBe(
      true
    );
  });

  it("delivers ownerless models to every connection", async () => {
    open = [await connectAs("u1"), await connectAs("u2")];
    const etag = vi.spyOn(RunNodeState.prototype, "getEtag");

    ModelObserver.notify(
      new RunNodeState({ id: "n1" }),
      ModelChangeEvent.CREATED
    );
    await flush();

    expect(etag).toHaveBeenCalledTimes(1);
    for (const { ws } of open) {
      expect(changeFrames(ws)).toEqual([
        {
          type: "resource_change",
          event: "created",
          resource_type: "runnodestate",
          resource: { id: "n1", etag: "etag-2" }
        }
      ]);
    }
  });

  it("skips the etag when no connection takes the write", async () => {
    open = [await connectAs("u1")];
    const etag = vi.spyOn(Workflow.prototype, "getEtag");

    ModelObserver.notify(
      new Workflow({ id: "w2", user_id: "someone-else" }),
      ModelChangeEvent.UPDATED
    );
    await flush();

    expect(etag).not.toHaveBeenCalled();
    expect(changeFrames(open[0].ws)).toEqual([]);
  });

  it("scopes resourceEvents changes to their user", async () => {
    open = [await connectAs("u1"), await connectAs("u2")];

    notifyResourceChange({
      event: "updated",
      resource_type: "collection",
      resource: { id: "c1" },
      userId: "u1"
    });
    await flush();

    expect(changeFrames(open[0].ws)).toEqual([
      {
        type: "resource_change",
        event: "updated",
        resource_type: "collection",
        resource: { id: "c1" }
      }
    ]);
    expect(changeFrames(open[1].ws)).toEqual([]);
  });

  it.each([true, false])("excludes app visitors from Python bridge changes (new provider: %s)", async (newProvider) => {
    const editor = await connectAs("u1");
    const visitorSession = new WebSocketClientSession({
      userId: "u1",
      appSession: { applicationId: "app-1", version: 1 },
      systemStatsEnabled: false
    });
    const visitorWs = new MockWS();
    await visitorSession.connect(visitorWs);
    open = [editor, { session: visitorSession, ws: visitorWs }];
    await notifyPythonBridgeResourceChanges(
      {
        listProviders: async () => [
          { id: "python", capabilities: [], required_secrets: [] }
        ]
      },
      async () => (newProvider ? ["python"] : [])
    );
    await flush();

    expect(
      changeFrames(editor.ws).map((frame) => [
        frame["resource_type"], frame["event"]
      ])
    ).toEqual([
      ["metadata", "updated"],
      ["provider", newProvider ? "created" : "updated"],
      ["model", "updated"]
    ]);
    expect(changeFrames(visitorWs)).toEqual([]);
  });

  it("removes the shared listeners when the last connection leaves", async () => {
    const baseline = resourceEvents.listenerCount("change");
    const unsubscribe = vi.spyOn(ModelObserver, "unsubscribe");
    const first = await connectAs("u1");
    const second = await connectAs("u1");
    expect(resourceEvents.listenerCount("change")).toBe(baseline + 1);

    await first.session.disconnect();
    expect(resourceEvents.listenerCount("change")).toBe(baseline + 1);
    const callsWhileOneLeft = unsubscribe.mock.calls.length;

    await second.session.disconnect();
    expect(resourceEvents.listenerCount("change")).toBe(baseline);
    expect(unsubscribe.mock.calls.length).toBe(callsWhileOneLeft + 1);

    // With the callback gone, a write builds no frame at all.
    const etag = vi.spyOn(Workflow.prototype, "getEtag");
    ModelObserver.notify(
      new Workflow({ id: "w3", user_id: "u1" }),
      ModelChangeEvent.UPDATED
    );
    expect(etag).not.toHaveBeenCalled();
  });

  it("keeps delivering to the others when one subscriber throws", () => {
    const received: ResourceChangeFrame[] = [];
    const unsubscribers = [
      subscribeResourceChanges({
        accepts: () => true,
        deliver: () => {
          throw new Error("boom");
        }
      }),
      subscribeResourceChanges({
        accepts: () => true,
        deliver: (frame) => {
          received.push(frame);
        }
      })
    ];
    try {
      ModelObserver.notify(
        new Workflow({ id: "w4", user_id: "u1" }),
        ModelChangeEvent.DELETED
      );
      expect(received).toHaveLength(1);
      expect(received[0]?.["event"]).toBe("deleted");
      expect(Object.isFrozen(received[0])).toBe(true);
    } finally {
      for (const unsubscribe of unsubscribers) unsubscribe();
    }
  });
});
