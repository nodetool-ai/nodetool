/**
 * What `generateLoop` does to a tool call when the turn is aborted mid-flight.
 *
 * A superseding chat message aborts the running turn. These pin the two
 * regimes that follow, because they look identical afterwards — an assistant
 * message carrying a tool call, with or without its result — and the consumer
 * has to handle both:
 *
 *  - abort lands AFTER dispatch: the tool runs to completion (nothing cancels
 *    it mid-call) and its result is still yielded. A consumer that stops
 *    reading here loses a result for work that already happened.
 *  - abort lands BEFORE dispatch: the pre-dispatch signal check spares the
 *    tool, and no result is ever produced.
 */
import { describe, it, expect } from "vitest";
import { ScriptedProvider } from "../src/providers/scripted-provider.js";
import type { ProviderStreamItem, ProviderTool } from "../src/providers/types.js";

const TOOL: ProviderTool = {
  name: "mutating_tool",
  description: "",
  parameters: { type: "object", properties: {} }
};

interface RunOutcome {
  executed: string[];
  seen: Array<"assistant" | "tool">;
  droppedAfterAbort: Array<"assistant" | "tool">;
}

/**
 * Drive one turn, aborting at a chosen moment, and record what the tool did
 * and which messages arrived before and after the abort.
 *
 * `abortWhen: "mid-tool"` fires the signal while the tool is running.
 * `abortWhen: "on-assistant"` fires it synchronously as the consumer receives
 * the assistant message — before the loop can dispatch.
 */
async function runTurn(opts: {
  abortWhen: "mid-tool" | "on-assistant";
  sequentialTools: boolean;
}): Promise<RunOutcome> {
  const executed: string[] = [];
  const seen: RunOutcome["seen"] = [];
  const droppedAfterAbort: RunOutcome["droppedAfterAbort"] = [];

  const provider = new ScriptedProvider([
    () => [
      { type: "tool_call", name: TOOL.name, args: {}, id: "call_under_test" }
    ],
    () => [{ type: "chunk", content: "done", done: true }]
  ]);
  const controller = new AbortController();
  let aborted = false;
  const abort = () => {
    aborted = true;
    controller.abort();
  };

  const loop = provider.generateLoop({
    messages: [{ role: "user", content: "go" }],
    model: "test-model",
    tools: [TOOL],
    maxIterations: 5,
    ...(opts.sequentialTools ? { sequentialTools: true } : {}),
    signal: controller.signal,
    executeTool: async (tc) => {
      executed.push(tc.name);
      if (opts.abortWhen === "mid-tool") {
        // The abort arrives while the tool is still working.
        setTimeout(abort, 5);
        await new Promise((r) => setTimeout(r, 40));
      }
      return `{"ok":true}`;
    }
  });

  for await (const item of loop as AsyncGenerator<ProviderStreamItem>) {
    const message = (item as { type?: string; message?: { role?: string } })
      .message;
    const role = (item as { type?: string }).type === "message" && message?.role;
    if (role !== "assistant" && role !== "tool") continue;
    if (aborted) droppedAfterAbort.push(role);
    else seen.push(role);
    // The consumer stops reading the moment the turn is superseded, which is
    // what the runner used to do unconditionally.
    if (role === "assistant" && opts.abortWhen === "on-assistant") abort();
  }
  return { executed, seen, droppedAfterAbort };
}

describe("generateLoop: a tool call when the turn is aborted", () => {
  it.each([
    { label: "sequential", sequentialTools: true },
    { label: "parallel", sequentialTools: false }
  ])(
    "runs the tool to completion and still yields its result ($label)",
    async ({ sequentialTools }) => {
      const { executed, seen, droppedAfterAbort } = await runTurn({
        abortWhen: "mid-tool",
        sequentialTools
      });

      // Nothing cancels a tool that is already running.
      expect(executed).toEqual(["mutating_tool"]);
      // The assistant message arrived before the abort; the result after it.
      expect(seen).toEqual(["assistant"]);
      expect(droppedAfterAbort).toEqual(["tool"]);
    }
  );

  it.each([
    { label: "sequential", sequentialTools: true },
    { label: "parallel", sequentialTools: false }
  ])(
    "spares the tool when the abort lands before dispatch ($label)",
    async ({ sequentialTools }) => {
      const { executed, seen, droppedAfterAbort } = await runTurn({
        abortWhen: "on-assistant",
        sequentialTools
      });

      expect(executed).toEqual([]);
      expect(seen).toEqual(["assistant"]);
      expect(droppedAfterAbort).toEqual([]);
    }
  );

  it("leaves both regimes indistinguishable from the messages alone", async () => {
    const ran = await runTurn({ abortWhen: "mid-tool", sequentialTools: true });
    const spared = await runTurn({
      abortWhen: "on-assistant",
      sequentialTools: true
    });

    // The consumer sees exactly one assistant message and no result in both.
    // Only `executed` tells them apart, and the transcript does not record it —
    // which is why an abandoned call must never be reported as "did not run".
    expect(ran.seen).toEqual(spared.seen);
    expect(ran.executed).not.toEqual(spared.executed);
  });
});
