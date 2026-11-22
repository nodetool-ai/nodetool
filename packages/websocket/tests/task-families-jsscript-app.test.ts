/**
 * JS script and app task families: for many seeds, the reference solution
 * passes every check and an untouched world fails one. A repair task's bug
 * must be real (its saved tests fail before the fix), and no family may use
 * a tool name the chat dispatcher routes to the server.
 */
import { describe, it, expect } from "vitest";
import { listCapabilitySpecs } from "@nodetool-ai/agents";
import { Picker, generateTasks, seededRandom } from "../src/finetune/task-families.js";
import { APP_BUILD, APP_EDIT, JSSCRIPT_APP_FAMILIES } from "../src/finetune/families/jsscript-app.js";

const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);

describe.each(JSSCRIPT_APP_FAMILIES.map((family) => [family.id, family] as const))("%s", (_id, family) => {
  it("is solvable with the tool contracts", async () => {
    for (const seed of SEEDS) {
      const outcomes = await family.solveAndGrade(seed, true);
      const failed = outcomes.filter((o) => !o.passed).map((o) => o.name);
      expect({ seed, failed }).toEqual({ seed, failed: [] });
    }
  }, 120_000);

  it("fails an untouched world", async () => {
    for (const seed of SEEDS) {
      const outcomes = await family.solveAndGrade(seed, false);
      expect({ seed, anyFailed: outcomes.some((o) => !o.passed) }).toEqual({ seed, anyFailed: true });
    }
  }, 120_000);
});

describe("jsscript families", () => {
  it("grade behaviour: an untouched script fails a behaviour check", async () => {
    for (const family of JSSCRIPT_APP_FAMILIES.filter((f) => f.id.startsWith("jsscript-"))) {
      for (const seed of SEEDS) {
        const outcomes = await family.solveAndGrade(seed, false);
        const behaviour = outcomes.filter((o) => o.name.includes(" for "));
        expect({ family: family.id, seed, anyFailed: behaviour.length > 0 && behaviour.some((o) => !o.passed) }).toEqual({
          family: family.id,
          seed,
          anyFailed: true
        });
      }
    }
  }, 120_000);

  it("repair tasks start with saved tests that really fail", async () => {
    const fix = JSSCRIPT_APP_FAMILIES.find((f) => f.id === "jsscript-fix")!;
    let repairs = 0;
    for (const seed of SEEDS) {
      const { objective, job } = fix.draw(seed, "x");
      if (!objective.includes("saved tests fail")) continue;
      repairs++;
      const world = await job.start();
      const report = (await world.tools.find((t) => t.name === "ui_jsscript_test")!.execute({})) as { ok: boolean; failed: number };
      expect({ seed, ok: report.ok }).toEqual({ seed, ok: false });
    }
    expect(repairs).toBeGreaterThan(5);
  }, 120_000);
});

describe("generated jsscript and app tasks", () => {
  it("use no tool name a server capability owns", async () => {
    const server = new Set(listCapabilitySpecs().map((spec) => spec.name));
    const names = new Set<string>();
    for (const family of JSSCRIPT_APP_FAMILIES) {
      const world = await family.draw(1, "x").job.start();
      for (const tool of world.tools) names.add(tool.name);
    }
    expect(names.size).toBeGreaterThan(10);
    expect([...names].filter((name) => server.has(name))).toEqual([]);
  });

  it("are deterministic and have no duplicate requests", () => {
    const a = generateTasks(JSSCRIPT_APP_FAMILIES, 30);
    const b = generateTasks(JSSCRIPT_APP_FAMILIES, 30);
    expect(a.map((t) => t.objective)).toEqual(b.map((t) => t.objective));
    expect(new Set(a.map((t) => t.objective)).size).toBe(a.length);
    expect(a.length).toBe(30 * JSSCRIPT_APP_FAMILIES.length);
  });
});

