import { describe, expect, it } from "vitest";
import { resolveResourceId } from "../src/index.js";

describe("resource ID resolution", () => {
  it("keeps named IDs exact and rejects ambiguous compact IDs", () => {
    const base = { user_id: "alice", created_at: "created", updated_at: "updated" };
    const first = { ...base, id: "123456789abc00000000000000000000" };
    const second = { ...base, id: "123456789abc11111111111111111111" };
    expect(resolveResourceId([first], "123456789abc")).toBe(first);
    expect(resolveResourceId([first], "123456789ab")).toBeNull();
    expect(() => resolveResourceId([first, second], "123456789abc")).toThrow("ambiguous");
    const named = { ...base, id: "personal:alice" };
    expect(resolveResourceId([named], "personal:alice")).toBe(named);
    expect(resolveResourceId([named], "personal:ali")).toBeNull();
  });
  it("resolves compact IDs across a large authorized resource list", () => {
    const records = Array.from({ length: 25_000 }, (_, index) => ({
      id: index.toString(16).padStart(12, "0") + "f".repeat(20),
      user_id: "alice", created_at: "created", updated_at: "updated"
    }));
    const target = records[24_999];
    if (!target) { throw new Error("Missing test fixture"); }
    expect(resolveResourceId(records, target.id.slice(0, 12))).toBe(target);
  });

});
