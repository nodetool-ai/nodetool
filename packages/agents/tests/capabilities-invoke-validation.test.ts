/**
 * Zod validation on the `invoke` path.
 *
 * A capability that declares `zodSchema` is validated once, in the dispatcher,
 * so guest code and `run.invoke` get the same `invalid_tool_arguments` envelope
 * the `Tool` path returns. Before this, `gatedCall` called the implementation
 * with whatever it was handed and only the `Tool` wrapper parsed, so the same
 * bad call answered differently depending on which door it came through.
 */

import { describe, expect, it } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { UNGATED, createCapabilityRun } from "../src/capabilities/invoke.js";

const ctx = { userId: "user-invoke-validation" } as unknown as ProcessingContext;

function run() {
  return createCapabilityRun({ context: ctx, gate: UNGATED });
}

describe("invoke validates against the spec's zodSchema", () => {
  it("refuses get_setting when `key` is not a string", async () => {
    const result = (await run().invoke("get_setting", {
      key: { nested: true }
    })) as Record<string, unknown>;

    expect(result["error"]).toBe("invalid_tool_arguments");
    expect(result["message"]).toContain("get_setting");
    expect(result["issues"]).toEqual(
      expect.arrayContaining([expect.stringContaining("key")])
    );
  });

  it("refuses get_setting when `key` is missing", async () => {
    const result = (await run().invoke("get_setting", {})) as Record<
      string,
      unknown
    >;

    expect(result["error"]).toBe("invalid_tool_arguments");
  });

  it("lets a valid call through to the implementation", async () => {
    const result = (await run().invoke("get_setting", {
      key: "NOT_A_DECLARED_SETTING"
    })) as Record<string, unknown>;

    expect(result["error"]).not.toBe("invalid_tool_arguments");
    expect(result["error_kind"]).toBe("unknown_setting");
  });
});
