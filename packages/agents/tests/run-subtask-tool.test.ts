import { describe, it, expect } from "vitest";
import {
  ProcessingContext,
  RUN_BUDGET_CONTEXT_KEY,
  createRunBudget
} from "@nodetool-ai/runtime";
import type { ProcessingMessage } from "@nodetool-ai/protocol";
import {
  createLoopingMockProvider,
  type MockStreamItem
} from "./_helpers/looping-mock-provider.js";
import {
  RunSubtaskTool,
  SUBTASK_DEPTH_KEY,
  TOOL_CALL_ID_FIELD
} from "../src/tools/run-subtask-tool.js";

function makeCtx(): ProcessingContext {
  return new ProcessingContext({ jobId: "test-job", userId: "test" });
}

/**
 * The looping mock every sub-agent suite shares — a scripted turn under the
 * real `BaseProvider.generateLoop`.
 */
const createMockProvider = (
  responseSequence: MockStreamItem[][]
): ReturnType<typeof createLoopingMockProvider> =>
  createLoopingMockProvider(responseSequence);

describe("RunSubtaskTool", () => {
  describe("name + schema", () => {
    it("declares the run_subtask name and required fields", () => {
      const tool = new RunSubtaskTool({
        provider: createMockProvider([]),
        model: "mock",
        parentTools: () => [],
        forwardMessage: () => {}
      });
      expect(tool.name).toBe("run_subtask");
      expect(tool.description.length).toBeGreaterThan(0);
      const schema = tool.inputSchema as Record<string, unknown>;
      expect(schema.type).toBe("object");
      expect(schema.required).toEqual(["description", "prompt"]);
    });

    it("renders a useful userMessage using the description arg", () => {
      const tool = new RunSubtaskTool({
        provider: createMockProvider([]),
        model: "mock",
        parentTools: () => [],
        forwardMessage: () => {}
      });
      expect(tool.userMessage({ description: "Research X" })).toBe(
        "Running subtask: Research X"
      );
      expect(tool.userMessage({})).toBe("Running subtask");
    });
  });

  describe("input validation", () => {
    it("returns an error when prompt is missing", async () => {
      const tool = new RunSubtaskTool({
        provider: createMockProvider([]),
        model: "mock",
        parentTools: () => [],
        forwardMessage: () => {}
      });
      const ctx = makeCtx();
      const result = (await tool.process(ctx, {
        description: "hello"
      })) as Record<string, unknown>;
      expect(result.error).toBe("missing_prompt");
    });
  });

  describe("recursion depth enforcement", () => {
    it("refuses to spawn a subtask at or above max_depth", async () => {
      const tool = new RunSubtaskTool({
        provider: createMockProvider([]),
        model: "mock",
        parentTools: () => [],
        forwardMessage: () => {},
        maxDepth: 2
      });
      const ctx = makeCtx();
      ctx.set(SUBTASK_DEPTH_KEY, 2);
      const result = (await tool.process(ctx, {
        description: "deep",
        prompt: "Try to recurse",
        [TOOL_CALL_ID_FIELD]: "tc_outer"
      })) as Record<string, unknown>;
      expect(result.error).toBe("max_recursion_depth_reached");
      expect(result.depth).toBe(2);
      expect(result.max_depth).toBe(2);
    });

    it("permits spawning when below the depth limit", async () => {
      // Subtask emits a single chunk and then ends (no tool calls -> done,
      // text is the result).
      const provider = createMockProvider([
        [{ type: "chunk", content: "subtask answer", done: true }]
      ]);
      const forwarded: ProcessingMessage[] = [];
      const tool = new RunSubtaskTool({
        provider,
        model: "mock",
        parentTools: () => [],
        forwardMessage: (m) => {
          forwarded.push(m);
        },
        maxDepth: 3
      });
      const ctx = makeCtx();
      ctx.set(SUBTASK_DEPTH_KEY, 0);

      const result = await tool.process(ctx, {
        description: "answer-once",
        prompt: "Just say something",
        [TOOL_CALL_ID_FIELD]: "tc_outer"
      });

      // The subtask returned its text as the final result (loop mode terminates
      // when the LLM emits no tool calls).
      expect(typeof result === "string" || result !== null).toBe(true);
      // Child events were forwarded, tagged with the parent tool_call_id and
      // an incremented depth.
      const sample = forwarded.find(
        (m) =>
          (m as { parent_tool_call_id?: string }).parent_tool_call_id ===
          "tc_outer"
      ) as { subtask_depth?: number; parent_tool_call_id?: string } | undefined;
      expect(sample).toBeDefined();
      expect(sample?.subtask_depth).toBe(1);
    });
  });

  describe("run budget", () => {
    /** A cap no turn can fit under, so a refusal is unambiguous. */
    function exhaustedBudget() {
      return createRunBudget({
        capUsd: 0,
        maxOutputTokens: 1024,
        unpricedTokenCeiling: 0,
        deadlineMs: Infinity,
        maxConcurrency: 4,
        maxTurns: 10
      });
    }

    it("reserves against the budget the runtime carries", async () => {
      const budget = exhaustedBudget();
      const provider = createLoopingMockProvider(
        [[{ type: "chunk", content: "answer", done: true }]],
        { provider: "openai" }
      );
      const tool = new RunSubtaskTool({
        provider,
        model: "gpt-4o-mini",
        parentTools: () => [],
        forwardMessage: () => {},
        budget
      });

      const result = (await tool.process(makeCtx(), {
        description: "d",
        prompt: "do a thing"
      })) as Record<string, unknown>;

      expect(provider.turnsStarted).toBe(0);
      expect(result.error).toBe("subtask_failed");
      expect(String(result.message)).toContain("budget");
      expect(budget.exhausted?.kind).toBe("cost");
    });

    it("falls back to the budget the host left on the context", async () => {
      // The host that put a budget on the context never sees the sub-agent
      // runtime this tool is built from — the fallback is what makes a child
      // three levels down share the turn's cap.
      const budget = exhaustedBudget();
      const provider = createLoopingMockProvider(
        [[{ type: "chunk", content: "answer", done: true }]],
        { provider: "openai" }
      );
      const tool = new RunSubtaskTool({
        provider,
        model: "gpt-4o-mini",
        parentTools: () => [],
        forwardMessage: () => {}
      });
      const ctx = makeCtx();
      ctx.set(RUN_BUDGET_CONTEXT_KEY, budget);

      const result = (await tool.process(ctx, {
        description: "d",
        prompt: "do a thing"
      })) as Record<string, unknown>;

      expect(provider.turnsStarted).toBe(0);
      expect(result.error).toBe("subtask_failed");
      expect(budget.exhausted?.kind).toBe("cost");
    });

    it("leaves an unbudgeted run unbounded rather than exhausted", async () => {
      const provider = createLoopingMockProvider(
        [[{ type: "chunk", content: "answer", done: true }]],
        { provider: "openai" }
      );
      const tool = new RunSubtaskTool({
        provider,
        model: "gpt-4o-mini",
        parentTools: () => [],
        forwardMessage: () => {}
      });

      const result = await tool.process(makeCtx(), {
        description: "d",
        prompt: "do a thing"
      });

      expect(provider.turnsStarted).toBe(1);
      expect(String(result)).toContain("answer");
    });
  });

  describe("nested recursion", () => {
    it("includes run_subtask in the child's toolset even when the root captured parentTools before adding it", async () => {
      // Mirrors what handleAgentMessage / handleChatMessage do: `baseTools`
      // is snapshotted BEFORE unshifting run_subtask, so `parentToolsFn()`
      // returns a list without it. The tool must heal this and ensure the
      // child still sees `run_subtask`.
      const make = (name: string): any => ({
        name,
        description: name,
        inputSchema: { type: "object" },
        toProviderTool: () => ({ name, description: name, inputSchema: {} }),
        async process() {
          return {};
        }
      });
      const baseTools = [make("read_file")]; // intentionally NO run_subtask

      let capturedPrompt = "";
      const provider = createMockProvider([
        [{ type: "chunk", content: "ok", done: true }]
      ]);
      const origGen = provider.generateMessages.bind(provider);
      provider.generateMessages = async function* (opts: any) {
        if (opts && Array.isArray(opts.messages)) {
          capturedPrompt = (opts.messages as Array<{ content?: unknown }>)
            .map((m) => (typeof m.content === "string" ? m.content : ""))
            .join("\n");
        }
        yield* origGen(opts);
      };

      const tool = new RunSubtaskTool({
        provider,
        model: "mock",
        parentTools: () => baseTools,
        forwardMessage: () => {},
        maxDepth: 3
      });
      const ctx = makeCtx();
      ctx.set(SUBTASK_DEPTH_KEY, 0);

      await tool.process(ctx, {
        description: "level-1",
        prompt: "do thing",
        [TOOL_CALL_ID_FIELD]: "tc_root"
      });

      // The child's toolset shows up in the prompt, not in the provider tools:
      // core tools under the direct-tool section, everything else as a
      // `tools.*` signature. `run_subtask` is additionally documented as the
      // object model's `nodetool.agents`, which the prompt carries only when
      // the belt can serve it.
      expect(capturedPrompt).toContain("# Direct tools");
      expect(capturedPrompt).toContain("read_file");
      expect(capturedPrompt).toContain("nodetool.agents");
    });

    it("does not mutate the caller's depth counter (each level gets a copy)", async () => {
      const provider = createMockProvider([
        [{ type: "chunk", content: "ok", done: true }]
      ]);
      const tool = new RunSubtaskTool({
        provider,
        model: "mock",
        parentTools: () => [],
        forwardMessage: () => {},
        maxDepth: 3
      });
      const ctx = makeCtx();
      ctx.set(SUBTASK_DEPTH_KEY, 0);

      await tool.process(ctx, {
        description: "shallow",
        prompt: "do a thing",
        [TOOL_CALL_ID_FIELD]: "tc_root"
      });

      // Caller's depth must remain 0 — the child runs against a context COPY
      // so depth mutations stay local. (Important: if this leaked, every
      // subsequent root turn would silently start at a higher depth.)
      expect(ctx.get<number>(SUBTASK_DEPTH_KEY)).toBe(0);
    });
  });

  describe("tool inheritance", () => {
    it("passes the parent's full toolset to the child (no allowlist)", async () => {
      const make = (name: string): any => ({
        name,
        description: name,
        inputSchema: { type: "object" },
        toProviderTool: () => ({ name, description: name, inputSchema: {} }),
        async process() {
          return {};
        }
      });
      const parentTools = [
        make("read_file"),
        make("read_shared"),
        make("write_file")
      ];

      let capturedPrompt = "";
      const provider = createMockProvider([
        [{ type: "chunk", content: "ok", done: true }]
      ]);
      const origGen = provider.generateMessages.bind(provider);
      provider.generateMessages = async function* (opts: any) {
        if (opts && Array.isArray(opts.messages)) {
          capturedPrompt = (opts.messages as Array<{ content?: unknown }>)
            .map((m) => (typeof m.content === "string" ? m.content : ""))
            .join("\n");
        }
        yield* origGen(opts);
      };

      const tool = new RunSubtaskTool({
        provider,
        model: "mock",
        parentTools: () => parentTools,
        forwardMessage: () => {},
        maxDepth: 3
      });
      const ctx = makeCtx();
      ctx.set(SUBTASK_DEPTH_KEY, 0);

      await tool.process(ctx, {
        description: "inherits",
        prompt: "do thing",
        [TOOL_CALL_ID_FIELD]: "tc_outer"
      });

      // All parent tools are inherited; run_subtask is stitched in so the
      // child can itself recurse. The core tools are documented as direct
      // calls, the rest as sandbox signatures.
      expect(capturedPrompt).toContain("nodetool.shared");
      expect(capturedPrompt).toContain("# Direct tools");
      for (const name of ["read_file", "write_file"]) {
        expect(capturedPrompt).toContain(name);
      }
      expect(capturedPrompt).toContain("nodetool.agents");
    });
  });
});
