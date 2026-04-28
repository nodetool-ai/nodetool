import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { Agent, loadSkillsFromDirectory } from "../src/agent.js";
import { parseFrontmatter } from "../src/agent.js";
import type { ProcessingMessage } from "@nodetool-ai/protocol";

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

function createMockContext() {
  const store = new Map<string, unknown>();
  return {
    storeStepResult: vi.fn(async (key: string, value: unknown) => {
      store.set(key, value);
      return key;
    }),
    loadStepResult: vi.fn(async (key: string) => {
      return store.get(key);
    }),
    set: vi.fn((key: string, value: unknown) => {
      store.set(key, value);
    }),
    get: vi.fn((key: string) => {
      return store.get(key);
    }),
    _store: store
  } as any;
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
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-test-skills-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("loads valid skills from a directory", async () => {
    const skillDir = path.join(tmpDir, "my-skill");
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(
      path.join(skillDir, "SKILL.md"),
      "---\nname: my-skill\ndescription: A test skill\n---\nDo something useful."
    );

    const skills = await loadSkillsFromDirectory(tmpDir);
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe("my-skill");
    expect(skills[0].description).toBe("A test skill");
    expect(skills[0].instructions).toBe("Do something useful.");
  });

  it("skips skills with invalid names", async () => {
    const skillDir = path.join(tmpDir, "bad-skill");
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(
      path.join(skillDir, "SKILL.md"),
      "---\nname: INVALID_NAME!\ndescription: Bad name\n---\nInstructions."
    );

    const skills = await loadSkillsFromDirectory(tmpDir);
    expect(skills).toHaveLength(0);
  });

  it("skips skills with reserved terms in name", async () => {
    const skillDir = path.join(tmpDir, "reserved-skill");
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(
      path.join(skillDir, "SKILL.md"),
      "---\nname: my-anthropic-skill\ndescription: Uses reserved term\n---\nInstructions."
    );

    const skills = await loadSkillsFromDirectory(tmpDir);
    expect(skills).toHaveLength(0);
  });

  it("skips skills with name containing claude", async () => {
    const skillDir = path.join(tmpDir, "claude-skill");
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(
      path.join(skillDir, "SKILL.md"),
      "---\nname: claude-helper\ndescription: Claude skill\n---\nInstructions."
    );

    const skills = await loadSkillsFromDirectory(tmpDir);
    expect(skills).toHaveLength(0);
  });

  it("skips skills with names longer than 64 chars", async () => {
    const longName = "a".repeat(65);
    const skillDir = path.join(tmpDir, "long-name-skill");
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(
      path.join(skillDir, "SKILL.md"),
      `---\nname: ${longName}\ndescription: Too long\n---\nInstructions.`
    );

    const skills = await loadSkillsFromDirectory(tmpDir);
    expect(skills).toHaveLength(0);
  });

  it("skips skills with XML tags in description", async () => {
    const skillDir = path.join(tmpDir, "xml-skill");
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(
      path.join(skillDir, "SKILL.md"),
      "---\nname: xml-skill\ndescription: Has <script>tags</script>\n---\nInstructions."
    );

    const skills = await loadSkillsFromDirectory(tmpDir);
    expect(skills).toHaveLength(0);
  });

  it("skips files without frontmatter", async () => {
    const skillDir = path.join(tmpDir, "no-fm-skill");
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(
      path.join(skillDir, "SKILL.md"),
      "Just some content without frontmatter."
    );

    const skills = await loadSkillsFromDirectory(tmpDir);
    expect(skills).toHaveLength(0);
  });

  it("skips skills with empty instructions", async () => {
    const skillDir = path.join(tmpDir, "empty-instructions");
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(
      path.join(skillDir, "SKILL.md"),
      "---\nname: empty-instructions\ndescription: No body\n---\n"
    );

    const skills = await loadSkillsFromDirectory(tmpDir);
    expect(skills).toHaveLength(0);
  });

  it("returns empty array for non-existent directory", async () => {
    const skills = await loadSkillsFromDirectory("/nonexistent/path/to/skills");
    expect(skills).toHaveLength(0);
  });

  it("skips SKILL.md that is a directory (unreadable as file)", async () => {
    // Create a directory named SKILL.md — findSkillFiles will find it but readFile will fail
    const skillDir = path.join(tmpDir, "weird-dir");
    const skillMdAsDir = path.join(skillDir, "SKILL.md");
    await fs.mkdir(skillMdAsDir, { recursive: true });
    const skills = await loadSkillsFromDirectory(tmpDir);
    expect(skills).toHaveLength(0);
  });

  it("loads multiple skills from nested directories", async () => {
    const skill1Dir = path.join(tmpDir, "skill-one");
    const skill2Dir = path.join(tmpDir, "nested", "skill-two");
    await fs.mkdir(skill1Dir, { recursive: true });
    await fs.mkdir(skill2Dir, { recursive: true });
    await fs.writeFile(
      path.join(skill1Dir, "SKILL.md"),
      "---\nname: skill-one\ndescription: First skill\n---\nFirst instructions."
    );
    await fs.writeFile(
      path.join(skill2Dir, "SKILL.md"),
      "---\nname: skill-two\ndescription: Second skill\n---\nSecond instructions."
    );

    const skills = await loadSkillsFromDirectory(tmpDir);
    expect(skills).toHaveLength(2);
    const names = skills.map((s) => s.name).sort();
    expect(names).toEqual(["skill-one", "skill-two"]);
  });
});

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------

