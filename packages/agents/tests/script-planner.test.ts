/**
 * ScriptPlanner — the LLM authors an orchestration script through the
 * `submit_script` tool; invalid submissions round-trip as validation errors.
 */
import { describe, it, expect } from "vitest";
import { ScriptPlanner, validateScript } from "../src/script-planner.js";
import type {
  BaseProvider,
  ProviderStreamItem,
  ToolCall
} from "@nodetool-ai/runtime";
import type { ProcessingMessage } from "@nodetool-ai/protocol";
import { createMockContext } from "./_helpers/mock-context.js";

const VALID_SCRIPT = `const a = await agent("do the thing");
return a;`;

/** Provider that replays scripted submit_script calls through the tool loop. */
function createPlannerProvider(scripts: string[]): BaseProvider {
  return {
    provider: "planner",
    hasToolSupport: async () => true,
    async *generateLoop(args: {
      tools?: Array<{
        name: string;
        execute?: (a: Record<string, unknown>) => Promise<string>;
      }>;
      signal?: AbortSignal;
    }): AsyncGenerator<ProviderStreamItem> {
      const submit = args.tools?.find((t) => t.name === "submit_script");
      for (const [i, script] of scripts.entries()) {
        if (args.signal?.aborted) break;
        const tc: ToolCall = {
          id: `tc_${i}`,
          name: "submit_script",
          args: { script }
        };
        yield tc;
        const content = (await submit?.execute?.(tc.args as never)) ?? "";
        yield {
          type: "message",
          message: { role: "tool", toolCallId: tc.id, content }
        };
        if (args.signal?.aborted) break;
      }
      yield { type: "chunk", content: "", done: true };
    }
  } as unknown as BaseProvider;
}

async function plan(
  planner: ScriptPlanner
): Promise<{ script: string | null; messages: ProcessingMessage[] }> {
  const messages: ProcessingMessage[] = [];
  const gen = planner.plan("test objective", createMockContext());
  let next = await gen.next();
  while (!next.done) {
    messages.push(next.value);
    next = await gen.next();
  }
  return { script: next.value, messages };
}

describe("validateScript", () => {
  it("accepts a well-formed script", () => {
    expect(validateScript(VALID_SCRIPT)).toEqual([]);
  });

  it("rejects empty scripts, missing agent() calls, missing return, and syntax errors", () => {
    expect(validateScript("")).toContain("Script is empty.");
    expect(validateScript("return 1;").join(" ")).toMatch(/never calls agent/);
    expect(validateScript(`await agent("x");`).join(" ")).toMatch(
      /no return statement/
    );
    expect(
      validateScript(`const a = await agent("x"; return a;`).join(" ")
    ).toMatch(/Syntax error/);
  });
});

describe("ScriptPlanner", () => {
  it("returns the script accepted via submit_script", async () => {
    const planner = new ScriptPlanner({
      provider: createPlannerProvider([VALID_SCRIPT]),
      model: "test"
    });

    const { script, messages } = await plan(planner);

    expect(script).toBe(VALID_SCRIPT);
    expect(
      messages.some(
        (m) =>
          m.type === "planning_update" &&
          m.phase === "complete" &&
          m.status === "success"
      )
    ).toBe(true);
  });

  it("feeds validation errors back and accepts a later fixed submission", async () => {
    const planner = new ScriptPlanner({
      provider: createPlannerProvider(["return 1;", VALID_SCRIPT]),
      model: "test"
    });

    const { script, messages } = await plan(planner);

    expect(script).toBe(VALID_SCRIPT);
    expect(
      messages.some(
        (m) =>
          m.type === "planning_update" &&
          m.phase === "validation" &&
          m.status === "failed"
      )
    ).toBe(true);
  });

  it("returns null when no valid script is produced", async () => {
    const planner = new ScriptPlanner({
      provider: createPlannerProvider(["return 1;"]),
      model: "test"
    });

    const { script, messages } = await plan(planner);

    expect(script).toBeNull();
    expect(
      messages.some(
        (m) =>
          m.type === "planning_update" &&
          m.phase === "complete" &&
          m.status === "failed"
      )
    ).toBe(true);
  });
});
