/**
 * Fine-tuning data is only as good as its filter: a record must be a run the
 * graders accepted, exactly as the model saw and produced it.
 */
import { describe, it, expect } from "vitest";
import { APP_TOOL_LOOP_CASES, TIMELINE_TOOL_LOOP_CASES } from "@nodetool-ai/agents";
import { foldOllamaStream } from "../src/finetune/ollama-capture.js";
import { foldOpenAIResponse, normalizeOpenAIMessage } from "../src/finetune/openai-capture.js";
import {
  exportSft,
  segmentEnds,
  splitCompactionRequests,
  traceSegments,
  traceToSft,
  traceToSftRecords,
  type ChatTrace
} from "../src/finetune/sft-export.js";
import { COMPACTION_SUMMARY_PROMPT } from "../src/session/chat-compaction.js";
import { toolLoopCaseJob } from "../src/finetune/tool-loop-jobs.js";

const call = (code: string) => ({
  role: "assistant",
  content: "",
  tool_calls: [{ function: { name: "execute_code", arguments: { title: "t", code } } }]
});

function trace(overrides: Partial<ChatTrace> = {}): ChatTrace {
  const first = call("await ui_svg_set_fill({id: 'c', fill: 'red'})");
  return {
    taskId: "svg-tools/recolor-and-save",
    objective: "Make the circle red.",
    model: "m",
    sample: 0,
    think: "false",
    achieved: true,
    completed: true,
    outcomes: [{ name: "red", passed: true }],
    toolCallCount: 1,
    durationMs: 1,
    replies: [
      { reply: { ...first, thinking: "plan" }, doneReason: "stop", promptTokens: 10, evalTokens: 5, status: 200, messageCount: 2 },
      { reply: { role: "assistant", content: "Done: the circle is red." }, doneReason: "stop", promptTokens: 20, evalTokens: 5, status: 200, messageCount: 4 }
    ],
    finalRequest: {
      messages: [
        { role: "system", content: "sys" },
        { role: "user", content: "Make the circle red." },
        first,
        { role: "tool", content: "{\"ok\":true}", tool_name: "execute_code" }
      ],
      tools: [{ type: "function", function: { name: "execute_code" } }]
    },
    ...overrides
  };
}

describe("ollama stream folding", () => {
  it("joins content, thinking and tool calls, and keeps the stop stats", () => {
    const text = [
      JSON.stringify({ message: { role: "assistant", content: "", thinking: "hm" } }),
      JSON.stringify({ message: { role: "assistant", content: "", tool_calls: [{ function: { name: "execute_code", arguments: {} } }] } }),
      JSON.stringify({ message: { role: "assistant", content: "ok" }, done: true, done_reason: "stop", prompt_eval_count: 900, eval_count: 12 })
    ].join("\n");
    const folded = foldOllamaStream(text);
    expect(folded.reply.content).toBe("ok");
    expect(folded.reply.thinking).toBe("hm");
    expect(folded.reply.tool_calls).toHaveLength(1);
    expect(folded).toMatchObject({ doneReason: "stop", promptTokens: 900, evalTokens: 12 });
  });
});

