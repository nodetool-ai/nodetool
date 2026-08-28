/**
 * The transcript capture the whole optimization loop rests on.
 *
 * `runToolLoop` used to drain `generateLoop`'s stream and discard every
 * `ProviderMessageEvent`, which left callers able to see which tools ran but
 * never what the model was told or what it said. These tests pin the fix, and
 * the last one proves the check can fail: a provider that emits no message
 * events yields a transcript with only the seeded prompt pair, so a regression
 * that stops reading the stream shows up as a missing assistant turn rather
 * than as a silently empty field.
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { BaseProvider } from "@nodetool-ai/runtime";
import { runToolLoop } from "../src/app-build/tool-loop.js";
import { runJob } from "../src/jtbd/run.js";
import { defineJob } from "../src/jtbd/run.js";

interface ScriptStep {
  say?: string;
  call?: { name: string; args: Record<string, unknown> };
}

/**
 * Replays a script, emitting the `ProviderMessageEvent`s a real provider emits
 * for each finalized message — an assistant turn per step, a tool message per
 * result.
 */
function scriptedProvider(script: ScriptStep[], emitMessages = true): BaseProvider {
  return {
    provider: "scripted",
    hasToolSupport: async () => true,
    getTotalCost: () => 0,
    async *generateLoop(args: {
      tools?: { name: string; execute?: (a: Record<string, unknown>, id: string) => Promise<string> }[];
      signal?: AbortSignal;
    }) {
      const tools = new Map((args.tools ?? []).map((t) => [t.name, t]));
      let seq = 0;
      for (const step of script) {
        if (args.signal?.aborted) break;
        if (step.say !== undefined && emitMessages) {
          yield { type: "message", message: { role: "assistant", content: step.say } };
        }
        if (step.call === undefined) continue;
        const id = `call_${++seq}`;
        yield { id, name: step.call.name, args: step.call.args };
        const result = await tools.get(step.call.name)?.execute?.(step.call.args, id);
        if (emitMessages) {
          yield {
            type: "message",
            message: { role: "tool", content: result ?? "", toolCallId: id }
          };
        }
      }
      yield { type: "chunk", content: "", done: true };
    }
  } as unknown as BaseProvider;
}

const echoTool = {
  name: "echo",
  description: "echo back",
  parameters: z.object({ text: z.string() }),
  execute: async (args: Record<string, unknown>) => `echoed:${String(args.text)}`
};

describe("runToolLoop transcript", () => {
  it("keeps the system prompt and the opening user message", async () => {
    const run = await runToolLoop({
      provider: scriptedProvider([]),
      model: "m",
      tools: [echoTool],
      systemPrompt: "SYSTEM UNDER TEST",
      userPrompt: "the objective"
    });
    expect(run.transcript[0]).toEqual({
      role: "system",
      content: "SYSTEM UNDER TEST"
    });
    expect(run.transcript[1]).toEqual({ role: "user", content: "the objective" });
  });

  it("keeps what the model said between tool calls", async () => {
    const run = await runToolLoop({
      provider: scriptedProvider([
        { say: "I will echo first.", call: { name: "echo", args: { text: "hi" } } },
        { say: "Done." }
      ]),
      model: "m",
      tools: [echoTool],
      systemPrompt: "s",
      userPrompt: "u"
    });
    const said = run.transcript
      .filter((m) => m.role === "assistant")
      .map((m) => m.content);
    expect(said).toEqual(["I will echo first.", "Done."]);
  });

  it("keeps the tool results the model was fed back", async () => {
    const run = await runToolLoop({
      provider: scriptedProvider([
        { call: { name: "echo", args: { text: "hi" } } }
      ]),
      model: "m",
      tools: [echoTool],
      systemPrompt: "s",
      userPrompt: "u"
    });
    expect(run.transcript.some((m) => m.role === "tool" && m.content === "echoed:hi")).toBe(true);
  });

  it("orders and times every call", async () => {
    const run = await runToolLoop({
      provider: scriptedProvider([
        { call: { name: "echo", args: { text: "a" } } },
        { call: { name: "echo", args: { text: "b" } } }
      ]),
      model: "m",
      tools: [echoTool],
      systemPrompt: "s",
      userPrompt: "u"
    });
    expect(run.calls.map((c) => c.index)).toEqual([0, 1]);
    for (const call of run.calls) {
      expect(call.durationMs).toBeGreaterThanOrEqual(0);
    }
  });

  it("records only the seeded pair when the provider emits no messages", async () => {
    // The inverted case: this is what a regression that stops reading the
    // stream looks like, and it must be distinguishable from a real run.
    const run = await runToolLoop({
      provider: scriptedProvider([{ say: "silent", call: { name: "echo", args: { text: "x" } } }], false),
      model: "m",
      tools: [echoTool],
      systemPrompt: "s",
      userPrompt: "u"
    });
    expect(run.transcript).toHaveLength(2);
    expect(run.calls).toHaveLength(1);
  });
});

