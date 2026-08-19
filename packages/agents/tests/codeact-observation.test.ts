/**
 * What a code action hands back to the provider: pixels beside the
 * observation, a correlatable tool-call id for nested events, and assistant
 * text without its reasoning block. Real QuickJS sandbox, scripted provider.
 */
import { describe, it, expect } from "vitest";
import { CodeActExecutor } from "../src/codeact/codeact-executor.js";
import { Tool } from "../src/tools/base-tool.js";
import { TOOL_CALL_ID_FIELD } from "../src/tools/subtask-fields.js";
import type { Step, Task } from "../src/types.js";
import type {
  BaseProvider,
  MessageContent,
  ProcessingContext,
  ProviderStreamItem,
  ToolCall
} from "@nodetool-ai/runtime";
import { createMockContext } from "./_helpers/mock-context.js";

const PIXELS = "iVBORw0KGgoAAAANSUhEUg-not-really-a-png";

class PixelTool extends Tool {
  readonly name = "view_pixels";
  readonly description = "Return an image.";
  async process(): Promise<unknown> {
    return {
      asset_id: "a1",
      note: "Here is the asset.",
      image_content: { data: PIXELS, mimeType: "image/png" }
    };
  }
}

class IdRecordingTool extends Tool {
  readonly name = "run_subtask";
  readonly description = "Delegate work.";
  override readonly needsToolCallId = true;
  seen: unknown[] = [];
  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    this.seen.push(params[TOOL_CALL_ID_FIELD]);
    return { done: true };
  }
}

type ScriptTurn = { toolCalls: ToolCall[] } | { assistant: string };

/** Records what each `execute_code` call returned to the provider. */
function createRecordingProvider(turns: ScriptTurn[]): {
  provider: BaseProvider;
  results: Array<string | MessageContent[]>;
} {
  const results: Array<string | MessageContent[]> = [];
  const provider = {
    provider: "fake",
    hasToolSupport: async () => true,
    async *generateLoop(args: {
      tools?: Array<{
        name: string;
        execute?: (
          a: Record<string, unknown>
        ) => Promise<string | MessageContent[]>;
      }>;
      signal?: AbortSignal;
    }): AsyncGenerator<ProviderStreamItem> {
      const toolMap = new Map((args.tools ?? []).map((t) => [t.name, t]));
      for (const turn of turns) {
        if (args.signal?.aborted) break;
        if ("assistant" in turn) {
          yield {
            type: "message",
            message: { role: "assistant", content: turn.assistant }
          };
          continue;
        }
        for (const tc of turn.toolCalls) {
          if (args.signal?.aborted) break;
          yield tc;
          const tool = toolMap.get(tc.name);
          const content = tool?.execute ? await tool.execute(tc.args) : "";
          results.push(content);
          yield {
            type: "message",
            message: {
              role: "tool",
              toolCallId: tc.id,
              content: typeof content === "string" ? content : "[blocks]"
            }
          };
        }
      }
      yield { type: "chunk", content: "", done: true };
    }
  } as unknown as BaseProvider;
  return { provider, results };
}

function makeStep(outputSchema?: object): { step: Step; task: Task } {
  const step: Step = {
    id: "step_1",
    instructions: "Do the thing",
    completed: false,
    dependsOn: [],
    logs: [],
    outputSchema: outputSchema ? JSON.stringify(outputSchema) : undefined
  };
  return { step, task: { id: "task_1", title: "T", steps: [step] } };
}

const ANSWER_SCHEMA = {
  type: "object",
  properties: { answer: { type: "string" } },
  required: ["answer"]
};

function codeAction(id: string, code: string): ToolCall {
  return { id, name: "execute_code", args: { code } };
}

describe("CodeAct observations", () => {
  it("forwards a tool's pixels as image content and strips them from the observation", async () => {
    const { step, task } = makeStep(ANSWER_SCHEMA);
    const context = createMockContext();
    const { provider, results } = createRecordingProvider([
      {
        toolCalls: [
          codeAction(
            "tc_1",
            `import { view_pixels } from "@nodetool-ai/sandbox-nodetool/session";
             const shot = await view_pixels({});
             await finish({answer: shot.asset_id});`
          )
        ]
      }
    ]);

    const executor = new CodeActExecutor({
      task,
      step,
      context: context as never,
      provider,
      model: "m",
      tools: [new PixelTool()]
    });
    for await (const msg of executor.execute()) void msg;

    expect(executor.getResult()).toEqual({ answer: "a1" });

    const blocks = results[0];
    expect(Array.isArray(blocks)).toBe(true);
    const content = blocks as MessageContent[];
    const text = content[0] as { type: string; text: string };
    expect(text.type).toBe("text");
    // The observation is the JSON envelope, minus the base64.
    expect(JSON.parse(text.text)).toMatchObject({ ok: true, finished: true });
    expect(text.text).not.toContain(PIXELS);

    const image = content[1] as { type: string; image: { data?: string } };
    expect(image.type).toBe("image_url");
    expect(image.image.data).toBe(PIXELS);
  });

  it("returns a plain string observation when no tool produced pixels", async () => {
    const { step, task } = makeStep(ANSWER_SCHEMA);
    const context = createMockContext();
    const { provider, results } = createRecordingProvider([
      { toolCalls: [codeAction("tc_1", `await finish({answer: "hi"});`)] }
    ]);

    const executor = new CodeActExecutor({
      task,
      step,
      context: context as never,
      provider,
      model: "m",
      tools: []
    });
    for await (const msg of executor.execute()) void msg;

    expect(typeof results[0]).toBe("string");
  });

  it("threads the bridge's tool-call id into tools that need it", async () => {
    const { step, task } = makeStep(ANSWER_SCHEMA);
    const context = createMockContext();
    const subtask = new IdRecordingTool();
    const { provider } = createRecordingProvider([
      {
        toolCalls: [
          codeAction(
            "tc_1",
            `import { run_subtask } from "@nodetool-ai/sandbox-nodetool/agents";
             await run_subtask({objective: "a"});
             await run_subtask({objective: "b"});
             await finish({answer: "done"});`
          )
        ]
      }
    ]);

    const executor = new CodeActExecutor({
      task,
      step,
      context: context as never,
      provider,
      model: "m",
      tools: [subtask]
    });

    const toolCallIds: string[] = [];
    for await (const msg of executor.execute()) {
      if (msg.type === "tool_call_update" && msg.name === "run_subtask") {
        toolCallIds.push((msg as { tool_call_id: string }).tool_call_id);
      }
    }

    expect(subtask.seen).toEqual(["codeact_1", "codeact_2"]);
    // The event a UI correlates on carries the same id the tool ran under.
    expect(toolCallIds).toEqual(["codeact_1", "codeact_2"]);
  });

  it("strips reasoning blocks from the final assistant text", async () => {
    const { step, task } = makeStep();
    const context = createMockContext();
    const { provider } = createRecordingProvider([
      { assistant: "<think>weighing options</think>The answer is 42." }
    ]);

    const executor = new CodeActExecutor({
      task,
      step,
      context: context as never,
      provider,
      model: "m",
      tools: []
    });
    for await (const msg of executor.execute()) void msg;

    expect(step.completed).toBe(true);
    expect(executor.getResult()).toBe("The answer is 42.");
    expect(context.memory.getValue("step:step_1")).toBe("The answer is 42.");
  });
});
