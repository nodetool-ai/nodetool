/**
 * The `agents` capability module: `run_subtask`, `run_search`,
 * `start_subtask` and `wait_subtasks`.
 *
 * These are the exception to the port. `SubAgentTool` owns the depth gate,
 * the child context, the streamed events and the settlement, and the runner
 * constructs one per turn over that turn's provider, model, toolbelt snapshot
 * and forwarder — so the classes stay untouched and the capability is the
 * registry-visible face over them. What has to hold is therefore: the spec
 * matches the class it fronts, the category matches the classification map, a
 * run with no `subAgent` says so, and a real spawn through the capability
 * behaves like a spawn through the class — including the tool-call id the
 * renderer nests child cards under.
 */

import { describe, expect, it, vi } from "vitest";
import { BaseProvider, ProcessingContext } from "@nodetool-ai/runtime";
import type { ProcessingMessage } from "@nodetool-ai/protocol";
import {
  AGENT_CAPABILITIES,
  runSearch,
  runSubtask,
  startSubtask,
  waitSubtasks,
  createPlan,
  executePlan
} from "../src/capabilities/agents.js";
import {
  capabilityModuleDrift,
  loadCapabilityModule
} from "../src/capabilities/registry.js";
import { UNGATED, createCapabilityRun } from "../src/capabilities/invoke.js";
import { permissionCategoryFor } from "../src/tools/tool-permissions.js";
import type { SubAgentToolRuntime } from "../src/subagent.js";
import { BackgroundSubtaskRegistry } from "../src/background-subtasks.js";
import {
  SUBTASK_DEPTH_KEY,
  TOOL_CALL_ID_FIELD
} from "../src/tools/subtask-fields.js";
import { RunSubtaskTool } from "../src/tools/run-subtask-tool.js";
import { createMockContext } from "./_helpers/mock-context.js";
import { isString } from "../src/utils/type-guards.js";
import { RunSearchTool } from "../src/tools/run-search-tool.js";
import { StartSubtaskTool } from "../src/tools/start-subtask-tool.js";

function makeCtx(): ProcessingContext {
  return new ProcessingContext({ jobId: "test-job", userId: "test" });
}