describe("openai-format capture", () => {
  it("assembles streamed tool-call deltas and keeps reasoning, usage and cost apart", () => {
    const sse = [
      { choices: [{ delta: { role: "assistant", reasoning: "plan " } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, id: "c1", function: { name: "execute_code", arguments: '{"code":' } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"1"}' } }] } }] },
      { choices: [{ delta: {}, finish_reason: "tool_calls" }], usage: { prompt_tokens: 900, completion_tokens: 12, cost: 0.0004 } }
    ]
      .map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`)
      .join("") + "data: [DONE]\n\n";
    const folded = foldOpenAIResponse(sse);
    expect(folded.reply.tool_calls).toEqual([{ function: { name: "execute_code", arguments: '{"code":"1"}' } }]);
    expect(folded.reply.thinking).toBe("plan ");
    expect(folded).toMatchObject({ doneReason: "tool_calls", promptTokens: 900, evalTokens: 12, costUsd: 0.0004 });
  });

  it("normalizes text parts and marks images", () => {
    expect(
      normalizeOpenAIMessage({
        role: "user",
        content: [
          { type: "text", text: "Make it red." },
          { type: "image_url", image_url: { url: "data:," } }
        ]
      })
    ).toEqual({ role: "user", content: "Make it red.", images: ["<image>"] });
  });

  it("feeds the same export: a teacher run becomes a record", () => {
    const record = traceToSft(
      trace({
        finalRequest: {
          messages: [
            normalizeOpenAIMessage({ role: "system", content: "sys" }),
            normalizeOpenAIMessage({ role: "user", content: "Make it red." }),
            normalizeOpenAIMessage({
              role: "assistant",
              content: "",
              tool_calls: [{ id: "c1", function: { name: "execute_code", arguments: '{"title":"t","code":"await ui_svg_set_fill({id: \'c\', fill: \'red\'})"}' } }]
            }),
            normalizeOpenAIMessage({ role: "tool", content: '{"ok":true}' })
          ],
          tools: []
        }
      })
    );
    if (typeof record === "string") throw new Error(record);
    expect(record.messages[3]?.name).toBe("execute_code");
  });
});

describe("sft export", () => {
  it("turns an achieved run into the final view plus the last reply, without thinking", () => {
    const record = traceToSft(trace());
    if (typeof record === "string") throw new Error(record);
    expect(record.messages.map((m) => m.role)).toEqual(["system", "user", "assistant", "tool", "assistant"]);
    expect(record.messages[2]?.tool_calls?.[0]?.function.name).toBe("execute_code");
    expect(record.messages[3]?.name).toBe("execute_code");
    expect(record.messages.at(-1)?.content).toBe("Done: the circle is red.");
    expect(JSON.stringify(record)).not.toContain("plan");
  });

  it("rejects a run the graders did not accept", () => {
    expect(traceToSft(trace({ achieved: false }))).toBe("not-achieved");
  });

  it("rejects an empty final reply", () => {
    const replies = trace().replies;
    replies[1] = { ...replies[1]!, reply: { role: "assistant", content: "  " } };
    expect(traceToSft(trace({ replies }))).toBe("empty-final-reply");
  });

  it("rejects a run whose history was rewritten before the last request", () => {
    const base = trace();
    const messages = [...base.finalRequest!.messages];
    messages[2] = call("compacted");
    expect(traceToSft(trace({ finalRequest: { ...base.finalRequest!, messages } }))).toBe("history-mismatch");
  });

  it("keeps a run with an image, with the image as a text placeholder", () => {
    const base = trace();
    const messages = [...base.finalRequest!.messages, { role: "user", content: "Preview", images: ["<image>"] }];
    const record = traceToSft(trace({ finalRequest: { ...base.finalRequest!, messages } }));
    if (typeof record === "string") throw new Error(record);
    expect(record.messages.find((m) => m.content.includes("Preview"))?.content).toBe("[image]\nPreview");
  });

  it("drops a second run that said the same thing", () => {
    const { records, summary } = exportSft([trace(), trace({ sample: 1 }), trace({ achieved: false })]);
    expect(records).toHaveLength(1);
    expect(summary.rejected).toEqual({ duplicate: 1, "not-achieved": 1 });
  });
});

describe("compacted runs", () => {
  const sys = { role: "system", content: "sys" };
  const user = { role: "user", content: "Make the circle red, then blue." };
  const red = call("await ui_svg_set_fill({id: 'c', fill: 'red'})");
  const blue = call("await ui_svg_set_fill({id: 'c', fill: 'blue'})");
  const ok = { role: "tool", content: "{\"ok\":true}" };
  const summary = { role: "user", content: "Summary: the circle was made red." };
  const done = { role: "assistant", content: "Done: the circle is blue." };
  // Request 2 replays request 1. Request 3 starts from a summary instead.
  const requests = [
    { messages: [sys, user], tools: [] },
    { messages: [sys, user, red, ok], tools: [] },
    { messages: [sys, summary, user, blue, ok], tools: [] }
  ];
  const reply = (message: object, promptTokens = 10) => ({
    reply: message as never, doneReason: "stop", promptTokens, evalTokens: 5, status: 200, messageCount: 0
  });
  const compacted = (overrides: Partial<ChatTrace> = {}): ChatTrace =>
    trace({
      replies: [reply(red), reply(blue), reply(done)],
      finalRequest: requests[2]!,
      segments: traceSegments(requests),
      ...overrides
    });

  it("marks the request after which the history was rewritten", () => {
    expect(segmentEnds(requests)).toEqual([1]);
    expect(segmentEnds(requests.slice(0, 2))).toEqual([]);
  });

  it("exports each stretch between compactions as its own record", () => {
    const records = traceToSftRecords(compacted());
    if (typeof records === "string") throw new Error(records);
    expect(records.map((r) => r.meta.segment)).toEqual([0, 1]);
    expect(records[0]!.messages.at(-1)?.tool_calls?.[0]?.function.arguments).toMatchObject({ code: expect.stringContaining("blue") });
    expect(records[1]!.messages.map((m) => m.content)).toContain("Summary: the circle was made red.");
    expect(records[1]!.messages.at(-1)?.content).toBe("Done: the circle is blue.");
  });

  it("keeps the compaction summarizer's request out of the run, and its cost in the budget", () => {
    const summarizer = {
      messages: [
        { role: "system", content: COMPACTION_SUMMARY_PROMPT },
        { role: "user", content: "Conversation to compact: ..." }
      ],
      tools: [],
      costUsd: 0.002
    };
    // o1/o3 on OpenRouter: the system message arrives as the first user message.
    const asUser = {
      messages: [{ role: "user", content: `Instructions: ${COMPACTION_SUMMARY_PROMPT}\n\nConversation to compact: ...` }],
      tools: [],
      costUsd: 0.001,
      status: 200
    };
    // The request the provider refused for length, which the turn retried after compacting.
    const refused = { ...requests[2]!, costUsd: 0, status: 400 };
    const ok = (r: { messages: unknown[]; tools: unknown[] }) => ({ ...r, status: 200 });
    const captured = [ok(requests[0]!), ok(requests[1]!), refused, { ...summarizer, status: 200 }, asUser, ok(requests[2]!)];
    const { chat, summaryCostUsd } = splitCompactionRequests(captured as never[]);
    expect((chat as Array<{ messages: unknown }>).map((r) => r.messages)).toEqual(requests.map((r) => r.messages));
    expect(summaryCostUsd).toBeCloseTo(0.003);
    expect(traceSegments(chat as never[]).map((segment) => segment.replyIndex)).toEqual([1]);
  });

  it("rejects a compacted run whose segments were not recorded", () => {
    expect(traceToSftRecords(compacted({ segments: undefined }))).toBe("history-mismatch");
  });

  it("counts records per stretch in the export summary", () => {
    const { records, summary } = exportSft([compacted()]);
    expect(records).toHaveLength(2);
    expect(summary).toMatchObject({ kept: 2, segmentedRuns: 1 });
  });
});

describe("tool-loop cases as jobs", () => {
  it("grades with the case's own checks", async () => {
    const testCase = TIMELINE_TOOL_LOOP_CASES.find((c) => c.id === "titles-with-motion");
    if (!testCase) throw new Error("case missing");
    const job = toolLoopCaseJob("timeline-tools", testCase, "timeline");
    expect(job.surfaces).toEqual(["timeline"]);
    const untouched = await job.start();
    expect(untouched.grade().every((o) => o.passed)).toBe(false);
  });

  it("does not let a call answered ok:false clear an earlier error", async () => {
    const testCase = APP_TOOL_LOOP_CASES.find((c) => c.id === "relabel-and-remove");
    if (!testCase) throw new Error("case missing");
    const world = await toolLoopCaseJob("app-tools", testCase, "app").start();
    const tool = Object.fromEntries(world.tools.map((t) => [t.name, t]));
    const app = { application_id: "app-1" };
    await tool["ui_app_update_component"]!.execute({ ...app, id: "btn-1", props: { label: "Submit" } });
    await tool["ui_app_remove_component"]!.execute({ ...app, id: "text-1" });
    await expect(tool["ui_app_remove_component"]!.execute({ ...app })).rejects.toThrow();
    const answered = (await tool["ui_app_remove_component"]!.execute({ ...app, id: "missing" })) as { ok?: boolean };
    expect(answered.ok).toBe(false);
    expect(world.grade().find((o) => o.name === "no-error-results")?.passed).toBe(false);
  });

  it("drops the eval's Objective label", () => {
    const testCase = TIMELINE_TOOL_LOOP_CASES.find((c) => c.id === "cut-and-trim");
    if (!testCase) throw new Error("case missing");
    expect(toolLoopCaseJob("timeline-tools", testCase).objective).not.toMatch(/^Objective:/);
  });
});
