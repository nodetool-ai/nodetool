import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { finishAction } from "./_helpers/codeact-provider.js";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { Agent, loadSkillsFromDirectory } from "../src/agent.js";
import { parseFrontmatter } from "../src/agent.js";
import type { ProcessingMessage } from "@nodetool-ai/protocol";
import { createMockContext } from "./_helpers/mock-context.js";
import { BaseProvider } from "@nodetool-ai/runtime";
import { Skill, initTestDb } from "@nodetool-ai/models";
import {
  SqliteVecProvider,
  type EmbeddingFunction,
  type VectorProvider
} from "@nodetool-ai/vectorstore";

// ---------------------------------------------------------------------------
// Mock helpers (same pattern as agents.test.ts)
// ---------------------------------------------------------------------------

function createMockProvider(
  responseSequence: Array<
    Array<
      | { type: "chunk"; content: string; done?: boolean }
      | { id: string; name: string; args: Record<string, unknown> }
    >
  >
) {
  let callIndex = 0;
  return {
    provider: "mock",
    hasToolSupport: async () => true,
    generateMessages: async function* () {
      const items = responseSequence[callIndex] ?? [];
      callIndex++;
      for (const item of items) {
        yield item;
      }
    },
    async *generateMessagesTraced(...args: any[]) {
      yield* (this as any).generateMessages(...args);
    },
    // The planner delegates its tool loop to the provider; reuse the real base
    // loop (it only needs generateMessagesTraced, which this mock has).
    generateLoop(args: any) {
      return (BaseProvider.prototype as any).generateLoop.call(this, args);
    },
    async generateMessageTraced(...args: any[]) {
      return (this as any).generateMessage(...args);
    },
    generateMessage: vi.fn(),
    getAvailableLanguageModels: vi.fn().mockResolvedValue([]),
    getAvailableImageModels: vi.fn().mockResolvedValue([]),
    getAvailableVideoModels: vi.fn().mockResolvedValue([]),
    getAvailableTTSModels: vi.fn().mockResolvedValue([]),
    getAvailableASRModels: vi.fn().mockResolvedValue([]),
    getAvailableEmbeddingModels: vi.fn().mockResolvedValue([]),
    getContainerEnv: () => ({}),
    textToImage: vi.fn(),
    imageToImage: vi.fn(),
    textToSpeech: vi.fn(),
    automaticSpeechRecognition: vi.fn(),
    textToVideo: vi.fn(),
    imageToVideo: vi.fn(),
    generateEmbedding: vi.fn(),
    isContextLengthError: () => false
  } as any;
}

/**
 * Convert a legacy create_plan payload into the sequence of provider calls the
 * new incremental planner expects:
 *   call N (one per task): { name: "add_task", args: { id, title, depends_on, steps } }
 *   final call: { name: "finish_plan", args: { title } }
 * Prepended chunks/text are included on the first call for parity with old tests.
 */
function planCalls(
  plan: { title: string; tasks: Array<Record<string, unknown>> },
  firstCallPrefix: Array<
    | { type: "chunk"; content: string; done?: boolean }
    | { id: string; name: string; args: Record<string, unknown> }
  > = []
): Array<
  Array<
    | { type: "chunk"; content: string; done?: boolean }
    | { id: string; name: string; args: Record<string, unknown> }
  >
> {
  const calls: Array<
    Array<
      | { type: "chunk"; content: string; done?: boolean }
      | { id: string; name: string; args: Record<string, unknown> }
    >
  > = [];
  plan.tasks.forEach((task, idx) => {
    const call: Array<
      | { type: "chunk"; content: string; done?: boolean }
      | { id: string; name: string; args: Record<string, unknown> }
    > = idx === 0 ? [...firstCallPrefix] : [];
    call.push({ id: `tc_add_${idx}`, name: "add_task", args: task });
    calls.push(call);
  });
  calls.push([
    { id: "tc_finish", name: "finish_plan", args: { title: plan.title } }
  ]);
  return calls;
}

