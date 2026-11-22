/**
 * The product-chat job harness drives a real chat turn: the job's bridge is
 * the browser, a `ui_*` call made inside `execute_code` reaches it as a
 * `tool_call` frame, and the job's own checks grade the world afterwards.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { initTestDb } from "@nodetool-ai/models";
import { BaseProvider } from "@nodetool-ai/runtime";
import { findJob } from "@nodetool-ai/agents";
import { runChatJob, jobUiContext, unservedToolError } from "../src/chat-jtbd.js";
import { borrowedLoopBudgetMembers } from "./chat-turn-test-harness.js";

/** A provider that runs `code` as one `execute_code` action, then answers. */
function scriptedProvider(code: string | null) {
  let round = 0;
  return {
    provider: "mock",
    async *generateMessages() {},
    async *generateMessagesTraced() {
      if (code !== null && round++ === 0) {
        yield { id: "tc1", name: "execute_code", args: { title: "build", code } };
      } else {
        yield { type: "chunk", content: "Done.", done: true };
      }
    },
    async generateMessageTraced() {
      return {};
    },
    generateMessage: vi.fn(),
    hasToolSupport: async () => true,
    getAvailableLanguageModels: async () => [],
    getAvailableImageModels: async () => [],
    getAvailableVideoModels: async () => [],
    getAvailableTTSModels: async () => [],
    getAvailableASRModels: async () => [],
    getAvailableEmbeddingModels: async () => [],
    getContainerEnv: () => ({}),
    generateLoop: BaseProvider.prototype.generateLoop,
    ...borrowedLoopBudgetMembers
  } as never;
}

/** A provider that runs each of `codes` as one action, a round each, then answers. */
function roundsProvider(codes: readonly string[]) {
  let round = 0;
  return {
    ...(scriptedProvider(null) as object),
    async *generateMessagesTraced() {
      const code = codes[round];
      round++;
      if (code !== undefined) {
        yield { id: `tc${round}`, name: "execute_code", args: { title: `step ${round}`, code } };
      } else {
        yield { type: "chunk", content: "Done.", done: true };
      }
    }
  } as never;
}

const BUILD_SCENE = `import { ui_3d_add_object, ui_3d_set_transform } from "@nodetool-ai/sandbox-nodetool/ui";
await ui_3d_add_object({ kind: "box", name: "Table" });
await ui_3d_add_object({ kind: "sphere", name: "Apple" });
await ui_3d_set_transform({ target: "Apple", position: [0, 1, 0] });
await ui_3d_add_object({ kind: "cylinder", name: "Cup" });
await ui_3d_set_transform({ target: "Cup", position: [0.5, 1, 0] });
await ui_3d_add_object({ kind: "directionalLight", name: "Key light" });
return "built";`;

describe("product-chat job harness", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("routes ui_* calls from a code action to the job's bridge and grades the result", async () => {
    const job = findJob("model3d-compose-scene");
    if (!job) throw new Error("job missing");
    const report = await runChatJob(job, {
      provider: scriptedProvider(BUILD_SCENE),
      model: "m",
      timeoutMs: 30_000
    });
    expect(report.completed).toBe(true);
    expect(report.toolCalls.map((c) => c.name)).toEqual([
      "ui_3d_add_object",
      "ui_3d_add_object",
      "ui_3d_set_transform",
      "ui_3d_add_object",
      "ui_3d_set_transform",
      "ui_3d_add_object"
    ]);
    expect(report.toolCalls.every((c) => c.ok)).toBe(true);
    expect(report.achieved).toBe(true);
  });

  it("counts repeated calls, ReferenceErrors and refused imports per run", async () => {
    const job = findJob("model3d-compose-scene");
    if (!job) throw new Error("job missing");
    const report = await runChatJob(job, {
      provider: roundsProvider([
        `import { ui_3d_add_object } from "@nodetool-ai/sandbox-nodetool/ui";
await ui_3d_add_object({ kind: "box", name: "Table" });`,
        `// again
import { ui_3d_add_object } from "@nodetool-ai/sandbox-nodetool/ui";
await ui_3d_add_object({kind: "box", name: "Table"});`,
        "return not_a_capability();",
        `import { ui_3d_add_object } from "@nodetool-ai/sandbox-nodetool/not_a_module";
await ui_3d_add_object({ kind: "sphere", name: "Apple" });`
      ]),
      model: "m",
      timeoutMs: 30_000
    });
    expect(report.completed).toBe(true);
    expect(report.behaviour).toEqual({
      repeatedCalls: 1,
      referenceErrors: 1,
      importErrors: 1,
      unknownOps: 0,
      revisionConflicts: 0
    });
  });

  it("fails a job whose turn only talks", async () => {
    const job = findJob("model3d-compose-scene");
    if (!job) throw new Error("job missing");
    const report = await runChatJob(job, {
      provider: scriptedProvider(null),
      model: "m",
      timeoutMs: 30_000
    });
    expect(report.completed).toBe(true);
    expect(report.toolCalls).toHaveLength(0);
    expect(report.achieved).toBe(false);
    expect(report.reply).toContain("Done.");
  });

  it("skips a job whose tool names a server capability owns", async () => {
    const job = findJob("model3d-compose-scene");
    if (!job) throw new Error("job missing");
    const report = await runChatJob(job, {
      provider: scriptedProvider(null),
      model: "m",
      serverToolNames: new Set(["ui_3d_add_object"])
    });
    expect(report.skipped).toBe(true);
    expect(report.skipReason).toContain("ui_3d_add_object");
  });

  it("focuses the job's surface the way the browser would", () => {
    const job = findJob("timeline-assemble-cut");
    if (!job) throw new Error("job missing");
    expect(jobUiContext(job)?.focused?.type).toBe("timeline");
    const scene = findJob("model3d-compose-scene");
    if (!scene) throw new Error("job missing");
    expect(jobUiContext(scene)).toEqual({ source: "model3d_assistant" });
  });

  it("answers a browser tool the job does not serve with what is open", () => {
    const job = findJob("timeline-assemble-cut");
    if (!job) throw new Error("job missing");
    expect(unservedToolError("ui_svg_save", jobUiContext(job), ["ui_timeline_get_state", "ui_timeline_add_clip"])).toBe(
      'ui_svg_save has nothing to act on: the document it edits is not open. The open document is the timeline "timeline-eval", ' +
        "and the tools that act on it are ui_timeline_get_state, ui_timeline_add_clip."
    );
  });
});
