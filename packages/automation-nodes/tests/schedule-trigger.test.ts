/**
 * ScheduleTriggerNode: validation of the cron expression and timezone, and
 * the editor run that waits for each calendar slot.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { NodeRegistry } from "@nodetool-ai/node-sdk";
import { ScheduleTriggerNode } from "@nodetool-ai/automation-nodes";

afterEach(() => {
  vi.useRealTimers();
});

describe("ScheduleTriggerNode.validateProperties", () => {
  const issuesFor = (properties: Record<string, unknown>, connected: string[] = []) =>
    ScheduleTriggerNode.validateProperties(properties, {
      nodeId: "sc",
      connectedHandles: connected
    });

  it("accepts the defaults and a typical expression", () => {
    expect(issuesFor({})).toEqual([]);
    expect(
      issuesFor({ cron_expr: "0 8 * * 1-5", cron_tz: "Europe/Berlin" })
    ).toEqual([]);
  });

  it("rejects a malformed expression on the cron_expr property", () => {
    const issues = issuesFor({ cron_expr: "0 8 * *" });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      nodeId: "sc",
      nodeType: "nodetool.triggers.ScheduleTrigger",
      property: "cron_expr",
      code: "invalid_value"
    });
    expect(issues[0].message).toContain("4 fields");
  });

  it("rejects an out-of-range field", () => {
    const issues = issuesFor({ cron_expr: "61 8 * * *" });
    expect(issues.map((i) => i.property)).toEqual(["cron_expr"]);
  });

  it("rejects an empty expression instead of falling back to the default", () => {
    expect(issuesFor({ cron_expr: "" }).map((i) => i.property)).toEqual([
      "cron_expr"
    ]);
  });

  it("rejects an unknown timezone on the cron_tz property", () => {
    const issues = issuesFor({ cron_tz: "Mars/Base" });
    expect(issues).toHaveLength(1);
    expect(issues[0].property).toBe("cron_tz");
    expect(issues[0].message).toContain("Mars/Base");
  });

  it("reports both problems at once", () => {
    const issues = issuesFor({ cron_expr: "nope", cron_tz: "Mars/Base" });
    expect(issues.map((i) => i.property).sort()).toEqual([
      "cron_expr",
      "cron_tz"
    ]);
  });

  it("skips a property that an edge supplies at run time", () => {
    expect(issuesFor({ cron_expr: "bad" }, ["cron_expr"])).toEqual([]);
  });
});

describe("graph validation of a Schedule Trigger node", () => {
  it("reports a bad expression through the registry, the path validate and the pre-run check use", () => {
    const registry = new NodeRegistry();
    registry.register(ScheduleTriggerNode);
    const issues = registry.validateNode({
      id: "sc",
      type: "nodetool.triggers.ScheduleTrigger",
      properties: { cron_expr: "0 8 * *", cron_tz: "Europe/Berlin" }
    });
    expect(issues.map((i) => [i.nodeId, i.property, i.code])).toEqual([
      ["sc", "cron_expr", "invalid_value"]
    ]);
    expect(
      registry.validateNode({
        id: "sc",
        type: "nodetool.triggers.ScheduleTrigger",
        properties: { cron_expr: "0 8 * * 1-5", cron_tz: "Europe/Berlin" }
      })
    ).toEqual([]);
  });
});

describe("ScheduleTriggerNode.genProcess (editor run)", () => {
  it("waits for the next slot in the timezone, then emits one event for it", async () => {
    vi.useFakeTimers();
    // 2026-11-25 12:00Z is Wednesday 13:00 in Berlin. Next 08:00 is Thursday.
    vi.setSystemTime(new Date("2026-11-25T12:00:00Z"));
    const node = new ScheduleTriggerNode({
      cron_expr: "0 8 * * 1-5",
      cron_tz: "Europe/Berlin",
      max_events: 1
    });

    const events: Array<Record<string, unknown>> = [];
    const done = (async () => {
      for await (const event of node.genProcess()) events.push(event);
    })();

    await vi.advanceTimersByTimeAsync(18 * 3600_000);
    expect(events).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1 * 3600_000);
    await done;

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      scheduled_at: "2026-11-26T07:00:00.000Z",
      source: "cron",
      event_type: "tick"
    });
  });

  it("emits each slot once and stops at max_events", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:30Z"));
    const node = new ScheduleTriggerNode({
      cron_expr: "* * * * *",
      cron_tz: "UTC",
      max_events: 3
    });
    const slots: string[] = [];
    const done = (async () => {
      for await (const event of node.genProcess()) {
        slots.push(event.scheduled_at);
      }
    })();
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    await done;
    expect(slots).toEqual([
      "2026-01-01T00:01:00.000Z",
      "2026-01-01T00:02:00.000Z",
      "2026-01-01T00:03:00.000Z"
    ]);
  });

  it("waits across a gap longer than the timer limit", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-02T00:00:00Z"));
    // Next Feb 29 is in 2028, far beyond setTimeout's 24.8 day ceiling.
    const node = new ScheduleTriggerNode({
      cron_expr: "0 0 29 2 *",
      cron_tz: "UTC",
      max_events: 1
    });
    const events: Array<Record<string, unknown>> = [];
    const done = (async () => {
      for await (const event of node.genProcess()) events.push(event);
    })();
    await vi.advanceTimersByTimeAsync(800 * 24 * 3600_000);
    await done;
    expect(events[0].scheduled_at).toBe("2028-02-29T00:00:00.000Z");
  });

  it("throws the validation message for an invalid expression", async () => {
    const node = new ScheduleTriggerNode({ cron_expr: "every day" });
    await expect(node.genProcess().next()).rejects.toThrow(/fields/);
  });

  it("throws for an unknown timezone", async () => {
    const node = new ScheduleTriggerNode({ cron_tz: "Mars/Base" });
    await expect(node.genProcess().next()).rejects.toThrow(/Mars\/Base/);
  });
});
