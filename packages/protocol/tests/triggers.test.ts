import { describe, it, expect } from "vitest";
import {
  TRIGGER_KIND_BY_NODE_TYPE,
  TRIGGER_NODE_TYPES,
  TRIGGER_MAX_CONSECUTIVE_FAILURES,
  describeTriggerDisabledReason,
  isTriggerNodeType
} from "../src/triggers.js";

describe("isTriggerNodeType", () => {
  it("recognizes every known trigger node type", () => {
    for (const type of TRIGGER_NODE_TYPES) {
      expect(isTriggerNodeType(type)).toBe(true);
    }
  });

  it("rejects a non-trigger node type", () => {
    expect(isTriggerNodeType("nodetool.text.Concat")).toBe(false);
  });

  it("rejects null and undefined", () => {
    expect(isTriggerNodeType(null)).toBe(false);
    expect(isTriggerNodeType(undefined)).toBe(false);
  });

  it("rejects Wait, which is a trigger node that registers nothing", () => {
    expect(isTriggerNodeType("nodetool.triggers.Wait")).toBe(false);
  });
});

describe("TRIGGER_KIND_BY_NODE_TYPE", () => {
  it("maps every node type in TRIGGER_NODE_TYPES to a kind", () => {
    for (const type of TRIGGER_NODE_TYPES) {
      expect(TRIGGER_KIND_BY_NODE_TYPE[type]).toBeDefined();
    }
  });

  it("maps the webhook trigger to the webhook kind", () => {
    expect(TRIGGER_KIND_BY_NODE_TYPE["nodetool.triggers.WebhookTrigger"]).toBe(
      "webhook"
    );
  });
});

describe("describeTriggerDisabledReason", () => {
  it("counts the failures that stopped it", () => {
    expect(describeTriggerDisabledReason("failures", 5)).toBe(
      "Disabled after 5 consecutive failures."
    );
  });

  it("falls back to the threshold when the count is missing", () => {
    expect(describeTriggerDisabledReason("failures")).toContain(
      String(TRIGGER_MAX_CONSECUTIVE_FAILURES)
    );
  });

  it("names the other automatic stops", () => {
    expect(describeTriggerDisabledReason("expired")).toMatch(/expiry/i);
    expect(describeTriggerDisabledReason("max_runs")).toMatch(/run limit/i);
  });

  it("says nothing about a stop the user made themselves", () => {
    expect(describeTriggerDisabledReason(null)).toBeNull();
    expect(describeTriggerDisabledReason(undefined)).toBeNull();
  });
});
