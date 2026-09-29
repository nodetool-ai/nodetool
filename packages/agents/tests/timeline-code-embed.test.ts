/**
 * A plain `v.save(nodetool.timelines, {...})`, called alone or alongside
 * other capability calls in one action, gets that action's code embedded as
 * the timeline's source — the host reruns the action's code hermetically
 * right after the save and attaches it only when the replay reproduces
 * exactly what was saved. Every capability/tool call the action made is
 * recorded (`{method, argsHash, result}`, `document.source.calls`) and
 * replayed on every later bake instead of running again, so a rebake never
 * repeats a side effect. See `tryEmbedTimelineCode` and `bakeTimelineCode`
 * (`src/capabilities/timelines.ts`, `src/timeline-code-bake.ts`) and the host
 * wiring in `src/codeact/chat-codeact.ts` / `src/codeact/codeact-executor.ts`
 * / `src/capabilities/code.ts`.
 *
 * Real QuickJS sandbox, real in-memory database, no network.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeEach } from "vitest";
import {
  createSandboxModuleCatalog,
  discoverSandboxPack
} from "@nodetool-ai/node-sdk";
import {
  ProcessingContext,
  PERMISSION_GATE_CONTEXT_KEY,
  headlessGate
} from "@nodetool-ai/runtime";
import { initTestDb, JsScript, TimelineSequence } from "@nodetool-ai/models";
import { emptyJsScriptDocument } from "@nodetool-ai/protocol/api-schemas/js-scripts.js";
import { createCapabilityRun, UNGATED } from "../src/capabilities/invoke.js";
import { createChatCodeActSession } from "../src/codeact/chat-codeact.js";
import { toolForCapabilityName } from "../src/capabilities/lazy-tool.js";
import { finalizeTimelineCallRecords } from "../src/timeline-code-bake.js";

const discovery = discoverSandboxPack(
  join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "sandbox-packs",
    "sandbox-timeline"
  )
);
if (discovery === undefined) {
  throw new Error("The shipped timeline pack is missing");
}
const catalog = createSandboxModuleCatalog([discovery]);

const USER = "u1";

/**
 * Named so `mountCapabilityModules` grafts the `timelines` and `shared`
 * platform modules onto this session — a tool named here plus a real
 * `capabilityRun` is what lets `nodetool.timelines.*`/`nodetool.shared.*`
 * dispatch straight through `run.invoke`, never through `executeTool`.
 */
const TOOL_NAMES = [
  "create_timeline",
  "get_timeline",
  "set_timeline_document",
  "validate_timeline",
  "edit_timeline",
  "get_timeline_code",
  "set_timeline_code",
  "edit_timeline_code",
  "rebake_timeline_code",
  "share_result"
].map((name) => ({
  name,
  description: name,
  inputSchema: { type: "object", properties: {} }
}));

function makeContext(): ProcessingContext {
  const ctx = new ProcessingContext({
    jobId: `job-${Math.random()}`,
    userId: USER
  });
  ctx.set(PERMISSION_GATE_CONTEXT_KEY, headlessGate("timeline-code-embed test"));
  ctx.sandboxModuleCatalog = catalog;
  return ctx;
}

/** A run whose `invoke` counts calls to `share_result` — the "side effect" this suite watches for repeats. */
function countingRun(ctx: ProcessingContext) {
  const run = createCapabilityRun({ context: ctx, gate: UNGATED });
  let shareCalls = 0;
  const rawInvoke = run.invoke.bind(run);
  run.invoke = (name, args) => {
    if (name === "share_result") shareCalls += 1;
    return rawInvoke(name, args);
  };
  return { run, shareCalls: () => shareCalls };
}

/** One scene, saved under `name`, plus a `share_result` call on `note` — the code's one side effect. */
function buildAndSave(name: string, note: string): string {
  return `
import { video } from "@nodetool-ai/sandbox-timeline";
await nodetool.shared.publish("${note}", "from the timeline action");
const v = video({ width: 640, height: 360, fps: 30 });
const scene = v.scene("intro", 1, (s) => {
  s.text("Hello", { size: 48, color: "#fff" });
});
v.series([scene]);
return await v.save(nodetool.timelines, { name: "${name}" });
`;
}