/**
 * Minimal mock BaseProvider — the same shape `run-subtask-tool.test.ts` uses.
 * It replays a queued sequence of stream events per `generateMessages` call.
 */
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
    generateLoop(args: unknown) {
      return (
        BaseProvider.prototype as { generateLoop: (a: unknown) => unknown }
      ).generateLoop.call(this, args);
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

function stubRuntime(
  overrides: Partial<SubAgentToolRuntime> = {}
): SubAgentToolRuntime {
  return {
    provider: createMockProvider([]),
    model: "mock",
    parentTools: () => [],
    forwardMessage: () => {},
    ...overrides
  };
}

describe("the agents capability module", () => {
  it("registers without drift and exports every delegation wire name", async () => {
    expect(await capabilityModuleDrift()).toEqual([]);
    const mod = await loadCapabilityModule("agents");
    expect(mod.exports.map((e) => e.spec.name)).toEqual([
      "run_subtask",
      "run_search",
      "start_subtask",
      "wait_subtasks",
      "create_plan",
      "execute_plan"
    ]);
  });

  it("classes each exactly as the permission map does", () => {
    for (const entry of AGENT_CAPABILITIES) {
      expect([entry.spec.name, entry.spec.category]).toEqual([
        entry.spec.name,
        permissionCategoryFor(entry.spec.name)
      ]);
    }
    // Delegating and planning have no side effect of their own; running a plan
    // is every side effect in it, which is what the gate must see.
    for (const entry of AGENT_CAPABILITIES) {
      expect([entry.spec.name, entry.spec.category]).toEqual([
        entry.spec.name,
        entry.spec.name === "execute_plan" ? "external" : "read"
      ]);
    }
  });

  it("carries the surface of the classes it fronts", () => {
    const subtask = new RunSubtaskTool(stubRuntime());
    expect(runSubtask.spec.name).toBe(subtask.name);
    expect(runSubtask.spec.description).toBe(subtask.description);
    expect(runSubtask.spec.inputSchema).toEqual(subtask.inputSchema);
    expect(runSubtask.spec.userMessage?.({ description: "Research X" })).toBe(
      subtask.userMessage({ description: "Research X" })
    );

    const search = new RunSearchTool(stubRuntime());
    expect(runSearch.spec.name).toBe(search.name);
    expect(runSearch.spec.description).toBe(search.description);
    expect(runSearch.spec.inputSchema).toEqual(search.inputSchema);
    expect(runSearch.spec.userMessage?.({ query: "where is X" })).toBe(
      search.userMessage({ query: "where is X" })
    );

    const start = new StartSubtaskTool(stubRuntime());
    expect(startSubtask.spec.name).toBe(start.name);
    expect(startSubtask.spec.description).toBe(start.description);
    expect(startSubtask.spec.inputSchema).toEqual(start.inputSchema);
    expect(
      startSubtask.spec.userMessage?.({ description: "Research X" })
    ).toBe(start.userMessage({ description: "Research X" }));
  });

  it("names the missing field when the run carries no sub-agent runtime", async () => {
    const run = createCapabilityRun({ context: makeCtx(), gate: UNGATED });
    await expect(run.invoke("run_subtask", {})).rejects.toThrow(/`subAgent`/);
    await expect(run.invoke("run_search", {})).rejects.toThrow(/`subAgent`/);
    await expect(run.invoke("start_subtask", {})).rejects.toThrow(/`subAgent`/);
    await expect(run.invoke("wait_subtasks", {})).rejects.toThrow(/`subAgent`/);
  });

  it("spawns a child loop and nests its events under the parent call", async () => {
    const forwarded: ProcessingMessage[] = [];
    const run = createCapabilityRun({
      context: makeCtx(),
      gate: UNGATED,
      subAgent: stubRuntime({
        provider: createMockProvider([
          [{ type: "chunk", content: "subtask answer", done: true }]
        ]),
        forwardMessage: (m) => {
          forwarded.push(m);
        },
        maxDepth: 3
      })
    });

    const result = await run.invoke("run_subtask", {
      description: "answer-once",
      prompt: "Just say something",
      [TOOL_CALL_ID_FIELD]: "tc_outer"
    });

    expect(result).not.toBeNull();
    const nested = forwarded.find(
      (m) =>
        (m as { parent_tool_call_id?: string }).parent_tool_call_id ===
        "tc_outer"
    ) as { subtask_depth?: number } | undefined;
    expect(nested).toBeDefined();
    expect(nested?.subtask_depth).toBe(1);
  });

  it("refuses a spawn at the recursion limit, like the class does", async () => {
    const context = makeCtx();
    context.set(SUBTASK_DEPTH_KEY, 2);
    const run = createCapabilityRun({
      context,
      gate: UNGATED,
      subAgent: stubRuntime({ maxDepth: 2 })
    });

    const result = (await run.invoke("run_subtask", {
      description: "deep",
      prompt: "Try to recurse"
    })) as Record<string, unknown>;
    expect(result.error).toBe("max_recursion_depth_reached");
    expect(result.max_depth).toBe(2);
  });

  it("returns the search tool's own refusal for an empty query", async () => {
    const run = createCapabilityRun({
      context: makeCtx(),
      gate: UNGATED,
      subAgent: stubRuntime()
    });
    const result = (await run.invoke("run_search", { query: "  " })) as Record<
      string,
      unknown
    >;
    expect(result.error).toBe("missing_query");
  });

  it("spawns in the background and collects through the same registry", async () => {
    const registry = new BackgroundSubtaskRegistry();
    const forwarded: ProcessingMessage[] = [];
    const run = createCapabilityRun({
      context: makeCtx(),
      gate: UNGATED,
      subAgent: stubRuntime({
        provider: createMockProvider([
          [{ type: "chunk", content: "background answer", done: true }]
        ]),
        forwardMessage: (m) => {
          forwarded.push(m);
        },
        background: registry
      })
    });

    const receipt = (await run.invoke("start_subtask", {
      description: "fan-out worker",
      prompt: "work while the parent moves on",
      [TOOL_CALL_ID_FIELD]: "tc_root"
    })) as Record<string, unknown>;
    expect(receipt.status).toBe("running");
    expect(registry.runningCount).toBe(1);

    const waited = (await run.invoke("wait_subtasks", {})) as {
      subtasks: Array<Record<string, unknown>>;
      all_settled: boolean;
    };
    expect(waited.all_settled).toBe(true);
    expect(waited.subtasks).toHaveLength(1);
    expect(waited.subtasks[0]).toMatchObject({
      subtask_id: receipt.subtask_id,
      status: "completed"
    });
    expect(String(waited.subtasks[0].result)).toContain("background answer");

    const nested = forwarded.find(
      (m) =>
        (m as { parent_tool_call_id?: string }).parent_tool_call_id ===
        "tc_root"
    ) as { subtask_depth?: number } | undefined;
    expect(nested?.subtask_depth).toBe(1);
  });

  it("refuses background delegation when the host builds no registry", async () => {
    const spawn = createCapabilityRun({
      context: makeCtx(),
      gate: UNGATED,
      subAgent: stubRuntime()
    });
    const result = (await spawn.invoke("start_subtask", {
      description: "d",
      prompt: "p"
    })) as Record<string, unknown>;
    expect(result.error).toBe("background_unavailable");

    const wait = createCapabilityRun({
      context: makeCtx(),
      gate: UNGATED,
      subAgent: stubRuntime()
    });
    const waited = (await wait.invoke("wait_subtasks", {})) as Record<
      string,
      unknown
    >;
    expect(waited.error).toBe("background_unavailable");
  });
});

describe("create_plan", () => {
  /** A provider that drives the plan builder: two tasks, then finish. */
  function planningProvider(): BaseProvider {
    const script = [
      {
        id: "c1",
        name: "add_task",
        args: {
          id: "gather",
          title: "Gather the inputs",
          depends_on: [],
          steps: [
            { id: "gather_read", instructions: "Read the files", depends_on: [] }
          ]
        }
      },
      {
        id: "c2",
        name: "add_task",
        args: {
          id: "draft",
          title: "Draft the output",
          depends_on: ["gather"],
          steps: [
            { id: "draft_write", instructions: "Write it", depends_on: [] }
          ]
        }
      },
      { id: "c3", name: "finish_plan", args: { title: "A Plan" } }
    ];
    return {
      provider: "planning-mock",
      hasToolSupport: async () => true,
      async *generateMessages() {
        yield { type: "chunk", content: "", done: true };
      },
      async *generateMessagesTraced() {
        yield { type: "chunk", content: "", done: true };
      },
      async *generateLoop(args: {
        tools?: Array<{
          name: string;
          execute?: (a: Record<string, unknown>) => Promise<unknown>;
        }>;
      }) {
        const byName = new Map((args.tools ?? []).map((t) => [t.name, t]));
        for (const call of script) {
          yield call;
          await byName.get(call.name)?.execute?.(call.args);
        }
        yield { type: "chunk", content: "", done: true };
      }
    } as unknown as BaseProvider;
  }

  it("returns the plan's shape and executes nothing", async () => {
    const forwarded: ProcessingMessage[] = [];
    const ran: string[] = [];
    const runtime = stubRuntime({
      provider: planningProvider(),
      // A belt whose tools would record a call if the planner ever ran one.
      parentTools: () =>
        [
          {
            name: "write_file",
            description: "Write a file",
            inputSchema: { type: "object", properties: {} },
            process: async () => {
              ran.push("write_file");
              return {};
            },
            toProviderTool() {
              return {
                name: this.name,
                description: this.description,
                inputSchema: this.inputSchema
              };
            }
          }
        ] as never,
      forwardMessage: (msg) => {
        forwarded.push(msg);
      }
    });

    const result = (await createPlan.impl(
      createCapabilityRun({
        context: makeCtx(),
        gate: UNGATED,
        subAgent: runtime
      }),
      { objective: "Do the thing" }
    )) as Record<string, unknown>;

    expect(result["title"]).toBe("A Plan");
    expect(result["task_count"]).toBe(2);
    expect(result["step_count"]).toBe(2);
    expect(result["parallelizable"]).toBe(1);
    expect(result["executed"]).toBe(false);
    // No step of the plan ran, and no tool on the belt was called.
    expect(ran).toEqual([]);
  });

  it("streams the plan into the conversation as it is built", async () => {
    const forwarded: ProcessingMessage[] = [];
    const result = (await createPlan.impl(
      createCapabilityRun({
        context: makeCtx(),
        gate: UNGATED,
        subAgent: stubRuntime({
          provider: planningProvider(),
          forwardMessage: (msg) => {
            forwarded.push(msg);
          }
        })
      }),
      { objective: "Do the thing" }
    )) as Record<string, unknown>;

    expect(result["title"]).toBe("A Plan");
    const types = forwarded.map((m) => m.type);
    expect(types).toContain("planning_update");
    expect(types).toContain("task_update");
  });

  it("refuses an empty objective and a run with no sub-agent runtime", async () => {
    const empty = (await createPlan.impl(
      createCapabilityRun({
        context: makeCtx(),
        gate: UNGATED,
        subAgent: stubRuntime()
      }),
      { objective: "   " }
    )) as Record<string, unknown>;
    expect(empty["error"]).toBe("invalid_objective");

    await expect(
      createPlan.impl(
        createCapabilityRun({ context: makeCtx(), gate: UNGATED }),
        { objective: "Do the thing" }
      )
    ).rejects.toThrow(/create_plan/);
  });

  it("reports a planner that commits nothing instead of inventing a plan", async () => {
    const silent = {
      provider: "silent",
      hasToolSupport: async () => true,
      async *generateMessages() {
        yield { type: "chunk", content: "", done: true };
      },
      async *generateMessagesTraced() {
        yield { type: "chunk", content: "", done: true };
      },
      async *generateLoop() {
        yield { type: "chunk", content: "", done: true };
      }
    } as unknown as BaseProvider;

    const result = (await createPlan.impl(
      createCapabilityRun({
        context: makeCtx(),
        gate: UNGATED,
        subAgent: stubRuntime({ provider: silent })
      }),
      { objective: "Do the thing" }
    )) as Record<string, unknown>;
    expect(result["error"]).toBe("plan_failed");
  });
});

describe("execute_plan", () => {
  /**
   * A provider that finishes each prose step from a plain assistant message,
   * except for the step ids in `failing`, where it blows up the way a real
   * provider outage does. It records the step it was asked about and the tool
   * names it was offered, so a test can assert both the order steps ran in and
   * the belt each child loop actually saw.
   */
  function stepProvider(failing: string[] = []) {
    const seenSteps: string[] = [];
    const offeredTools: string[][] = [];
    const promptText: string[] = [];
    const provider = {
      provider: "step-mock",
      hasToolSupport: async () => true,
      async *generateMessages(opts: {
        messages?: Array<{ content?: unknown }>;
        tools?: Array<{ name: string }>;
      }) {
        const text = (opts.messages ?? [])
          .map((m) => (isString(m.content) ? m.content : ""))
          .join(" ");
        offeredTools.push((opts.tools ?? []).map((t) => t.name));
        promptText.push(text);
        const match = text.match(/STEP:([a-z_0-9]+)/);
        if (match) seenSteps.push(match[1]);
        const broken = failing.find((id) => text.includes(`STEP:${id}`));
        if (broken) {
          throw new Error(`provider failed on ${broken}`);
        }
        yield {
          type: "message" as const,
          message: { role: "assistant", content: `did ${match?.[1] ?? "?"}` }
        };
      },
      async *generateMessagesTraced(...args: unknown[]) {
        yield* (
          provider as {
            generateMessages: (...a: unknown[]) => AsyncGenerator<unknown>;
          }
        ).generateMessages(...args);
      },
      generateLoop(args: unknown) {
        return (
          BaseProvider.prototype as { generateLoop: (a: unknown) => unknown }
        ).generateLoop.call(provider, args);
      },
      async generateMessageTraced() {
        return null;
      },
      generateMessage: vi.fn(),
      getAvailableLanguageModels: vi.fn().mockResolvedValue([]),
      getContainerEnv: () => ({}),
      isContextLengthError: () => false
    } as unknown as BaseProvider & { provider: string };
    return { provider, seenSteps, offeredTools, promptText };
  }

  /** A named tool the child loops should see on their belt. */
  function namedTool(name: string) {
    return {
      name,
      description: `the ${name} tool`,
      inputSchema: { type: "object", properties: {} },
      process: async () => "ok",
      toProviderTool() {
        return {
          name: this.name,
          description: this.description,
          inputSchema: this.inputSchema
        };
      }
    };
  }

  /** Two tasks, the second depending on the first. */
  function twoTaskPlan(): Record<string, unknown> {
    return {
      title: "A Plan",
      tasks: [
        {
          id: "gather",
          title: "Gather the inputs",
          depends_on: [],
          steps: [
            { id: "gather_read", instructions: "STEP:gather_read", depends_on: [] }
          ]
        },
        {
          id: "draft",
          title: "Draft the output",
          depends_on: ["gather"],
          steps: [
            { id: "draft_write", instructions: "STEP:draft_write", depends_on: [] }
          ]
        }
      ]
    };
  }

  async function runPlan(
    plan: Record<string, unknown>,
    opts: {
      failing?: string[];
      parentTools?: () => unknown[];
    } = {}
  ) {
    const { provider, seenSteps, offeredTools, promptText } = stepProvider(
      opts.failing
    );
    const forwarded: ProcessingMessage[] = [];
    const result = (await executePlan.impl(
      createCapabilityRun({
        context: createMockContext() as never,
        gate: UNGATED,
        subAgent: stubRuntime({
          provider,
          ...(opts.parentTools
            ? { parentTools: opts.parentTools as never }
            : {}),
          forwardMessage: (msg) => {
            forwarded.push(msg);
          }
        })
      }),
      plan
    )) as Record<string, unknown>;
    return { result, forwarded, seenSteps, offeredTools, promptText };
  }

  it("runs both tasks in dependency order and returns each one's result", async () => {
    const { result, forwarded, seenSteps } = await runPlan(twoTaskPlan());

    expect(result["executed"]).toBe(true);
    expect(result["title"]).toBe("A Plan");
    expect(result["task_count"]).toBe(2);
    expect(result["completed_count"]).toBe(2);
    expect(result["failed_count"]).toBe(0);
    expect(result["tasks"]).toEqual([
      { id: "gather", title: "Gather the inputs", status: "completed" },
      { id: "draft", title: "Draft the output", status: "completed" }
    ]);
    // The dependent ran after the task it depends on, not concurrently.
    expect(seenSteps).toEqual(["gather_read", "draft_write"]);
    // Every task's result comes back, keyed by task id.
    expect(Object.keys(result["results"] as object).sort()).toEqual([
      "draft",
      "gather"
    ]);
    // The run streams: the thread sees each task resolve as it happens.
    expect(forwarded.some((m) => m.type === "task_update")).toBe(true);
  });

  it("reports a failing step as its task failing, naming the step and the error", async () => {
    const { result, forwarded } = await runPlan(twoTaskPlan(), {
      failing: ["gather_read"]
    });

    expect(result["executed"]).toBe(true);
    expect(result["completed_count"]).toBe(0);
    expect(result["failed_count"]).toBe(2);
    const tasks = result["tasks"] as Array<Record<string, unknown>>;
    expect(tasks[0]["status"]).toBe("failed");
    expect(tasks[0]["error"]).toContain("gather_read");
    expect(tasks[0]["error"]).toContain("provider failed on gather_read");
    // The dependent is terminal too, and says what blocked it.
    expect(tasks[1]["status"]).toBe("failed");
    expect(tasks[1]["error"]).toContain("gather");
    // Nothing is reported as a result, and the failure reached the thread.
    expect(result["results"]).toEqual({});
    expect(
      forwarded.some(
        (m) => m.type === "task_update" && m.event === "task_failed"
      )
    ).toBe(true);
  });

  it("never hands the plan capabilities to the child loops", async () => {
    const { result, promptText } = await runPlan(twoTaskPlan(), {
      parentTools: () => [
        namedTool("execute_plan"),
        namedTool("create_plan"),
        namedTool("ledger_reconcile")
      ]
    });

    expect(result["completed_count"]).toBe(2);
    const prompts = promptText.join("\n");
    // A step that re-runs or re-plans the plan it belongs to is a loop, so
    // neither plan capability reaches the child's belt — while the rest of the
    // parent belt does.
    expect(prompts).not.toContain("execute_plan");
    expect(prompts).not.toContain("create_plan");
    expect(prompts).toContain("ledger_reconcile");
  });

  describe("refuses a plan it cannot run, naming the offender", () => {
    async function reject(plan: Record<string, unknown>) {
      const { result, seenSteps } = await runPlan(plan);
      expect(result["error"]).toBe("invalid_plan");
      expect(result["executed"]).toBe(false);
      // Nothing runs before the plan is known to be sound.
      expect(seenSteps).toEqual([]);
      return (result["issues"] as string[]).join(" ");
    }

    const step = (id: string) => ({
      id,
      instructions: `STEP:${id}`,
      depends_on: []
    });

    it("a plan with no tasks", async () => {
      const issues = await reject({ title: "Empty", tasks: [] });
      expect(issues).toContain("at least one task");
    });

    it("a task that is not an object, or has no id", async () => {
      expect(
        ((
          await runPlan({ title: "T", tasks: ["gather"] })
        ).result["issues"] as string[]).join(" ")
      ).toContain("Task #1");
      const issues = await reject({
        title: "T",
        tasks: [{ title: "No id", steps: [step("a")] }]
      });
      expect(issues).toContain("Task #1 has no `id`");
    });

    it("a duplicate task id", async () => {
      const issues = await reject({
        title: "T",
        tasks: [
          { id: "gather", title: "One", depends_on: [], steps: [step("a")] },
          { id: "gather", title: "Two", depends_on: [], steps: [step("b")] }
        ]
      });
      expect(issues).toContain("'gather'");
      expect(issues).toContain("already added");
    });

    it("a duplicate step id", async () => {
      const issues = await reject({
        title: "T",
        tasks: [
          { id: "gather", title: "One", depends_on: [], steps: [step("s1")] },
          { id: "draft", title: "Two", depends_on: [], steps: [step("s1")] }
        ]
      });
      expect(issues).toContain("'s1'");
    });

    it("a dependency on a task the plan does not contain", async () => {
      const issues = await reject({
        title: "T",
        tasks: [
          {
            id: "draft",
            title: "Two",
            depends_on: ["ghost"],
            steps: [step("s1")]
          }
        ]
      });
      expect(issues).toContain("'draft'");
      expect(issues).toContain("'ghost'");
      expect(issues).toContain("not in the plan");
    });

    it("a cycle", async () => {
      const issues = await reject({
        title: "T",
        tasks: [
          { id: "a", title: "A", depends_on: ["b"], steps: [step("s1")] },
          { id: "b", title: "B", depends_on: ["a"], steps: [step("s2")] }
        ]
      });
      expect(issues).toContain("Circular dependency");
      expect(issues).toContain("a, b");
    });

    it("a `tasks` that is not an array at all", async () => {
      const { result } = await runPlan({ title: "T", tasks: "gather, draft" });
      expect(result["error"]).toBe("invalid_plan");
      expect((result["issues"] as string[]).join(" ")).toContain(
        "`tasks` array"
      );
    });
  });

  it("accepts a plan whose tasks arrive after their dependents", async () => {
    const plan = twoTaskPlan();
    (plan["tasks"] as unknown[]).reverse();
    const { result, seenSteps } = await runPlan(plan);
    expect(result["completed_count"]).toBe(2);
    expect(seenSteps).toEqual(["gather_read", "draft_write"]);
  });

  it("refuses a run with no sub-agent runtime, by name", async () => {
    await expect(
      executePlan.impl(
        createCapabilityRun({
          context: createMockContext() as never,
          gate: UNGATED
        }),
        twoTaskPlan()
      )
    ).rejects.toThrow(/execute_plan/);
  });
});