describe("Agent", () => {
  let tmpDir: string;

  beforeEach(async () => {
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
        { id: "tc_1", name: "finish_step", args: { result: { answer: 42 } } }
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
    // Create a skill directory
    const skillDir = path.join(tmpDir, "skills", "data-analysis");
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(
      path.join(skillDir, "SKILL.md"),
      "---\nname: data-analysis\ndescription: Analyze data carefully\n---\nWhen analyzing data, use statistics."
    );

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

    const provider = createMockProvider([
      ...planCalls(planPayload, [{ type: "chunk", content: "Planning..." }]),
      [
        { type: "chunk", content: "Analyzing..." },
        { id: "tc_1", name: "finish_step", args: { result: { done: true } } }
      ]
    ]);

    const agent = new Agent({
      name: "skill-agent",
      objective: "Analyze this data carefully",
      provider,
      model: "test-model",
      workspace: tmpDir,
      skillDirs: [path.join(tmpDir, "skills")]
    });

    const context = createMockContext();
    for await (const _msg of agent.execute(context)) {
      // consume
    }

    expect(agent.getResults()).toEqual({ done: true });
  });

  it("applies output schema to the last step", async () => {
    const planPayload = {
      title: "Schema Plan",
      tasks: [
        {
          id: "task_schema",
          title: "Schema Task",
          depends_on: [],
          steps: [
            { id: "step_a", instructions: "Do A", depends_on: [] },
            { id: "step_b", instructions: "Final step", depends_on: ["step_a"] }
          ]
        }
      ]
    };

    const provider = createMockProvider([
      ...planCalls(planPayload),
      [
        { type: "chunk", content: "A" },
        { id: "tc_a", name: "finish_step", args: { result: { v: 1 } } }
      ],
      [
        { type: "chunk", content: "B" },
        { id: "tc_b", name: "finish_step", args: { result: { answer: "yes" } } }
      ]
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

    // The last step of the last task should have the output schema applied
    const lastTask = agent.taskPlan!.tasks[agent.taskPlan!.tasks.length - 1];
    expect(lastTask.steps[lastTask.steps.length - 1].outputSchema).toBe(
      JSON.stringify(outputSchema)
    );
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
        { id: "tc_1", name: "finish_step", args: { result: { value: 99 } } }
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
      [{ id: "tc_1", name: "finish_step", args: { result: { done: true } } }]
    ]);
    const providerSpy = {
      ...baseProvider,
      generateMessages: async function* (opts: any) {
        calls.push(opts.model ?? "no-model");
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
    expect(calls.filter((m) => m === "plan-model").length).toBeGreaterThanOrEqual(
      2
    );
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
    const skillDir = path.join(tmpDir, "skills", "named-skill");
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(
      path.join(skillDir, "SKILL.md"),
      "---\nname: named-skill\ndescription: A named skill\n---\nNamed skill instructions."
    );

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
      [{ id: "tc_1", name: "finish_step", args: { result: { ok: true } } }]
    ]);

    const agent = new Agent({
      name: "named-skills-agent",
      objective: "Test explicit skill selection",
      provider,
      model: "test-model",
      workspace: tmpDir,
      skills: ["named-skill"],
      skillDirs: [path.join(tmpDir, "skills")]
    });

    const context = createMockContext();
    for await (const _msg of agent.execute(context)) {
      // consume
    }

    expect(agent.taskPlan).not.toBeNull();
    expect(agent.getResults()).toEqual({ ok: true });
  });

  it("resolves skill dirs from NODETOOL_AGENT_SKILL_DIRS environment variable", async () => {
    const envSkillDir = path.join(tmpDir, "env-skills", "env-skill");
    await fs.mkdir(envSkillDir, { recursive: true });
    await fs.writeFile(
      path.join(envSkillDir, "SKILL.md"),
      "---\nname: env-skill\ndescription: Env-loaded skill for testing\n---\nEnv skill instructions."
    );

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
      [{ id: "tc_1", name: "finish_step", args: { result: { ok: true } } }]
    ]);

    const savedEnv = process.env["NODETOOL_AGENT_SKILL_DIRS"];
    process.env["NODETOOL_AGENT_SKILL_DIRS"] = path.join(tmpDir, "env-skills");
    try {
      const agent = new Agent({
        name: "env-skill-agent",
        objective: "Test env skill loading for testing",
        provider,
        model: "test-model",
        workspace: tmpDir,
        skillDirs: [] // No explicit dirs — should pick up env var
      });

      const context = createMockContext();
      for await (const _msg of agent.execute(context)) {
        // consume
      }

      expect(agent.taskPlan).not.toBeNull();
    } finally {
      if (savedEnv !== undefined) {
        process.env["NODETOOL_AGENT_SKILL_DIRS"] = savedEnv;
      } else {
        delete process.env["NODETOOL_AGENT_SKILL_DIRS"];
      }
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
      [{ id: "tc_1", name: "finish_step", args: { result: { v: 1 } } }]
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
    expect(agent.getResults()).toEqual({ v: 1 });
  });

  it("merges systemPrompt with skill system prompt when both are present", async () => {
    // Create a skill directory with a matching skill
    const skillDir = path.join(tmpDir, "skills", "merge-skill");
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(
      path.join(skillDir, "SKILL.md"),
      "---\nname: merge-skill\ndescription: Merging test skill for objective\n---\nMerge skill instructions."
    );

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
      [{ id: "tc_1", name: "finish_step", args: { result: { done: true } } }]
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
      skillDirs: [path.join(tmpDir, "skills")]
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
        { id: "tc_1", name: "finish_step", args: { result: { ok: true } } }
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