describe("v.save() embeds the run's own code and its recorded calls", () => {
  beforeEach(async () => {
    await initTestDb();
  });

  it("embeds the action's code with its recorded calls when it saves one timeline", async () => {
    const ctx = makeContext();
    const { run, shareCalls } = countingRun(ctx);
    const session = createChatCodeActSession({
      tools: TOOL_NAMES,
      sandboxModuleCatalog: catalog,
      capabilityRun: run,
      executeTool: (call) => run.invoke(call.name, call.args)
    });
    const code = buildAndSave("Embed me", "note-a");
    const observation = JSON.parse(await session.executeAction({ code })) as {
      ok: boolean;
      result?: { timeline_id: string };
      timelineCodeWarning?: string;
    };
    expect(observation.ok).toBe(true);
    expect(observation.timelineCodeWarning).toBeUndefined();
    expect(shareCalls()).toBe(1);

    const timelineId = observation.result!.timeline_id;
    const row = await TimelineSequence.findById(timelineId);
    const doc = row!.toDocument();
    expect(doc.source?.code).toBe(code);
    expect(Object.keys(doc.source?.scenes ?? {})).toEqual(["intro"]);
    expect(doc.source?.calls).toHaveLength(1);
    expect(doc.source?.calls?.[0]?.method).toBe("share_result");

    // Revising through code.get/code.edit works, with no conflicts — the
    // scene the embedded code tracks was never hand-edited.
    const edited = (await run.invoke("edit_timeline_code", {
      timeline_id: timelineId,
      edits: [{ old: "Hello", new: "Hello again" }]
    })) as { conflicts: unknown[]; errors: string[] };
    expect(edited.errors).toEqual([]);
    expect(edited.conflicts).toEqual([]);
    // The rebake this edit triggered replayed the recorded call rather than
    // making it again.
    expect(shareCalls()).toBe(1);
  });

  it("does not embed, and warns, when the action saves two timelines", async () => {
    const ctx = makeContext();
    const { run } = countingRun(ctx);
    const session = createChatCodeActSession({
      tools: TOOL_NAMES,
      sandboxModuleCatalog: catalog,
      capabilityRun: run,
      executeTool: (call) => run.invoke(call.name, call.args)
    });
    const code = `
import { video } from "@nodetool-ai/sandbox-timeline";
async function buildAndSave(name) {
  const v = video({ width: 640, height: 360, fps: 30 });
  const scene = v.scene("intro", 1, (s) => { s.text("Hello", { size: 48, color: "#fff" }); });
  v.series([scene]);
  return await v.save(nodetool.timelines, { name });
}
const a = await buildAndSave("First");
const b = await buildAndSave("Second");
return { a, b };
`;
    const observation = JSON.parse(await session.executeAction({ code })) as {
      ok: boolean;
      result?: { a: { timeline_id: string }; b: { timeline_id: string } };
      timelineCodeWarning?: string;
    };
    expect(observation.ok).toBe(true);
    expect(observation.timelineCodeWarning).toContain("2 timelines");

    for (const id of [
      observation.result!.a.timeline_id,
      observation.result!.b.timeline_id
    ]) {
      const row = await TimelineSequence.findById(id);
      expect(row!.toDocument().source).toBeUndefined();
    }
  });

  it("embeds code using Math.random() — the seed reproduces it on replay", async () => {
    const ctx = makeContext();
    const { run } = countingRun(ctx);
    const session = createChatCodeActSession({
      tools: TOOL_NAMES,
      sandboxModuleCatalog: catalog,
      capabilityRun: run,
      executeTool: (call) => run.invoke(call.name, call.args)
    });
    const code = `
import { video } from "@nodetool-ai/sandbox-timeline";
const v = video({ width: 640, height: 360, fps: 30 });
const scene = v.scene("intro", 1, (s) => {
  s.text("Roll " + Math.random(), { size: 48, color: "#fff" });
});
v.series([scene]);
return await v.save(nodetool.timelines, { name: "Random" });
`;
    const observation = JSON.parse(await session.executeAction({ code })) as {
      ok: boolean;
      result?: { timeline_id: string };
      timelineCodeWarning?: string;
    };
    expect(observation.ok).toBe(true);
    expect(observation.timelineCodeWarning).toBeUndefined();

    const row = await TimelineSequence.findById(observation.result!.timeline_id);
    const doc = row!.toDocument();
    expect(doc.source?.code).toBe(code);
    expect(typeof doc.source?.seed).toBe("number");
  });

  it("fails a rebake that changes a recorded call's arguments, naming the call, unless allow_live is set", async () => {
    const ctx = makeContext();
    const { run, shareCalls } = countingRun(ctx);
    const session = createChatCodeActSession({
      tools: TOOL_NAMES,
      sandboxModuleCatalog: catalog,
      capabilityRun: run,
      executeTool: (call) => run.invoke(call.name, call.args)
    });
    const code = buildAndSave("Changeable", "note-a");
    const observation = JSON.parse(await session.executeAction({ code })) as {
      ok: boolean;
      result?: { timeline_id: string };
    };
    expect(observation.ok).toBe(true);
    expect(shareCalls()).toBe(1);
    const timelineId = observation.result!.timeline_id;

    // Change what the recorded call's arguments were — the note's key —
    // so the stored record no longer matches.
    const refused = (await run.invoke("edit_timeline_code", {
      timeline_id: timelineId,
      edits: [{ old: "note-a", new: "note-b" }]
    })) as { errors: string[] };
    expect(refused.errors.join(" ")).toContain("share_result");
    expect(shareCalls()).toBe(1); // refused before making the call live

    const allowed = (await run.invoke("edit_timeline_code", {
      timeline_id: timelineId,
      edits: [{ old: "note-a", new: "note-b" }],
      allow_live: true
    })) as { errors: string[] };
    expect(allowed.errors).toEqual([]);
    expect(shareCalls()).toBe(2); // one fresh live call, recorded

    const row = await TimelineSequence.findById(timelineId);
    const calls = row!.toDocument().source?.calls ?? [];
    expect(calls).toHaveLength(1);
  });
});