describe("app-build", () => {
  /** Solve through an operation the model added, instead of the implicit `main`. */
  async function solveThroughOperation(seed: number, workflowId: string | null): Promise<string[]> {
    const task = APP_BUILD.make(new Picker(seededRandom(seed)));
    const bridge = await task.createBridge();
    const tools = new Map(bridge.tools.map((t) => [t.name, t]));
    const call = (name: string, args: Record<string, unknown>) => tools.get(name)!.execute(args);
    const solving = task.solve(async (name, args) =>
      call(name, JSON.parse(JSON.stringify(args).replaceAll("op:main/", "op:generate/").replaceAll('"operationId":"main"', '"operationId":"generate"')))
    );
    await solving;
    if (workflowId !== null) {
      await call("ui_app_add_operation", { application_id: "app-eval", id: "generate", target_workflow_id: workflowId });
    }
    const state = bridge.finalState();
    return task.checks.filter((c) => !c.test(state)).map((c) => c.name);
  }

  it("accepts widgets and buttons wired through any operation on the task's workflow", async () => {
    for (const seed of SEEDS.slice(0, 10)) {
      expect({ seed, failed: await solveThroughOperation(seed, "wf-app") }).toEqual({ seed, failed: [] });
    }
  });

  it("rejects a button wired to an operation that was never added", async () => {
    const failed = await solveThroughOperation(1, null);
    expect(failed.some((name) => name.includes("button runs the workflow"))).toBe(true);
  });

  it("refuses an operation on a workflow the world does not have", async () => {
    await expect(solveThroughOperation(1, "wf-other")).rejects.toThrow('no workflow "wf-other" is loaded');
  });

  it("fails widgets bound to a different operation than the one the button runs", async () => {
    const task = APP_BUILD.make(new Picker(seededRandom(1)));
    const bridge = await task.createBridge();
    const tools = new Map(bridge.tools.map((t) => [t.name, t]));
    const call = (name: string, args: Record<string, unknown>) => tools.get(name)!.execute(args);
    await task.solve(async (name, args) => {
      const isButton = name === "ui_app_add_component" && (args as { type?: string }).type === "Button";
      const text = JSON.stringify(args);
      const rewritten = isButton
        ? text.replaceAll('"operationId":"main"', '"operationId":"generate"')
        : text.replaceAll("op:main/", "op:preview/");
      return call(name, JSON.parse(rewritten));
    });
    for (const id of ["generate", "preview"]) {
      await call("ui_app_add_operation", { application_id: "app-eval", id, target_workflow_id: "wf-app" });
    }
    const state = bridge.finalState();
    const failed = task.checks.filter((c) => !c.test(state)).map((c) => c.name);
    expect(failed.some((name) => name.includes("bound to") || name.includes("shows"))).toBe(true);
    expect(failed.some((name) => name.includes("button runs the workflow"))).toBe(false);
  });

  it("fails inputs on one run and outputs on another, even with a button for each", async () => {
    const task = APP_BUILD.make(new Picker(seededRandom(1)));
    const bridge = await task.createBridge();
    const tools = new Map(bridge.tools.map((t) => [t.name, t]));
    const call = (name: string, args: Record<string, unknown>) => tools.get(name)!.execute(args);
    let secondButton: Record<string, unknown> | null = null;
    await task.solve(async (name, args) => {
      const text = JSON.stringify(args);
      if (name === "ui_app_add_component" && (args as { type?: string }).type === "Button") {
        secondButton = JSON.parse(text.replaceAll('"operationId":"main"', '"operationId":"b"'));
        return call(name, JSON.parse(text.replaceAll('"operationId":"main"', '"operationId":"a"')));
      }
      return call(name, JSON.parse(text.replaceAll("op:main/in:", "op:a/in:").replaceAll("op:main/out:", "op:b/out:")));
    });
    await call("ui_app_add_component", secondButton!);
    for (const id of ["a", "b"]) {
      await call("ui_app_add_operation", { application_id: "app-eval", id, target_workflow_id: "wf-app" });
    }
    const state = bridge.finalState();
    const failed = task.checks.filter((c) => !c.test(state)).map((c) => c.name);
    expect(failed.some((name) => name.startsWith("one "))).toBe(true);
  });

  it("fails a run whose operation feeds an input a constant instead of its widget", async () => {
    const task = APP_BUILD.make(new Picker(seededRandom(1)));
    const bridge = await task.createBridge();
    const tools = new Map(bridge.tools.map((t) => [t.name, t]));
    const call = (name: string, args: Record<string, unknown>) => tools.get(name)!.execute(args);
    await task.solve(async (name, args) =>
      call(name, JSON.parse(JSON.stringify(args).replaceAll("op:main/", "op:a/").replaceAll('"operationId":"main"', '"operationId":"a"')))
    );
    await call("ui_app_add_operation", {
      application_id: "app-eval",
      id: "a",
      target_workflow_id: "wf-app",
      inputs: { "in-1": { from: "constant", value: "fixed" } }
    });
    const state = bridge.finalState();
    expect(task.checks.filter((c) => !c.test(state)).map((c) => c.name).some((n) => n.startsWith("one "))).toBe(true);
  });

  it("counts a run event with no operation id as running the first operation", async () => {
    const task = APP_BUILD.make(new Picker(seededRandom(1)));
    const bridge = await task.createBridge();
    const tools = new Map(bridge.tools.map((t) => [t.name, t]));
    await task.solve(async (name, args) =>
      tools.get(name)!.execute(JSON.parse(JSON.stringify(args).replaceAll(',"operationId":"main"', "")))
    );
    const state = bridge.finalState();
    expect(task.checks.filter((c) => !c.test(state)).map((c) => c.name)).toEqual([]);
  });

  it("accepts op:main bindings when the app's one operation has another id, as the runtime resolves them", async () => {
    const task = APP_BUILD.make(new Picker(seededRandom(1)));
    const bridge = await task.createBridge();
    const tools = new Map(bridge.tools.map((t) => [t.name, t]));
    const call = (name: string, args: Record<string, unknown>) => tools.get(name)!.execute(args);
    await task.solve(async (name, args) =>
      call(name, JSON.parse(JSON.stringify(args).replaceAll('"operationId":"main"', '"operationId":"generate"')))
    );
    await call("ui_app_add_operation", { application_id: "app-eval", id: "generate", target_workflow_id: "wf-app" });
    const state = bridge.finalState();
    expect(task.checks.filter((c) => !c.test(state)).map((c) => c.name)).toEqual([]);
  });
});

