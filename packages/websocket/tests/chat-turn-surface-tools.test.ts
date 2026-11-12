/**
 * The native timeline editor's assistant (`ui_context.source:
 * "timeline_assistant"`) gets only the server tools `surfaceServerTools`
 * names. It edits and renders in C++, so the media and render tools stay out
 * of its belt and its tool router.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { initTestDb } from "@nodetool-ai/models";
import {
  fakeProvider,
  makeChatTurnHarness,
  type GenerateLoopArgs
} from "./chat-turn-test-harness.js";

interface Observed {
  offered: string[];
  results: Record<string, string>;
}

async function runTurn(source: string | null): Promise<Observed> {
  const observed: Observed = { offered: [], results: {} };
  const harness = makeChatTurnHarness({
    session: {
      resolveProvider: async () =>
        fakeProvider({
          generateLoop: async function* (args: GenerateLoopArgs) {
            const tools = (args as { tools?: Array<{ name: string }> }).tools ?? [];
            observed.offered = tools.map((tool) => tool.name);
            // An ordinary chat would stop on an approval prompt here.
            for (const name of source ? ["render_timeline", "run_node", "list_threads"] : []) {
              const result = await args.executeTool?.({ id: name, name, args: {} });
              observed.results[name] = typeof result === "string" ? result : JSON.stringify(result);
            }
            yield { type: "chunk", content: "done", done: true };
          }
        })
    }
  });
  await harness.handler.handleChatMessage({
    thread_id: `surface-${source ?? "none"}`,
    content: "hi",
    provider: "mock",
    model: "m",
    ...(source
      ? { ui_context: { source, focused: { type: "timeline", id: "0123456789abcdef0123456789abcdef" } } }
      : {})
  });
  return observed;
}

describe("chat turn surface tools", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("keeps media and render tools away from the timeline assistant", async () => {
    const { offered, results } = await runTurn("timeline_assistant");
    expect(offered.length).toBeGreaterThan(0);
    expect(results.render_timeline).toMatch(/not available|unknown|not found|no tool/i);
    expect(results.run_node).toMatch(/not available|unknown|not found|no tool/i);
    expect(results.list_threads).not.toMatch(/not available in this assistant/);
  });

  it("leaves an ordinary chat's tools as they were", async () => {
    const { offered } = await runTurn(null);
    expect(offered).toContain("execute_code");
    expect(offered.length).toBeGreaterThan((await runTurn("timeline_assistant")).offered.length);
  });
});
