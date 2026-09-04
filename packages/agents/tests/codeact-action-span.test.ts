/**
 * Every `execute_code` action is one `agent.action` span under the step's
 * `agent.step` span, carrying what an analyzer needs to read a run: code
 * length, duration, bridged tool-call count, outcome, and whether the
 * observation was cut.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  initTelemetry,
  shutdownTelemetry,
  type BaseProvider,
  type ProviderStreamItem,
  type ToolCall,
  type TraceRecord
} from "@nodetool-ai/runtime";
import { CodeActExecutor } from "../src/codeact/codeact-executor.js";
import { Tool } from "../src/tools/base-tool.js";
import type { Step, Task } from "../src/types.js";
import { createMockContext } from "./_helpers/mock-context.js";

class AddTool extends Tool {
  readonly name = "add";
  readonly description = "Add two numbers.";
  protected override readonly jsonSchema = {
    type: "object",
    properties: { a: { type: "number" }, b: { type: "number" } },
    required: ["a", "b"]
  };
  async process(
    _context: unknown,
    params: Record<string, unknown>
  ): Promise<unknown> {
    return { sum: Number(params["a"]) + Number(params["b"]) };
  }
}

function createLoopProvider(turns: ToolCall[][]): BaseProvider {
  return {
    provider: "fake",
    hasToolSupport: async () => true,
    async *generateLoop(args: {
      tools?: Array<{
        name: string;
        execute?: (a: Record<string, unknown>) => Promise<unknown>;
      }>;
    }): AsyncGenerator<ProviderStreamItem> {
      const toolMap = new Map((args.tools ?? []).map((t) => [t.name, t]));
      for (const turn of turns) {
        for (const tc of turn) {
          yield tc;
          const tool = toolMap.get(tc.name);
          const content = tool?.execute ? await tool.execute(tc.args) : "";
          yield {
            type: "message",
            message: {
              role: "tool",
              toolCallId: tc.id,
              content:
                typeof content === "string" ? content : JSON.stringify(content)
            }
          };
        }
      }
      yield { type: "chunk", content: "", done: true };
    }
  } as unknown as BaseProvider;
}

let traceDir: string;
let traceFile: string;

beforeAll(async () => {
  traceDir = await mkdtemp(join(tmpdir(), "nodetool-action-span-"));
  traceFile = join(traceDir, "trace.jsonl");
  await initTelemetry({ traceFile, silent: true });
}, 30_000);

afterAll(async () => {
  await shutdownTelemetry();
  await rm(traceDir, { recursive: true, force: true });
}, 30_000);

async function readRecords(): Promise<TraceRecord[]> {
  const deadline = Date.now() + 3000;
  for (;;) {
    let records: TraceRecord[] = [];
    try {
      records = (await readFile(traceFile, "utf8"))
        .split("\n")
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line) as TraceRecord);
    } catch {
      // Not written yet; poll again below.
    }
    if (records.some((r) => r.name === "agent.step") || Date.now() > deadline) {
      return records;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

describe("agent.action span", () => {
  it("wraps each action with code length, duration, tool calls and outcome", async () => {
    const step: Step = {
      id: "step_1",
      instructions: "Compute",
      completed: false,
      dependsOn: [],
      logs: [],
      outputSchema: JSON.stringify({
        type: "object",
        properties: { answer: { type: "number" } },
        required: ["answer"]
      })
    };
    const task: Task = { id: "task_1", title: "T", steps: [step] };
    const crash = `throw new Error("boom");`;
    const ok =
      `import { add } from "@nodetool-ai/sandbox-nodetool/session";\n` +
      `const r = await add({a: 1, b: 2});\nawait finish({answer: r.sum});`;
    const provider = createLoopProvider([
      [{ id: "tc_1", name: "execute_code", args: { code: crash } }],
      [{ id: "tc_2", name: "execute_code", args: { code: ok } }]
    ]);
    const executor = new CodeActExecutor({
      task,
      step,
      context: createMockContext() as never,
      provider,
      model: "m",
      tools: [new AddTool()]
    });
    for await (const msg of executor.execute()) void msg;
    expect(step.completed).toBe(true);

    const records = await readRecords();
    const stepSpan = records.find((r) => r.name === "agent.step");
    expect(stepSpan).toBeDefined();
    const actions = records
      .filter((r) => r.name === "agent.action")
      .sort(
        (a, b) =>
          Number(a.attributes["agent.action.index"]) -
          Number(b.attributes["agent.action.index"])
      );
    expect(actions).toHaveLength(2);
    for (const action of actions) {
      expect(action.parent_span_id).toBe(stepSpan?.span_id);
      expect(typeof action.attributes["agent.action.duration_ms"]).toBe("number");
      expect(action.attributes["agent.action.truncated"]).toBe(false);
    }
    expect(actions[0].attributes).toMatchObject({
      "agent.action.code_length": crash.length,
      "agent.action.tool_calls": 0,
      "agent.action.ok": false
    });
    expect(String(actions[0].attributes["agent.action.error"])).toContain("boom");
    expect(actions[1].attributes).toMatchObject({
      "agent.action.code_length": ok.length,
      "agent.action.tool_calls": 1,
      "agent.action.ok": true
    });
    expect(actions[1].attributes["agent.action.error"]).toBeUndefined();
    // One span per action: nothing per bridged call.
    expect(records.filter((r) => r.name.startsWith("agent.action."))).toHaveLength(0);
  }, 30_000);
});
