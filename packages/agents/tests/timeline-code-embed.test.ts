/**
 * `v.save()` prints the retained program of the run that built a timeline
 * and attaches it through `set_timeline_code` with `require_match`
 * (docs/timeline-code-capture.md). Research and other capability calls run
 * once, in that run; their results are literals in the stored code, so a
 * rebake runs no capability.
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
 * platform modules onto this session.
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
  "share_result",
  "read_shared"
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

/** A run whose `invoke` counts calls to `share_result` and `read_shared`, the capabilities a rebake must not repeat. */
function countingRun(ctx: ProcessingContext) {
  const run = createCapabilityRun({ context: ctx, gate: UNGATED });
  let sideEffects = 0;
  const rawInvoke = run.invoke.bind(run);
  run.invoke = (name, args) => {
    if (name === "share_result" || name === "read_shared") sideEffects += 1;
    return rawInvoke(name, args);
  };
  return { run, sideEffects: () => sideEffects };
}

function session(run: ReturnType<typeof countingRun>["run"]) {
  return createChatCodeActSession({
    tools: TOOL_NAMES,
    sandboxModuleCatalog: catalog,
    capabilityRun: run,
    executeTool: (call) => run.invoke(call.name, call.args)
  });
}

interface SaveResult {
  timeline_id: string;
  code?: { embedded: boolean; warnings: string[] };
}

async function act(
  run: ReturnType<typeof countingRun>["run"],
  code: string
): Promise<SaveResult> {
  const observation = JSON.parse(await session(run).executeAction({ code })) as {
    ok: boolean;
    result?: SaveResult;
    error?: string;
  };
  expect(observation.ok, observation.error).toBe(true);
  return observation.result!;
}

/**
 * Research, as an agent does it: publish a value, read it back, and build
 * the scene from one field of the answer.
 */
const RESEARCH_BUILD = `
import { video } from "@nodetool-ai/sandbox-timeline";
await nodetool.shared.publish("brief", { headline: "Rain returns", notes: "long text nobody shows" });
const research = await nodetool.shared.read(["brief"]);
const headline = research.entries.brief.value.headline;
const SIZE = 48;
const v = video({ width: 640, height: 360, fps: 30 });
const scene = v.scene("intro", 1, (s) => {
  s.text(headline, { size: SIZE, color: "#fff" });
});
v.series([scene]);
return await v.save(nodetool.timelines, { name: "Research" });
`;

