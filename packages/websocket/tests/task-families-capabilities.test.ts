/**
 * Capability tasks run against the server: each world is a fresh user seeded
 * through the capabilities, and the checks read that user's rows back. For
 * every family and many seeds, the reference solution must pass every check
 * and an untouched world must fail at least one. One task also runs through a
 * real product chat turn, to prove the grade sees what the chat path wrote.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { initTestDb } from "@nodetool-ai/models";
import { BaseProvider } from "@nodetool-ai/runtime";
import { capabilityModuleOf, listCapabilitySpecs } from "@nodetool-ai/agents";
import { sandboxCapabilitySpecifier } from "@nodetool-ai/protocol";
import { runChatJob } from "../src/chat-jtbd.js";
import { Picker, generateTasks, seededRandom } from "../src/finetune/task-families.js";
import {
  CAPABILITY_FAMILIES,
  SKILL_CREATE,
  WORKFLOW_BUILD,
  holdsValue,
  namesValue,
  sameDescription
} from "../src/finetune/families/capabilities.js";
import { borrowedLoopBudgetMembers } from "./chat-turn-test-harness.js";

const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);

// Every world is its own user, so one database serves the whole file without
// one task seeing another's rows.
beforeAll(() => {
  initTestDb();
});

describe("memory and skill text matching", () => {
  it("reads a value marked as replaced as gone, and an alias as the value", () => {
    expect(holdsValue("I prefer answers in French, not Japanese.", "Japanese")).toBe(false);
    expect(holdsValue("I prefer answers in French, not Japanese.", "French")).toBe(true);
    expect(holdsValue("My dog is called Juno (previously Biscuit).", "Biscuit")).toBe(false);
    expect(holdsValue("Je préfère les réponses en français.", "French")).toBe(true);
    expect(holdsValue("I prefer answers in Japanese.", "Japanese")).toBe(true);
    // A marker does not reach past the end of its sentence.
    expect(holdsValue("Previously Japanese. French is preferred now.", "French")).toBe(true);
    // "from X to Y": the clause ends at "to", so Y is current.
    expect(holdsValue("I moved from Lisbon to Berlin.", "Berlin")).toBe(true);
    expect(holdsValue("I moved from Lisbon to Berlin.", "Lisbon")).toBe(false);
    expect(holdsValue("Formerly Lisbon, currently Berlin.", "Berlin")).toBe(true);
  });

  it("treats any mention as remembered when the user asked to forget", () => {
    expect(namesValue("My name was Sam.", "Sam")).toBe(true);
    expect(namesValue("I live in Berlin.", "Sam")).toBe(false);
  });

  it("compares descriptions without a closing full stop or extra whitespace", () => {
    expect(sameDescription("How we design video thumbnails.", "How we design video thumbnails")).toBe(true);
    expect(sameDescription("  How we  design video thumbnails ", "How we design video thumbnails")).toBe(true);
    expect(sameDescription("How we write podcast show notes. Use whenever drafting.", "How we write podcast show notes")).toBe(false);
    expect(sameDescription(undefined, "How we write podcast show notes")).toBe(false);
  });
});

describe.each(CAPABILITY_FAMILIES.map((family) => [family.id, family] as const))("%s", (_id, family) => {
  it("is solvable with the capabilities", async () => {
    for (const seed of SEEDS) {
      const outcomes = await family.solveAndGrade(seed, true);
      const failed = outcomes.filter((o) => !o.passed).map((o) => o.name);
      expect({ seed, failed }).toEqual({ seed, failed: [] });
    }
  });

  it("fails an untouched world", async () => {
    for (const seed of SEEDS) {
      const outcomes = await family.solveAndGrade(seed, false);
      expect({ seed, anyFailed: outcomes.some((o) => !o.passed) }).toEqual({ seed, anyFailed: true });
    }
  });

  it("exposes no browser tools, so the chat path runs the job", async () => {
    const world = await family.draw(1, "probe").job.start();
    expect(world.tools).toEqual([]);
  });
});

describe("generated capability tasks", () => {
  it("are deterministic and have no duplicate requests", () => {
    const a = generateTasks(CAPABILITY_FAMILIES, 30);
    const b = generateTasks(CAPABILITY_FAMILIES, 30);
    expect(a.map((t) => t.objective)).toEqual(b.map((t) => t.objective));
    expect(new Set(a.map((t) => t.objective)).size).toBe(a.length);
    expect(a.length).toBeGreaterThan(CAPABILITY_FAMILIES.length * 20);
  });

  it("call only capabilities the server registers", async () => {
    const registered = new Set(listCapabilitySpecs().map((s) => s.name));
    const used = new Set<string>();
    for (const task of [WORKFLOW_BUILD, SKILL_CREATE].map((f) => f.make(new Picker(seededRandom(3))))) {
      await task.solve(async (name) => {
        used.add(name);
        return {};
      });
    }
    expect(used.size).toBeGreaterThan(0);
    for (const name of used) expect(registered.has(name)).toBe(true);
  });
});

/** A provider that runs `code` as one `execute_code` action, then answers. */
function scriptedProvider(code: string) {
  let round = 0;
  return {
    provider: "mock",
    async *generateMessages() {},
    async *generateMessagesTraced() {
      if (round++ === 0) {
        yield { id: "tc1", name: "execute_code", args: { title: "do it", code } };
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

/** The reference solution of a task that reads nothing back, as guest code. */
async function solutionAsCode(solve: (call: (name: string, args: Record<string, unknown>) => Promise<unknown>) => Promise<void>): Promise<string> {
  const calls: Array<[string, Record<string, unknown>]> = [];
  await solve(async (name, args) => {
    calls.push([name, args]);
    return {};
  });
  const imports = [...new Set(calls.map(([name]) => name))].map(
    (name) => `import { ${name} } from "${sandboxCapabilitySpecifier(capabilityModuleOf(name)!)}";`
  );
  const body = calls.map(([name, args]) => `await ${name}(${JSON.stringify(args)});`);
  return [...imports, ...body, `return "ok";`].join("\n");
}

describe("capability task through the product chat path", () => {
  it.each([WORKFLOW_BUILD, SKILL_CREATE])("grades what a chat turn's code action wrote ($id)", async (family) => {
    // The first task generateTasks draws for this family, and the same draw
    // made directly, so the test can turn its reference solution into code.
    const index = CAPABILITY_FAMILIES.findIndex((f) => f.id === family.id);
    const job = generateTasks(CAPABILITY_FAMILIES, 1)[index]!;
    const task = family.make(new Picker(seededRandom(100_003 + index * 10_007)));
    expect(task.objective).toBe(job.objective);
    const code = await solutionAsCode(task.solve);

    const report = await runChatJob(job, { provider: scriptedProvider(code), model: "m", timeoutMs: 60_000 });
    expect(report.completed).toBe(true);
    expect(report.outcomes.filter((o) => !o.passed).map((o) => o.name)).toEqual([]);
    expect(report.achieved).toBe(true);

    const idle = await runChatJob(job, { provider: scriptedProvider(`return "nothing";`), model: "m", timeoutMs: 60_000 });
    expect(idle.achieved).toBe(false);
  });
});
