/**
 * Trigger wake-up entry points on the automation trigger nodes.
 *
 * Each trigger node is marked `isTrigger = true` and implements
 * `emitTriggerEvent(event, outputs)` mapping the delivered payload onto its
 * declared output slots — the run-time half of the "triggers as wake-up
 * calls" design (docs/superpowers/specs/2026-07-10-trigger-wakeup-redesign.md).
 */
import { describe, expect, it } from "vitest";
import type { StreamingOutputs, TriggerEvent } from "@nodetool-ai/node-sdk";
import {
  IntervalTriggerNode,
  WebhookTriggerNode,
  FileWatchTriggerNode,
  ManualTriggerNode,
  WaitNode
} from "@nodetool-ai/automation-nodes";

/** StreamingOutputs stub that records every emitted (slot, value) pair. */
function collectOutputs(): {
  outputs: StreamingOutputs;
  emitted: Map<string, unknown>;
} {
  const emitted = new Map<string, unknown>();
  const outputs: StreamingOutputs = {
    async emit(slot, value) {
      emitted.set(slot, value);
    },
    async emitGroup(values) {
      for (const [slot, value] of Object.entries(values)) {
        emitted.set(slot, value);
      }
    },
    async forward() {},
    async drop() {},
    complete() {}
  };
  return { outputs, emitted };
}

function event(nodeId: string, payload: unknown): TriggerEvent {
  return { node_id: nodeId, payload, input_id: "input-1" };
}

describe("isTrigger flag", () => {
  it("marks the four trigger nodes, not Wait", () => {
    expect(IntervalTriggerNode.isTrigger).toBe(true);
    expect(WebhookTriggerNode.isTrigger).toBe(true);
    expect(FileWatchTriggerNode.isTrigger).toBe(true);
    expect(ManualTriggerNode.isTrigger).toBe(true);
    expect(WaitNode.isTrigger).toBe(false);
  });
});

describe("WebhookTriggerNode configuration", () => {
  it("exposes no properties — the URL and secret belong to the registration", () => {
    // The delivery URL (`POST /api/webhooks/:token`) and the `x-webhook-secret`
    // value are generated per registration by the server. Node-level port /
    // host / path / methods / secret props would be a second, dead source of
    // truth for the same two facts.
    expect(new WebhookTriggerNode({}).serialize()).toEqual({});
  });

  it("does not override genProcess with its own HTTP server", () => {
    expect(
      Object.getOwnPropertyDescriptor(
        WebhookTriggerNode.prototype,
        "genProcess"
      )
    ).toBeUndefined();
  });
});

describe("WebhookTriggerNode.emitTriggerEvent", () => {
  it("maps a webhook payload onto body/headers/query/method/path slots", async () => {
    const node = new WebhookTriggerNode({});
    const { outputs, emitted } = collectOutputs();
    await node.emitTriggerEvent(
      event("wh", {
        body: { hello: 1 },
        headers: { "content-type": "application/json" },
        query: { a: "b" },
        method: "POST",
        path: "/hooks/x",
        timestamp: "2026-07-26T00:00:00Z"
      }),
      outputs
    );
    expect(emitted.get("body")).toEqual({ hello: 1 });
    expect(emitted.get("headers")).toEqual({
      "content-type": "application/json"
    });
    expect(emitted.get("query")).toEqual({ a: "b" });
    expect(emitted.get("method")).toBe("POST");
    expect(emitted.get("path")).toBe("/hooks/x");
    expect(emitted.get("timestamp")).toBe("2026-07-26T00:00:00Z");
    expect(emitted.get("event_type")).toBe("webhook");
  });

  it("treats a non-envelope payload as the body", async () => {
    const node = new WebhookTriggerNode({});
    const { outputs, emitted } = collectOutputs();
    await node.emitTriggerEvent(event("wh", "raw-text"), outputs);
    expect(emitted.get("body")).toBe("raw-text");
    expect(emitted.get("event_type")).toBe("webhook");
    expect(typeof emitted.get("timestamp")).toBe("string");
  });
});

