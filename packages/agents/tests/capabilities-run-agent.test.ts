import { describe, expect, it, vi } from "vitest";
import {
  BaseProvider,
  PERMISSION_GATE_CONTEXT_KEY,
  ProcessingContext,
  headlessGate,
  type Message,
  type ProviderStreamItem,
  type ToolCall
} from "@nodetool-ai/runtime";
import type { ProcessingMessage } from "@nodetool-ai/protocol";
import { createCapabilityRun, UNGATED } from "../src/capabilities/invoke.js";
import { runCodeBody } from "../src/capabilities/code.js";

type Turn = (
  args: Parameters<BaseProvider["generateMessages"]>[0]
) => ProviderStreamItem[];

/** A provider whose every turn is scripted; the base class runs the tool loop. */
class ScriptedProvider extends BaseProvider {
  readonly requests: Parameters<BaseProvider["generateMessages"]>[0][] = [];
  constructor(private readonly turns: Turn[]) {
    super("scripted");
  }
  override async generateMessage(): Promise<Message> {
    throw new Error("Unused single-turn path.");
  }
  override async *generateMessages(
    args: Parameters<BaseProvider["generateMessages"]>[0]
  ): AsyncGenerator<ProviderStreamItem> {
    this.requests.push(args);
    const turn = this.turns.shift();
    if (!turn) throw new Error("Unexpected provider turn.");
    yield* turn(args);
  }
}

const chunk = (content: string): ProviderStreamItem => ({
  type: "chunk",
  content,
  content_type: "text",
  done: false
});
const call = (name: string, args: Record<string, unknown>): ToolCall => ({
  id: `call-${name}`,
  name,
  args
});

function harness(turns: Turn[]) {
  const messages: ProcessingMessage[] = [];
  const context = new ProcessingContext({
    jobId: "run-agent",
    userId: "u1",
    onMessage: (message) => messages.push(message)
  });
  const provider = new ScriptedProvider(turns);
  vi.spyOn(context, "getProvider").mockResolvedValue(provider);
  const run = createCapabilityRun({ context, gate: UNGATED });
  const invoke = run.invoke.bind(run);
  const toolCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  vi.spyOn(run, "invoke").mockImplementation(async (name, args) => {
    if (name === "run_agent") return invoke(name, args);
    toolCalls.push({ name, args });
    return { storyboard: { id: "board-1", shots: 2 } };
  });
  return { context, provider, run, messages, toolCalls };
}

describe("run_agent", () => {
  it("drives a tool loop and streams its text and tool calls", async () => {
    const { run, messages, toolCalls, provider } = harness([
      () => [chunk("Reading the board."), call("get_storyboard", { storyboard_id: "board-1" })],
      () => [chunk("The board has two shots.")]
    ]);

    const result = await run.invoke("run_agent", {
      prompt: "How many shots does board-1 have?",
      model: { provider: "scripted", id: "m1" },
      tools: ["get_storyboard"],
      label: "counter"
    });

    expect(result).toMatchObject({
      text: "The board has two shots.",
      tool_calls: [{ name: "get_storyboard", ok: true }]
    });
    expect(toolCalls).toEqual([
      { name: "get_storyboard", args: { storyboard_id: "board-1" } }
    ]);
    expect(provider.requests[0].tools?.map((tool) => tool.name)).toEqual([
      "get_storyboard"
    ]);
    const kinds = messages.map((message) =>
      message.type === "chunk" ? `chunk:${message.content}` : message.type
    );
    expect(kinds).toEqual([
      "chunk:Reading the board.",
      "tool_call_update",
      "tool_result_update",
      "chunk:The board has two shots."
    ]);
    expect(messages[1]).toMatchObject({
      node_id: "counter",
      name: "get_storyboard",
      tool_call_id: "call-get_storyboard"
    });
    expect(messages[2]).toMatchObject({
      tool_call_id: "call-get_storyboard",
      is_error: false
    });
  });

  it("returns the submitted object when an output schema is given", async () => {
    const { run } = harness([
      () => [call("submit_result", { shots: 2 })]
    ]);

    const result = await run.invoke("run_agent", {
      prompt: "Count the shots.",
      model: { provider: "scripted", model: "m1" },
      output_schema: {
        type: "object",
        properties: { shots: { type: "number" } },
        required: ["shots"]
      }
    });

    expect(result).toMatchObject({ result: { shots: 2 } });
  });

  it("fails when the agent ends without submitting a required result", async () => {
    const { run } = harness([() => [chunk("I am done.")]]);

    const result = await run.invoke("run_agent", {
      prompt: "Count the shots.",
      model: { provider: "scripted", id: "m1" },
      output_schema: { type: "object", properties: {} }
    });

    expect(result).toMatchObject({
      error: "The agent ended without calling submit_result."
    });
  });

  it("refuses delegation tools and unknown names before any model turn", async () => {
    const { run, provider } = harness([]);

    await expect(
      run.invoke("run_agent", {
        prompt: "x",
        model: { provider: "scripted", id: "m1" },
        tools: ["run_subtask"]
      })
    ).resolves.toMatchObject({ error: expect.stringContaining("run_subtask") });
    await expect(
      run.invoke("run_agent", {
        prompt: "x",
        model: { provider: "scripted", id: "m1" },
        tools: ["no_such_capability"]
      })
    ).resolves.toMatchObject({ error: "Unknown capabilities: no_such_capability" });
    expect(provider.requests).toHaveLength(0);
  });

  it("is importable from a JS script and streams onto the script's context", async () => {
    const messages: ProcessingMessage[] = [];
    const context = new ProcessingContext({
      jobId: "script",
      userId: "u1",
      onMessage: (message) => messages.push(message)
    });
    context.set(PERMISSION_GATE_CONTEXT_KEY, headlessGate("test script"));
    vi.spyOn(context, "getProvider").mockResolvedValue(
      new ScriptedProvider([() => [chunk("Hello from the agent.")]])
    );

    const result = await runCodeBody(context, {
      code: `import { run_agent } from "@nodetool-ai/sandbox-nodetool/agents";
const answer = await run_agent({prompt: "Say hello.", model: {provider: "scripted", id: "m1"}});
return {text: answer.text};`,
      inputs: {},
      secrets: [],
      timeoutSeconds: 30,
      withToolbelt: true
    });

    expect(result).toMatchObject({
      ok: true,
      outputs: { text: "Hello from the agent." }
    });
    expect(messages).toContainEqual(
      expect.objectContaining({
        type: "chunk",
        node_id: "agent",
        content: "Hello from the agent."
      })
    );
  });
});