describe("run_js_script embeds the run's own code", () => {
  beforeEach(async () => {
    await initTestDb();
  });

  async function makeScript(code: string): Promise<JsScript> {
    const script = new JsScript({
      user_id: USER,
      name: "Timeline builder",
      document: JSON.stringify({ ...emptyJsScriptDocument(), code })
    });
    await script.save();
    return script;
  }

  function context(): ProcessingContext {
    return makeContext();
  }

  // `run_js_script`'s live toolbelt (`assembleJsScriptToolbelt`) is
  // `getBuiltinTools()` plus Apify/SerpAPI/MCP — it does not carry
  // `share_result`, so this suite's "side effect" is `nodetool.memory.save`.
  function buildAndSaveWithMemory(name: string, note: string): string {
    return `
import { video } from "@nodetool-ai/sandbox-timeline";
await nodetool.memory.save("${note}");
const v = video({ width: 640, height: 360, fps: 30 });
const scene = v.scene("intro", 1, (s) => {
  s.text("Hello", { size: 48, color: "#fff" });
});
v.series([scene]);
return await v.save(nodetool.timelines, { name: "${name}" });
`;
  }

  it("embeds a saved script's own code and its recorded calls", async () => {
    const script = await makeScript(
      buildAndSaveWithMemory("From a script", "note-s")
    );
    const result = (await toolForCapabilityName("run_js_script").execute(
      context(),
      { js_script_id: script.id }
    )) as {
      outputs?: { timeline_id: string };
      warning?: string;
    };
    expect(result.warning).toBeUndefined();

    // The Code-node run contract returns a script's `return` as `outputs`
    // only when the body neither emits nor yields — this body does neither.
    const timelineId = (result.outputs as unknown as { timeline_id: string })
      .timeline_id;
    const row = await TimelineSequence.findById(timelineId);
    const doc = row!.toDocument();
    expect(doc.source?.code).toBe(script.toDocument().code);
    expect(doc.source?.calls).toHaveLength(1);
  });

  // `Date.now()`/`new Date()` are deliberately not seeded — see
  // `timelineDeterminismShim`'s own docstring for why freezing the clock for
  // a whole action is unsafe (it broke `nodetool.jobs.wait`'s timeout).
  // Code that reads the clock stays outside what a replay reproduces, so it
  // still reports the ordinary "not embedded, not deterministic" warning.
  it("does not embed, and warns, when the script reads Date.now()", async () => {
    const script = await makeScript(`
import { video } from "@nodetool-ai/sandbox-timeline";
const v = video({ width: 640, height: 360, fps: 30 });
const scene = v.scene("intro", 1, (s) => {
  s.text("Stamp " + Date.now(), { size: 48, color: "#fff" });
});
v.series([scene]);
return await v.save(nodetool.timelines, { name: "Stamped script" });
`);
    const result = (await toolForCapabilityName("run_js_script").execute(
      context(),
      { js_script_id: script.id }
    )) as { outputs?: { timeline_id: string }; warning?: string };
    expect(result.warning).toContain("not embedded");

    const row = await TimelineSequence.findById(
      (result.outputs as unknown as { timeline_id: string }).timeline_id
    );
    expect(row!.toDocument().source).toBeUndefined();
  });
});

describe("finalizeTimelineCallRecords — the size cap", () => {
  it("keeps calls under the cap and reports how many were dropped past it", () => {
    // ~200KB and ~100KB results: the first fits inside the 256KB cap on its
    // own, the second would push the total past it.
    const big = "x".repeat(200 * 1024);
    const alsoBig = "y".repeat(100 * 1024);
    const { calls, droppedForSize } = finalizeTimelineCallRecords([
      { method: "generate_image", args: { prompt: "a" }, result: { data: big } },
      { method: "generate_image", args: { prompt: "b" }, result: { data: alsoBig } }
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe("generate_image");
    expect(droppedForSize).toBe(1);
  });

  it("keeps every call when the total is comfortably under the cap", () => {
    const { calls, droppedForSize } = finalizeTimelineCallRecords([
      { method: "share_result", args: { key: "a" }, result: { ok: true } },
      { method: "share_result", args: { key: "b" }, result: { ok: true } }
    ]);
    expect(calls).toHaveLength(2);
    expect(droppedForSize).toBe(0);
  });
});