describe("v.save() attaches the retained program", () => {
  beforeEach(async () => {
    await initTestDb();
  });

  it("stores the research result as a value, not the calls that found it", async () => {
    const { run, sideEffects } = countingRun(makeContext());
    const saved = await act(run, RESEARCH_BUILD);
    expect(saved.code).toEqual({ embedded: true, warnings: [] });
    expect(sideEffects()).toBe(2);

    const doc = (await TimelineSequence.findById(saved.timeline_id))!.toDocument();
    const code = doc.source!.code;
    expect(code).toContain('let headline = "Rain returns";');
    expect(code).toContain("const SIZE = 48;");
    expect(code).not.toContain("nodetool.shared");
    expect(code).not.toContain("long text nobody shows");
    expect(Object.keys(doc.source!.scenes)).toEqual(["intro"]);
  });

  it("rebakes the stored program without running a capability again", async () => {
    const { run, sideEffects } = countingRun(makeContext());
    const saved = await act(run, RESEARCH_BUILD);

    const rebaked = (await run.invoke("edit_timeline_code", {
      timeline_id: saved.timeline_id,
      edits: [{ old: "const SIZE = 48;", new: "const SIZE = 64;" }]
    })) as { errors: string[]; conflicts: unknown[] };
    expect(rebaked.errors).toEqual([]);
    expect(rebaked.conflicts).toEqual([]);
    expect(sideEffects()).toBe(2);

    const doc = (await TimelineSequence.findById(saved.timeline_id))!.toDocument();
    const text = doc.clips.find((clip) => clip.mediaType === "text");
    expect(text?.textStyle?.fontSizePx).toBe(64);
    expect(text?.textStyle?.text).toBe("Rain returns");
  });

  it("does not attach code when a scene calls a capability, and says why", async () => {
    const { run } = countingRun(makeContext());
    const saved = await act(
      run,
      `
import { video } from "@nodetool-ai/sandbox-timeline";
const v = video({ width: 640, height: 360, fps: 30 });
const scene = v.scene("intro", 1, (s) => {
  if (typeof nodetool === "undefined") throw new Error("unreachable");
  s.text("Hello", { size: 48, color: "#fff" });
});
v.series([scene]);
return await v.save(nodetool.timelines, { name: "Capability in a scene" });
`
    );
    expect(saved.code?.embedded).toBe(false);
    expect(saved.code?.warnings.join(" ")).toContain("`nodetool`");
    const doc = (await TimelineSequence.findById(saved.timeline_id))!.toDocument();
    expect(doc.source).toBeUndefined();
    expect(doc.clips.length).toBeGreaterThan(0);
  });

  it("does not attach code that uses Math.random() in a scene", async () => {
    const { run } = countingRun(makeContext());
    const saved = await act(
      run,
      `
import { video } from "@nodetool-ai/sandbox-timeline";
const v = video({ width: 640, height: 360, fps: 30 });
const scene = v.scene("intro", 1, (s) => {
  s.text("Roll " + Math.random(), { size: 48, color: "#fff" });
});
v.series([scene]);
return await v.save(nodetool.timelines, { name: "Random" });
`
    );
    expect(saved.code?.embedded).toBe(false);
    expect(saved.code?.warnings.join(" ")).toContain("Math.random");
  });

  it("keeps a loop variable per scene and a helper that reads it", async () => {
    const { run } = countingRun(makeContext());
    const saved = await act(
      run,
      `
import { video } from "@nodetool-ai/sandbox-timeline";
const v = video({ width: 640, height: 360, fps: 30 });
let next = 0;
const tag = (label) => label + "-" + (++next);
const scenes = ["a", "b"].map((name, i) =>
  v.scene(name, 1, (s) => {
    s.text(tag(name) + " of " + i, { size: 40, color: "#fff" });
  })
);
v.series(scenes);
return await v.save(nodetool.timelines, { name: "Loop" });
`
    );
    expect(saved.code).toEqual({ embedded: true, warnings: [] });
    const doc = (await TimelineSequence.findById(saved.timeline_id))!.toDocument();
    const texts = doc.clips
      .filter((clip) => clip.mediaType === "text")
      .map((clip) => clip.textStyle?.text)
      .sort();
    expect(texts).toEqual(["a-1 of 0", "b-2 of 1"]);
    expect(doc.source!.code).toContain("let next = 1;");
  });

  it("attaches through a belt Tool call, the path the CLI runner takes", async () => {
    const ctx = makeContext();
    const run = createCapabilityRun({ context: ctx, gate: UNGATED });
    const cliSession = createChatCodeActSession({
      tools: TOOL_NAMES,
      sandboxModuleCatalog: catalog,
      context: ctx,
      executeTool: (call) => toolForCapabilityName(call.name, run).execute(ctx, call.args)
    });
    const observation = JSON.parse(
      await cliSession.executeAction({ code: RESEARCH_BUILD })
    ) as { ok: boolean; result?: SaveResult; error?: string };
    expect(observation.ok, observation.error).toBe(true);
    expect(observation.result!.code).toEqual({ embedded: true, warnings: [] });
  });
});

describe("run_js_script", () => {
  beforeEach(async () => {
    await initTestDb();
  });

  it("attaches the retained program of a saved script", async () => {
    const script = new JsScript({
      user_id: USER,
      name: "Timeline builder",
      document: JSON.stringify({
        ...emptyJsScriptDocument(),
        code: `
import { video } from "@nodetool-ai/sandbox-timeline";
await nodetool.memory.save("built a timeline");
const v = video({ width: 640, height: 360, fps: 30 });
const scene = v.scene("intro", 1, (s) => {
  s.text("Hello", { size: 48, color: "#fff" });
});
v.series([scene]);
return await v.save(nodetool.timelines, { name: "From a script" });
`
      })
    });
    await script.save();
    const result = (await toolForCapabilityName("run_js_script").execute(
      makeContext(),
      { js_script_id: script.id }
    )) as { outputs?: unknown };
    const saved = result.outputs as unknown as SaveResult;
    expect(saved.code).toEqual({ embedded: true, warnings: [] });

    const doc = (await TimelineSequence.findById(saved.timeline_id))!.toDocument();
    expect(doc.source!.code).not.toContain("nodetool.memory");
  });
});