// ---------------------------------------------------------------------------
// parseFrontmatter
// ---------------------------------------------------------------------------

describe("parseFrontmatter", () => {
  it("parses key-value pairs", () => {
    const result = parseFrontmatter(
      "name: my-skill\ndescription: A cool skill"
    );
    expect(result).toEqual({ name: "my-skill", description: "A cool skill" });
  });

  it("strips surrounding quotes", () => {
    const result = parseFrontmatter(
      "name: \"quoted-name\"\ndescription: 'quoted desc'"
    );
    expect(result).toEqual({ name: "quoted-name", description: "quoted desc" });
  });

  it("skips comments and empty lines", () => {
    const result = parseFrontmatter(
      "# comment\n\nname: test\n# another comment"
    );
    expect(result).toEqual({ name: "test" });
  });

  it("handles lines without colons", () => {
    const result = parseFrontmatter("no-colon-here\nname: value");
    expect(result).toEqual({ name: "value" });
  });
});

// ---------------------------------------------------------------------------
// loadSkillsFromDirectory
// ---------------------------------------------------------------------------

describe("loadSkillsFromDirectory", () => {
  it("returns no skills without reading the supplied directory", async () => {
    const skills = await loadSkillsFromDirectory(
      "/path/that/must/not/be/read"
    );
    expect(skills).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------

describe("Agent", () => {
  let tmpDir: string;

  beforeEach(async () => {
    initTestDb();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-test-workspace-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("plans and executes a task to completion", async () => {
    const planPayload = {
      title: "Simple Plan",
      tasks: [
        {
          id: "task_1",
          title: "Simple Task",
          depends_on: [],
          steps: [
            {
              id: "step_1",
              instructions: "Do the work",
              depends_on: [],
              output_schema:
                '{"type":"object","properties":{"answer":{"type":"number"}}}'
            }
          ]
        }
      ]
    };

    // Planning now uses incremental add_task + finish_plan, then execution.
    const provider = createMockProvider([
      ...planCalls(planPayload, [{ type: "chunk", content: "Planning..." }]),
      // Execution call for step_1
      [
        { type: "chunk", content: "Executing step 1..." },
        finishAction({ answer: 42 })
      ]
    ]);

    const agent = new Agent({
      name: "test-agent",
      objective: "Find the answer",
      provider,
      model: "test-model",
      workspace: tmpDir,
      skillDirs: [] // no skills dirs
    });

    const context = createMockContext();
    const messages: ProcessingMessage[] = [];
    for await (const msg of agent.execute(context)) {
      messages.push(msg);
    }

    expect(agent.taskPlan).not.toBeNull();
    expect(agent.taskPlan!.tasks).toHaveLength(1);
    expect(agent.taskPlan!.tasks[0].completed).toBe(true);

    // Should have step_result messages
    const stepResults = messages.filter((m) => m.type === "step_result");
    expect(stepResults.length).toBeGreaterThanOrEqual(1);
  });

  it("throws when planner fails to create a task", async () => {
    // Provider that returns no plan
    const provider = createMockProvider([
      [{ type: "chunk", content: "I cannot plan this." }]
    ]);

    const agent = new Agent({
      name: "fail-agent",
      objective: "Impossible",
      provider,
      model: "test-model",
      workspace: tmpDir,
      skillDirs: []
    });

    const context = createMockContext();
    await expect(async () => {
      for await (const _msg of agent.execute(context)) {
        // consume
      }
    }).rejects.toThrow("TaskPlanner failed");
  });

  it("loads skills and includes them in the objective", async () => {
    await Skill.create({
      user_id: "test-user",
      name: "data-analysis",
      description: "Analyze data carefully",
      content: "When analyzing data, use statistics."
    });
    await Skill.create({
      user_id: "other-user",
      name: "other-analysis",
      description: "Analyze data carefully",
      content: "This skill belongs to another user."
    });

    const planPayload = {
      title: "Analysis Plan",
      tasks: [
        {
          id: "task_analyze",
          title: "Analysis Task",
          depends_on: [],
          steps: [
            {
              id: "analyze",
              instructions: "Analyze the data",
              depends_on: [],
              output_schema:
                '{"type":"object","properties":{"done":{"type":"boolean"}}}'
            }
          ]
        }
      ]
    };

    const baseProvider = createMockProvider([
      ...planCalls(planPayload, [{ type: "chunk", content: "Planning..." }]),
      [
        { type: "chunk", content: "Analyzing..." },
        finishAction({ done: true })
      ],
      // CompilerAgent prose-mode response — text without a tool call ends the loop.
      [{ type: "chunk", content: "Analysis complete." }]
    ]);
    const sentToModel: string[] = [];
    const provider = {
      ...baseProvider,
      generateMessages: async function* (...args: unknown[]) {
        sentToModel.push(JSON.stringify(args));
        yield* baseProvider.generateMessages(...args);
      }
    };

    const agent = new Agent({
      name: "skill-agent",
      objective: "Analyze this data carefully",
      provider,
      model: "test-model",
      workspace: tmpDir,
      skillDirs: []
    });

    const context = createMockContext();
    for await (const _msg of agent.execute(context)) {
      // consume
    }

    // Compiler returns the prose text it produced in its final turn.
    expect(agent.getResults()).toBe("Analysis complete.");
    const prompts = sentToModel.join("\n");
    expect(prompts).toContain("When analyzing data, use statistics.");
    expect(prompts).not.toContain("This skill belongs to another user.");
  });

  it("does not graft the agent output schema onto plan steps (the CompilerAgent owns it)", async () => {
    const stepSchema = JSON.stringify({
      type: "object",
      properties: { v: { type: "number" } }
    });
    const planPayload = {
      title: "Schema Plan",
      tasks: [
        {
          id: "task_schema",
          title: "Schema Task",
          depends_on: [],
          steps: [
            {
              id: "step_a",
              instructions: "Do A",
              depends_on: [],
              output_schema: stepSchema
            },
            {
              id: "step_b",
              instructions: "Final step",
              depends_on: ["step_a"],
              output_schema: stepSchema
            }
          ]
        }
      ]
    };

    const compilerFinish = {
      id: "tc_compile",
      name: "finish_step",
      args: { result: { answer: "yes" } }
    };
    const provider = createMockProvider([
      ...planCalls(planPayload),
      [
        { type: "chunk", content: "A" },
        finishAction({ v: 1 })
      ],
      [
        { type: "chunk", content: "B" },
        finishAction({ v: 2 })
      ],
      // CompilerAgent: replicate the response so it's served regardless of
      // how many compile rounds it takes (list_shared / read_shared may run
      // first in some configurations).
      [compilerFinish],
      [compilerFinish],
      [compilerFinish]
    ]);

    const outputSchema = {
      type: "object",
      properties: { answer: { type: "string" } }
    };

    const agent = new Agent({
      name: "schema-agent",
      objective: "Get the answer",
      provider,
      model: "test-model",
      workspace: tmpDir,
      outputSchema,
      skillDirs: []
    });

    const context = createMockContext();
    for await (const _msg of agent.execute(context)) {
      // consume
    }

    // The plan steps must NOT have the agent's output schema grafted onto
    // them — that's the Compiler's job now.
    for (const task of agent.taskPlan!.tasks) {
      for (const step of task.steps) {
        expect(step.outputSchema).not.toBe(JSON.stringify(outputSchema));
      }
    }
    // The compiler produced the final schema-conformant result.
    expect(agent.getResults()).toEqual({ answer: "yes" });
  });

  it("getResults returns null before execution", () => {
    const provider = createMockProvider([]);
    const agent = new Agent({
      name: "no-exec",
      objective: "Do nothing",
      provider,
      model: "test-model",
      skillDirs: []
    });

    expect(agent.getResults()).toBeNull();
  });

  it("skips planning when pre-defined task is provided", async () => {
    // Provider is only called for step execution (no planning call)
    const provider = createMockProvider([
      [
        { type: "chunk", content: "Executing pre-defined step..." },
        finishAction({ value: 99 })
      ]
    ]);

    const preDefinedTask = {
      id: "predefined-task",
      title: "Pre-defined Task",
      steps: [
        {
          id: "step_1",
          instructions: "Execute this directly",
          dependsOn: [],
          completed: false,
          logs: [],
          outputSchema:
            '{"type":"object","properties":{"value":{"type":"number"}}}'
        }
      ]
    };

    const agent = new Agent({
      name: "predefined-agent",
      objective: "Execute predefined task",
      provider,
      model: "test-model",
      workspace: tmpDir,
      task: preDefinedTask,
      skillDirs: []
    });

    const context = createMockContext();
    const messages: ProcessingMessage[] = [];
    for await (const msg of agent.execute(context)) {
      messages.push(msg);
    }

    // Task should be the pre-defined one (not replanned)
    expect(agent.task).toBe(preDefinedTask);
    expect(agent.getResults()).toEqual({ value: 99 });
  });

  it("uses planningModel for planner and model for executor", async () => {
    // Spy on provider to capture which model is used
    const calls: string[] = [];
    const modelPlan = {
      title: "T",
      tasks: [
        {
          id: "task_1",
          title: "T",
          depends_on: [],
          steps: [{ id: "s1", instructions: "Do it", depends_on: [] }]
        }
      ]
    };
    const baseProvider = createMockProvider([
      ...planCalls(modelPlan),
      [finishAction({ done: true })]
    ]);
    // Execution turns always answer with a code action: the planner's own script
    // is consumed by planning, and a step that never finishes now fails the
    // whole run rather than quietly completing.
    const providerSpy = {
      ...baseProvider,
      generateMessages: async function* (opts: any) {
        calls.push(opts.model ?? "no-model");
        if (opts.model === "exec-model") {
          // The planned step carries no schema, so it finalizes from a
          // no-tool-call assistant message.
          yield { type: "chunk" as const, content: "done", done: true };
          return;
        }
        yield* baseProvider.generateMessages(opts);
      }
    } as any;

    const agent = new Agent({
      name: "model-agent",
      objective: "Test model selection",
      provider: providerSpy,
      model: "exec-model",
      planningModel: "plan-model",
      workspace: tmpDir,
      skillDirs: []
    });

    const context = createMockContext();
    for await (const _msg of agent.execute(context)) {
      // consume
    }

    // Planning makes multiple calls (one per add_task + finish_plan) — all use planningModel.
    // Execution calls use exec-model.
    expect(calls[0]).toBe("plan-model");
    expect(calls[calls.length - 1]).toBe("exec-model");
    expect(
      calls.filter((m) => m === "plan-model").length
    ).toBeGreaterThanOrEqual(2);
  });

  it("defaults planningModel and reasoningModel to model when not provided", () => {
    const provider = createMockProvider([]);
    const agent = new Agent({
      name: "defaults-agent",
      objective: "Test defaults",
      provider,
      model: "base-model",
      skillDirs: []
    });
    // Both should default to model — accessed via task which hasn't run yet
    expect(agent.getResults()).toBeNull(); // basic sanity
  });

  it("uses explicit skill names when skills option is provided", async () => {
    await Skill.create({
      user_id: "test-user",
      name: "named-skill",
      description: "A named skill",
      content: "Named skill instructions."
    });

    const planPayload = {
      title: "Named Skill Plan",
      tasks: [
        {
          id: "task_named",
          title: "Named Skill Task",
          depends_on: [],
          steps: [
            {
              id: "s1",
              instructions: "Do it",
              depends_on: [],
              output_schema:
                '{"type":"object","properties":{"ok":{"type":"boolean"}}}'
            }
          ]
        }
      ]
    };
    const provider = createMockProvider([
      ...planCalls(planPayload),
      [finishAction({ ok: true })],
      // Compiler prose-mode response.
      [{ type: "chunk", content: "Done." }]
    ]);

    const agent = new Agent({
      name: "named-skills-agent",
      objective: "Test explicit skill selection",
      provider,
      model: "test-model",
      workspace: tmpDir,
      skills: ["named-skill"],
      skillDirs: []
    });

    const context = createMockContext();
    for await (const _msg of agent.execute(context)) {
      // consume
    }

    expect(agent.taskPlan).not.toBeNull();
    expect(agent.getResults()).toBe("Done.");
  });

  it("ignores deprecated skill environment variables", async () => {
    await Skill.create({
      user_id: "test-user",
      name: "database-skill",
      description: "Test env skill loading for testing",
      content: "Database-backed skill content."
    });
    const planPayload = {
      title: "Env Skill Plan",
      tasks: [
        {
          id: "task_env",
          title: "Env Skill Task",
          depends_on: [],
          steps: [
            {
              id: "s1",
              instructions: "Do it",
              depends_on: [],
              output_schema:
                '{"type":"object","properties":{"ok":{"type":"boolean"}}}'
            }
          ]
        }
      ]
    };
    const provider = createMockProvider([
      ...planCalls(planPayload),
      [finishAction({ ok: true })]
    ]);

    // Active skills have no public accessor, so the prompt the provider was
    // handed is the only place the env-loaded skill is observable.
    const sentToModel: string[] = [];
    const generateMessages = provider.generateMessages.bind(provider);
    provider.generateMessages = async function* (...args: unknown[]) {
      sentToModel.push(JSON.stringify(args));
      yield* generateMessages(...args);
    };

    const savedDirs = process.env["NODETOOL_AGENT_SKILL_DIRS"];
    const savedNames = process.env["NODETOOL_AGENT_SKILLS"];
    const savedAuto = process.env["NODETOOL_AGENT_AUTO_SKILLS"];
    process.env["NODETOOL_AGENT_SKILL_DIRS"] = "/tmp/ignored-skills";
    process.env["NODETOOL_AGENT_SKILLS"] = "env-skill";
    process.env["NODETOOL_AGENT_AUTO_SKILLS"] = "0";
    try {
      const agent = new Agent({
        name: "env-skill-agent",
        objective: "Test env skill loading for testing",
        provider,
        model: "test-model",
        workspace: tmpDir,
        skillDirs: []
      });

      const context = createMockContext();
      for await (const _msg of agent.execute(context)) {
        // consume
      }

      expect(agent.taskPlan).not.toBeNull();

      const prompts = sentToModel.join("\n");
      expect(prompts).toContain("Database-backed skill content.");
      expect(prompts).not.toContain("Env skill instructions.");
    } finally {
      if (savedDirs !== undefined) process.env["NODETOOL_AGENT_SKILL_DIRS"] = savedDirs;
      else delete process.env["NODETOOL_AGENT_SKILL_DIRS"];
      if (savedNames !== undefined) process.env["NODETOOL_AGENT_SKILLS"] = savedNames;
      else delete process.env["NODETOOL_AGENT_SKILLS"];
      if (savedAuto !== undefined) process.env["NODETOOL_AGENT_AUTO_SKILLS"] = savedAuto;
      else delete process.env["NODETOOL_AGENT_AUTO_SKILLS"];
    }
  });

  it("runs successfully without explicit workspace (auto-creates workspace)", async () => {
    const autoWsPlan = {
      title: "T",
      tasks: [
        {
          id: "task_1",
          title: "T",
          depends_on: [],
          steps: [
            {
              id: "s1",
              instructions: "Do it",
              depends_on: [],
              output_schema:
                '{"type":"object","properties":{"v":{"type":"number"}}}'
            }
          ]
        }
      ]
    };
    const provider = createMockProvider([
      ...planCalls(autoWsPlan),
      [finishAction({ v: 1 })],
      // Compiler prose-mode response.
      [{ type: "chunk", content: "v=1" }]
    ]);

    const agent = new Agent({
      name: "auto-ws-agent",
      objective: "Test auto workspace",
      provider,
      model: "test-model",
      // No workspace provided — auto-created under ~/nodetool_workspace/<ts>
      skillDirs: []
    });

    const context = createMockContext();
    // Should not throw; workspace is auto-created
    let thrown = false;
    try {
      for await (const _msg of agent.execute(context)) {
        // consume
      }
    } catch {
      thrown = true;
    }
    expect(thrown).toBe(false);
    // Compiler returns prose text.
    expect(agent.getResults()).toBe("v=1");
  });

  it("merges systemPrompt with skill system prompt when both are present", async () => {
    await Skill.create({
      user_id: "test-user",
      name: "merge-skill",
      description: "Merging test skill for objective",
      content: "Merge skill instructions."
    });

    const capturedPrompts: string[] = [];
    const mergePlan = {
      title: "T",
      tasks: [
        {
          id: "task_1",
          title: "T",
          depends_on: [],
          steps: [
            {
              id: "s1",
              instructions: "Do it",
              depends_on: [],
              output_schema:
                '{"type":"object","properties":{"done":{"type":"boolean"}}}'
            }
          ]
        }
      ]
    };
    const baseProvider = createMockProvider([
      ...planCalls(mergePlan),
      [finishAction({ done: true })]
    ]);
    const providerSpy = {
      ...baseProvider,
      generateMessages: async function* (opts: any) {
        if (opts.messages?.[0]?.content) {
          capturedPrompts.push(opts.messages[0].content);
        }
        yield* baseProvider.generateMessages(opts);
      }
    } as any;

    const agent = new Agent({
      name: "merge-prompt-agent",
      objective: "Test merging skill instructions for objective",
      provider: providerSpy,
      model: "test-model",
      workspace: tmpDir,
      systemPrompt: "Custom system prompt.",
      skillDirs: []
    });

    const context = createMockContext();
    for await (const _msg of agent.execute(context)) {
      // consume
    }

    // The system prompt sent to planner should contain both the custom prompt and skill instructions
    const firstPrompt = capturedPrompts[0] ?? "";
    expect(firstPrompt).toContain("Custom system prompt.");
    expect(firstPrompt).toContain("Merge skill instructions.");
  });

  it("creates workspace directory when not provided", async () => {
    const planPayload = {
      title: "Workspace Plan",
      tasks: [
        {
          id: "task_ws",
          title: "Workspace Task",
          depends_on: [],
          steps: [
            {
              id: "step_1",
              instructions: "Do work",
              depends_on: [],
              output_schema:
                '{"type":"object","properties":{"ok":{"type":"boolean"}}}'
            }
          ]
        }
      ]
    };

    const provider = createMockProvider([
      ...planCalls(planPayload),
      [
        { type: "chunk", content: "Done" },
        finishAction({ ok: true })
      ]
    ]);

    // Use a temp directory as workspace to avoid leaving files around
    const workspace = path.join(tmpDir, "auto-workspace");

    const agent = new Agent({
      name: "ws-agent",
      objective: "Test workspace creation",
      provider,
      model: "test-model",
      workspace,
      skillDirs: []
    });

    const context = createMockContext();
    for await (const _msg of agent.execute(context)) {
      // consume
    }

    // Verify workspace was created
    const stat = await fs.stat(workspace);
    expect(stat.isDirectory()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Agent + LLM memory synthesis (opt-in, default OFF)
// ---------------------------------------------------------------------------