describe("runJob", () => {
  const job = defineJob<{ echoed: string[] }>({
    id: "echo-job",
    statement: "When I say a thing, I want it echoed, so I can prove the loop runs.",
    surfaces: [],
    difficulty: "smoke",
    objective: "echo the word hello",
    expectedToolCalls: 1,
    createBridge: () => {
      const echoed: string[] = [];
      return {
        tools: [
          {
            name: "echo",
            description: "echo back",
            parameters: z.object({ text: z.string() }),
            execute: async (args: Record<string, unknown>) => {
              echoed.push(String(args.text));
              return "ok";
            }
          }
        ],
        finalState: () => ({ echoed })
      };
    },
    outcomes: [
      {
        name: "echoed-hello",
        describe: "The word hello came back.",
        test: (s) => s.echoed.includes("hello")
      }
    ]
  });

  it("reports an achieved job with its transcript and no friction", async () => {
    const report = await runJob(job, {
      provider: scriptedProvider([
        { say: "echoing", call: { name: "echo", args: { text: "hello" } } }
      ]),
      model: "m"
    });
    expect(report.achieved).toBe(true);
    expect(report.outcomes).toEqual([
      { name: "echoed-hello", describe: "The word hello came back.", passed: true }
    ]);
    expect(report.transcript.some((m) => m.content === "echoing")).toBe(true);
    expect(report.friction).toEqual([]);
  });

  it("reports a missed job and blames the prompt when nothing was called", async () => {
    const report = await runJob(job, {
      provider: scriptedProvider([]),
      model: "m"
    });
    expect(report.achieved).toBe(false);
    expect(report.friction.map((f) => f.kind)).toContain("no-tool-calls");
    expect(report.friction[0]?.owner).toBe("prompt");
  });

  it("flags an over-budget run that still got the job done", async () => {
    const report = await runJob(job, {
      provider: scriptedProvider([
        { call: { name: "echo", args: { text: "wrong" } } },
        { call: { name: "echo", args: { text: "also wrong" } } },
        { call: { name: "echo", args: { text: "hello" } } }
      ]),
      model: "m"
    });
    expect(report.achieved).toBe(true);
    expect(report.friction.map((f) => f.kind)).toContain("over-budget");
  });

  it("skips a job needing model providers when none are configured", async () => {
    const needsProviders = defineJob({
      ...{ ...job, id: "needs" },
      needsModelProviders: true,
      createBridge: () => ({ tools: [], finalState: () => ({ echoed: [] }) }),
      outcomes: [{ name: "n", describe: "d", test: () => true }]
    });
    const report = await runJob(needsProviders, {
      provider: scriptedProvider([]),
      model: "m"
    });
    expect(report.skipped).toBe(true);
    expect(report.achieved).toBe(false);
  });
});