describe("IntervalTriggerNode.emitTriggerEvent", () => {
  it("uses the synthesized tick payload when present", async () => {
    const node = new IntervalTriggerNode({ interval_seconds: 5 });
    const { outputs, emitted } = collectOutputs();
    await node.emitTriggerEvent(
      event("iv", {
        tick: 7,
        elapsed_seconds: 35,
        interval_seconds: 5,
        timestamp: "2026-07-26T01:00:00Z"
      }),
      outputs
    );
    expect(emitted.get("tick")).toBe(7);
    expect(emitted.get("elapsed_seconds")).toBe(35);
    expect(emitted.get("interval_seconds")).toBe(5);
    expect(emitted.get("timestamp")).toBe("2026-07-26T01:00:00Z");
    expect(emitted.get("source")).toBe("interval");
    expect(emitted.get("event_type")).toBe("tick");
  });

  it("synthesizes tick/timestamp for an empty payload", async () => {
    const node = new IntervalTriggerNode({ interval_seconds: 60 });
    const { outputs, emitted } = collectOutputs();
    await node.emitTriggerEvent(event("iv", {}), outputs);
    expect(emitted.get("tick")).toBe(1);
    expect(emitted.get("interval_seconds")).toBe(60);
    expect(typeof emitted.get("timestamp")).toBe("string");
    expect(emitted.get("event_type")).toBe("tick");
  });
});

describe("FileWatchTriggerNode.emitTriggerEvent", () => {
  it("maps event/path/dest_path/is_directory onto the declared slots", async () => {
    const node = new FileWatchTriggerNode({});
    const { outputs, emitted } = collectOutputs();
    await node.emitTriggerEvent(
      event("fw", {
        event: "created",
        path: "/tmp/watched/a.txt",
        dest_path: "",
        is_directory: false,
        timestamp: "2026-07-26T02:00:00Z"
      }),
      outputs
    );
    expect(emitted.get("event")).toBe("created");
    expect(emitted.get("path")).toBe("/tmp/watched/a.txt");
    expect(emitted.get("dest_path")).toBe("");
    expect(emitted.get("is_directory")).toBe(false);
    expect(emitted.get("timestamp")).toBe("2026-07-26T02:00:00Z");
  });
});

describe("ManualTriggerNode.emitTriggerEvent", () => {
  it("maps an envelope payload onto data/timestamp/source/event_type", async () => {
    const node = new ManualTriggerNode({ name: "my_trigger" });
    const { outputs, emitted } = collectOutputs();
    await node.emitTriggerEvent(
      event("mt", {
        data: { x: 1 },
        timestamp: "2026-07-26T03:00:00Z",
        source: "api"
      }),
      outputs
    );
    expect(emitted.get("data")).toEqual({ x: 1 });
    expect(emitted.get("timestamp")).toBe("2026-07-26T03:00:00Z");
    expect(emitted.get("source")).toBe("api");
    expect(emitted.get("event_type")).toBe("manual");
  });

  it("emits a bare payload as data with synthesized metadata", async () => {
    const node = new ManualTriggerNode({});
    const { outputs, emitted } = collectOutputs();
    await node.emitTriggerEvent(event("mt", "just a string"), outputs);
    expect(emitted.get("data")).toBe("just a string");
    expect(emitted.get("source")).toBe("manual_trigger");
    expect(emitted.get("event_type")).toBe("manual");
    expect(typeof emitted.get("timestamp")).toBe("string");
  });
});

describe("emitTriggerEvent emits only declared output slots", () => {
  const cases = [
    {
      cls: WebhookTriggerNode,
      make: () => new WebhookTriggerNode({}),
      payload: { body: 1, bogus_slot: true }
    },
    {
      cls: IntervalTriggerNode,
      make: () => new IntervalTriggerNode({}),
      payload: { tick: 1, bogus_slot: true }
    },
    {
      cls: FileWatchTriggerNode,
      make: () => new FileWatchTriggerNode({}),
      payload: { event: "created", path: "/x", bogus_slot: true }
    },
    {
      cls: ManualTriggerNode,
      make: () => new ManualTriggerNode({}),
      payload: { data: 1, bogus_slot: true }
    }
  ] as const;

  for (const { cls, make, payload } of cases) {
    it(cls.nodeType, async () => {
      const { outputs, emitted } = collectOutputs();
      await make().emitTriggerEvent(event("n", payload), outputs);
      const declared = Object.keys(cls.metadataOutputTypes ?? {});
      for (const slot of emitted.keys()) {
        expect(
          declared,
          `${cls.nodeType} emitted undeclared slot "${slot}"`
        ).toContain(slot);
      }
      expect(emitted.has("bogus_slot")).toBe(false);
    });
  }
});