describe("app-edit", () => {
  it("fails a text field bound through an operation that feeds that input a constant", async () => {
    for (const seed of SEEDS) {
      const task = APP_EDIT.make(new Picker(seededRandom(seed)));
      const check = task.checks.find((c) => c.name.startsWith("input bound to"));
      if (!check) continue;
      const bridge = await task.createBridge();
      const tools = new Map(bridge.tools.map((t) => [t.name, t]));
      const call = (name: string, args: Record<string, unknown>) => tools.get(name)!.execute(args);
      await task.solve(call);
      expect(check.test(bridge.finalState())).toBe(true);
      await call("ui_app_add_operation", {
        application_id: "app-eval",
        id: "generate",
        target_workflow_id: "wf-app",
        inputs: { "in-1": { from: "constant", value: "fixed" } }
      });
      expect(check.test(bridge.finalState())).toBe(false);
      return;
    }
    throw new Error("no seed asked to bind the text field");
  });

  it("does not count a release-paced click as running the workflow", async () => {
    const build = APP_BUILD.make(new Picker(seededRandom(1)));
    const bridge = await build.createBridge();
    const tools = new Map(bridge.tools.map((t) => [t.name, t]));
    await build.solve(async (name, args) =>
      tools.get(name)!.execute(
        JSON.parse(JSON.stringify(args).replaceAll('"operationId":"main"', '"operationId":"main","pace":"release"'))
      )
    );
    const state = bridge.finalState();
    expect(build.checks.filter((c) => !c.test(state)).map((c) => c.name).some((n) => n.includes("button runs"))).toBe(true);
  });
});
