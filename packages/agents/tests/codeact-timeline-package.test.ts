import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  createSandboxModuleCatalog,
  discoverSandboxPack
} from "@nodetool-ai/node-sdk";
import {
  ProcessingContext as ProcessingContextClass,
  PERMISSION_GATE_CONTEXT_KEY,
  headlessGate
} from "@nodetool-ai/runtime";
import type {
  BaseProvider,
  ProcessingContext,
  ProviderStreamItem,
  SandboxModuleCatalog
} from "@nodetool-ai/runtime";
import {
  initTestDb,
  TimelineSequence,
  TimelineSequenceVersion
} from "@nodetool-ai/models";
import { createCapabilityRun, UNGATED } from "../src/capabilities/invoke.js";
import { createChatCodeActSession } from "../src/codeact/chat-codeact.js";
import { CodeActExecutor } from "../src/codeact/codeact-executor.js";
import type { Step, Task } from "../src/types.js";
import {
  TIMELINE_PACKAGE,
  withTimelinePackage
} from "../src/codeact/timeline-package.js";
import { createMockContext } from "./_helpers/mock-context.js";

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
const BUILD_SCENE = `
import { video } from "@nodetool-ai/sandbox-timeline";
const v = video({ width: 1080, height: 1920, fps: 30 });
const scene = v.scene("intro", 2, (s) => {
  for (let i = 0; i < 3; i++) {
    const clip = s.text("Layer " + i, { size: 64, weight: 600, color: "#fff", y: i * 80 });
    clip.enter({ from: { offsetY: 80, opacity: 0 }, at: 0, dur: 0.667, ease: "outExpo" });
  }
});
v.series([scene]);
const result = v._document;
const summary = { clips: result.clips.length, groups: result.clips.filter(c => c.mediaType === "group").length };
`;

function chatSession(sandboxModuleCatalog: SandboxModuleCatalog | null) {
  return createChatCodeActSession({
    tools: [],
    executeTool: async () => ({}),
    sandboxModuleCatalog
  });
}

describe("timeline pack in chat", () => {
  it("validates before creating a timeline row on a failed save", async () => {
    const rows: string[] = [];
    const calls: string[] = [];
    const session = createChatCodeActSession({
      tools: [
        "create_timeline",
        "set_timeline_document",
        "validate_timeline"
      ].map((name) => ({
        name,
        description: name,
        inputSchema: { type: "object", properties: {} }
      })),
      sandboxModuleCatalog: catalog,
      executeTool: async (call) => {
        calls.push(call.name);
        if (call.name === "create_timeline") {
          rows.push("new");
          return { timeline_id: "new" };
        }
        if (call.name === "set_timeline_document") {
          return { written: false, error: "invalid clip" };
        }
        return {
          ok: false,
          errors: [{ code: "schema_invalid", message: "invalid clip" }]
        };
      }
    });
    const result = JSON.parse(
      await session.executeAction({
        code: `
import { video } from "@nodetool-ai/sandbox-timeline";
const v = video({ width: 1080, height: 1920, fps: 30 });
v.series([v.scene("s", 1, (s) => {})]);
v._document.clips.push({ durationMs: -1 });
await v.save(nodetool.timelines, { name: "Invalid" });
`
      })
    );
    expect(result.ok).toBe(false);
    expect(rows).toEqual([]);
    expect(calls).toEqual(["validate_timeline"]);
    expect(result.error).toContain("invalid clip");
  });

  it("imports the installed builder without an explicit package allowlist", async () => {
    const observation = JSON.parse(
      await chatSession(catalog).executeAction({
        code: BUILD_SCENE + "return summary;"
      })
    );
    expect(observation).toMatchObject({
      ok: true,
      result: { clips: 4, groups: 1 }
    });
  });

  it("saves an example style bundle through the chat timeline bridge", async () => {
    const timelineId = "a".repeat(32);
    const calls: string[] = [];
    let savedDocument: unknown;
    const session = createChatCodeActSession({
      tools: [
        "create_timeline",
        "set_timeline_document",
        "validate_timeline"
      ].map((name) => ({
        name,
        description: name,
        inputSchema: { type: "object", properties: {} }
      })),
      sandboxModuleCatalog: catalog,
      executeTool: async (call) => {
        calls.push(call.name);
        if (call.name === "create_timeline") {
          return { timeline_id: timelineId };
        }
        if (call.name === "set_timeline_document") {
          savedDocument = call.args.document;
          return { written: true };
        }
        return { ok: true, errors: [] };
      }
    });
    const observation = JSON.parse(
      await session.executeAction({
        code: `
import "@nodetool-ai/sandbox-nodetool/timelines";
${BUILD_SCENE}
return await v.save(nodetool.timelines, { name: "Intro" });
`
      })
    );
    expect(observation).toMatchObject({
      ok: true,
      result: { timeline_id: timelineId }
    });
    expect(calls).toEqual([
      "validate_timeline",
      "create_timeline",
      "set_timeline_document",
      "validate_timeline"
    ]);
    expect(savedDocument).toMatchObject({
      clips: expect.arrayContaining([
        expect.objectContaining({ mediaType: "group" }),
        expect.objectContaining({
          mediaType: "text",
          animations: expect.arrayContaining([
            expect.objectContaining({ preset: "custom" })
          ])
        })
      ])
    });
  });

  it("names the created timeline in a failure after it was created", async () => {
    const timelineId = "c".repeat(32);
    const session = createChatCodeActSession({
      tools: [
        "create_timeline",
        "set_timeline_document",
        "validate_timeline"
      ].map((name) => ({
        name,
        description: name,
        inputSchema: { type: "object", properties: {} }
      })),
      sandboxModuleCatalog: catalog,
      executeTool: async (call) => {
        if (call.name === "create_timeline") return { timeline_id: timelineId };
        if (call.name === "set_timeline_document") {
          return { written: false, error: "invalid clip" };
        }
        return { ok: true, errors: [] };
      }
    });
    const observation = JSON.parse(
      await session.executeAction({
        code: `
import { video } from "@nodetool-ai/sandbox-timeline";
const v = video({ width: 1080, height: 1920, fps: 30 });
v.series([v.scene("s", 1, (s) => {})]);
return await v.save(nodetool.timelines, { name: "Halo — Launch Spot" });
`
      })
    );
    expect(observation.ok).toBe(false);
    expect(observation.error).toContain(timelineId);
    expect(observation.error).toContain("Halo — Launch Spot");
  });

  it("refuses an import when the pack is not installed", async () => {
    const observation = JSON.parse(
      await chatSession(null).executeAction({
        code: BUILD_SCENE + "return summary;"
      })
    );
    expect(observation.ok).toBe(false);
    expect(observation.error).toContain("allowlist");
  });
});

describe("timeline pack in step execution", () => {
  it("runs the installed builder without an explicit package allowlist", async () => {
    const step: Step = {
      id: "timeline_step",
      instructions: "Build a scene",
      completed: false,
      dependsOn: [],
      logs: [],
      outputSchema: JSON.stringify({
        type: "object",
        properties: { clips: { type: "number" }, groups: { type: "number" } },
        required: ["clips", "groups"]
      })
    };
    const task: Task = { id: "timeline_task", title: "Build", steps: [step] };
    const provider = {
      provider: "fake",
      hasToolSupport: async () => true,
      async *generateLoop(args: {
        tools?: Array<{
          name: string;
          execute?: (args: Record<string, unknown>) => Promise<unknown>;
        }>;
      }): AsyncGenerator<ProviderStreamItem> {
        const tool = args.tools?.find((t) => t.name === "execute_code");
        if (tool?.execute === undefined) {
          throw new Error("Missing execute_code");
        }
        const call = {
          id: "timeline_action",
          name: "execute_code",
          args: { code: BUILD_SCENE + "await finish(summary);" }
        };
        yield call;
        const result = await tool.execute(call.args);
        yield {
          type: "message",
          message: {
            role: "tool",
            toolCallId: call.id,
            content: JSON.stringify(result)
          }
        };
      }
      // The scripted provider implements only the loop methods this executor uses.
    } as unknown as BaseProvider;
    const context: ProcessingContext = createMockContext();
    context.sandboxModuleCatalog = catalog;
    const executor = new CodeActExecutor({
      task,
      step,
      context,
      provider,
      model: "fake"
    });
    for await (const _message of executor.execute()) {
      // Drain the scripted execution.
    }
    expect(step.completed).toBe(true);
    expect(executor.getResult()).toEqual({ clips: 4, groups: 1 });
  });
});

describe("withTimelinePackage", () => {
  it("preserves other permissions and adds an installed pack once", () => {
    expect(withTimelinePackage(["@acme/other"], catalog)).toEqual([
      "@acme/other",
      TIMELINE_PACKAGE
    ]);
    expect(withTimelinePackage([TIMELINE_PACKAGE], catalog)).toEqual([
      TIMELINE_PACKAGE
    ]);
  });

  it("preserves the list when the catalog cannot serve the pack", () => {
    expect(withTimelinePackage(["@acme/other"], null)).toEqual(["@acme/other"]);
    expect(withTimelinePackage([], undefined)).toEqual([]);
    expect(withTimelinePackage([], createSandboxModuleCatalog([]))).toEqual([]);
  });
});

describe("timeline pack persistence", () => {
  it("round trips tf depth, missing scene tracks and effect ids through the real host", async () => {
    initTestDb();
    const context = createMockContext();
    const run = createCapabilityRun({ context, gate: UNGATED });
    const session = createChatCodeActSession({
      tools: [
        "create_timeline",
        "set_timeline_document",
        "validate_timeline",
        "get_timeline"
      ].map((name) => ({
        name,
        description: name,
        inputSchema: { type: "object", properties: {} }
      })),
      sandboxModuleCatalog: catalog,
      executeTool: (call) => run.invoke(call.name, call.args)
    });
    const observation = JSON.parse(
      await session.executeAction({
        code: `
      import { video } from "@nodetool-ai/sandbox-timeline";
      const v = video({ width: 1080, height: 1920, fps: 30 });
      const scene = v.scene("depth", 2, (s) => {
        s.rect(100, 100, "#fff", { tx: { depthPx: -400 }, effects: [{ type: "grain", amount: 0.1 }] });
      });
      v.series([scene]);
      v.document({ camera2d: { position: { x: 0, y: 0 }, depthPx: 0, focalLengthPx: 1000,
        keyframes: [{ timeMs: 0, position: { x: 0, y: 0 }, depthPx: 0 }, { timeMs: 1900, position: { x: 0, y: 0 }, depthPx: 200 }] } });
      return await v.save(nodetool.timelines, { name: "Depth" });
    `
      })
    );
    expect(observation).toMatchObject({ ok: true });
    const row = await TimelineSequence.findById(observation.result.timeline_id);
    const stored = row!.toDocument();
    expect(
      stored.clips.find((c) => c.mediaType === "shape")?.transform?.depthPx
    ).toBe(-400);
    expect(stored.tracks.some((t) => t.id === "t_scenes")).toBe(true);
    // The pack itself fills a missing effect id/enabled now (real-sandbox
    // test: "clip effects and v.adjust() fill id/enabled:true..."), so the
    // id reaching the server is already a pack-generated one rather than the
    // server's own "effect_1" fallback — only the shape, not a specific id,
    // is this test's own concern.
    const effect = stored.clips.find((c) => c.mediaType === "shape")?.effects?.[0];
    expect(typeof effect?.id).toBe("string");
    expect(effect?.enabled).toBe(true);
  });

  it("leaves the real timeline table unchanged after an invalid save", async () => {
    initTestDb();
    const run = createCapabilityRun({
      context: createMockContext(),
      gate: UNGATED
    });
    const before = await run.invoke("list_timelines", {});
    const session = createChatCodeActSession({
      tools: [
        "create_timeline",
        "set_timeline_document",
        "validate_timeline"
      ].map((name) => ({
        name,
        description: name,
        inputSchema: { type: "object", properties: {} }
      })),
      sandboxModuleCatalog: catalog,
      executeTool: (call) => run.invoke(call.name, call.args)
    });
    const result = JSON.parse(
      await session.executeAction({
        code: `
import { video } from "@nodetool-ai/sandbox-timeline";
const v = video({ width: 1080, height: 1920, fps: 30 });
v.series([v.scene("s", 1, (s) => {})]);
v._document.clips.push({ id: "bad", durationMs: -1 });
return await v.save(nodetool.timelines, { name: "Invalid" });
`
      })
    );
    expect(result.ok).toBe(false);
    expect(await run.invoke("list_timelines", {})).toEqual(before);
  });
});

describe("revising a timeline in place", () => {
  it("v.save() with an explicit timeline_id writes into it and snapshots the prior state, instead of creating another", async () => {
    initTestDb();
    const context = createMockContext();
    const run = createCapabilityRun({ context, gate: UNGATED });
    const tools = [
      "create_timeline",
      "set_timeline_document",
      "validate_timeline",
      "get_timeline"
    ].map((name) => ({
      name,
      description: name,
      inputSchema: { type: "object", properties: {} }
    }));
    const session = createChatCodeActSession({
      tools,
      sandboxModuleCatalog: catalog,
      executeTool: (call) => run.invoke(call.name, call.args)
    });

    const first = JSON.parse(
      await session.executeAction({
        code: `
      import { video } from "@nodetool-ai/sandbox-timeline";
      const v = video({ width: 1080, height: 1920, fps: 30 });
      v.series([v.scene("one", 1, (s) => { s.text("First", {}); })]);
      return await v.save(nodetool.timelines, { name: "Revise me" });
    `
      })
    );
    expect(first).toMatchObject({ ok: true });
    const timelineId = first.result.timeline_id;
    const before = await TimelineSequence.findById(timelineId);

    const second = JSON.parse(
      await session.executeAction({
        code: `
      import { video } from "@nodetool-ai/sandbox-timeline";
      const v = video({ width: 1080, height: 1920, fps: 30 });
      v.series([v.scene("two", 1, (s) => { s.text("Second", {}); })]);
      return await v.save(nodetool.timelines, { name: "Revise me", timeline_id: "${timelineId}" });
    `
      })
    );
    expect(second).toMatchObject({ ok: true });
    expect(second.result.timeline_id).toBe(timelineId);

    // No duplicate row: only the one timeline exists.
    expect((await TimelineSequence.listByUser(context.userId!)).length).toBe(1);

    const after = await TimelineSequence.findById(timelineId);
    const afterText = after!
      .toDocument()
      .clips.find((c: { mediaType: string }) => c.mediaType === "text");
    expect(afterText?.textStyle?.text).toBe("Second");

    // set_timeline_document snapshots the prior state before writing.
    const versions = await TimelineSequenceVersion.listForTimeline(timelineId);
    expect(versions.length).toBeGreaterThan(0);
    expect(before!.updated_at).not.toBe(after!.updated_at);
  });

  it("set_timeline_code then edit_timeline_code updates the same timeline in place", async () => {
    initTestDb();
    const userId = "u-timeline-code";
    const processingContext = new ProcessingContextClass({
      jobId: "job-timeline-code",
      userId,
      sandboxModuleCatalog: catalog
    });
    processingContext.set(
      PERMISSION_GATE_CONTEXT_KEY,
      headlessGate("timeline code test")
    );
    const run = createCapabilityRun({ context: processingContext, gate: UNGATED });

    const created = (await run.invoke("create_timeline", {
      name: "From code"
    })) as { timeline_id: string };
    const timelineId = created.timeline_id;
    expect(timelineId).toBeTruthy();

    const CODE = `
import { video } from "@nodetool-ai/sandbox-timeline";
const v = video({ width: 1080, height: 1920, fps: 30 });
v.series([v.scene("one", 1, (s) => { s.text("run 1", {}); })]);
await v.save(nodetool.timelines, { name: "From code" });
`;
    const set = (await run.invoke("set_timeline_code", {
      timeline_id: timelineId,
      code: CODE
    })) as { timeline_id: string; errors: string[]; conflicts: unknown[] };
    expect(set.errors).toEqual([]);
    expect(set.conflicts).toEqual([]);

    const timelineRow = await TimelineSequence.findById(set.timeline_id);
    expect(timelineRow).not.toBeNull();
    expect(timelineRow!.toDocument().source?.code).toBe(CODE);

    // Editing the stored code (a str-replace, the revise loop) then rebaking
    // it (implicit in edit_timeline_code) must update the same timeline, not
    // create another.
    const edited = (await run.invoke("edit_timeline_code", {
      timeline_id: set.timeline_id,
      edits: [{ old: '"run 1"', new: '"run 2"' }]
    })) as { timeline_id: string; errors: string[]; conflicts: unknown[] };
    expect(edited.errors).toEqual([]);
    expect(edited.conflicts).toEqual([]);
    expect(edited.timeline_id).toBe(timelineRow!.id);

    const rows = await TimelineSequence.listByUser(userId);
    expect(rows.length).toBe(1);
    const finalText = rows[0]
      .toDocument()
      .clips.find((c: { mediaType: string }) => c.mediaType === "text");
    expect(finalText?.textStyle?.text).toBe("run 2");
  });

  it("rebake_timeline_code keeps a hand-edited scene as a conflict, and force overwrites it", async () => {
    initTestDb();
    const userId = "u-timeline-code-conflict";
    const processingContext = new ProcessingContextClass({
      jobId: "job-timeline-code-conflict",
      userId,
      sandboxModuleCatalog: catalog
    });
    processingContext.set(
      PERMISSION_GATE_CONTEXT_KEY,
      headlessGate("timeline code conflict test")
    );
    const run = createCapabilityRun({ context: processingContext, gate: UNGATED });

    const created = (await run.invoke("create_timeline", {
      name: "Conflict test"
    })) as { timeline_id: string };
    const CODE = `
import { video } from "@nodetool-ai/sandbox-timeline";
const v = video({ width: 1080, height: 1920, fps: 30 });
v.series([v.scene("one", 1, (s) => { s.text("built", {}); })]);
await v.save(nodetool.timelines, { name: "Conflict test" });
`;
    const set = (await run.invoke("set_timeline_code", {
      timeline_id: created.timeline_id,
      code: CODE
    })) as { timeline_id: string; conflicts: unknown[] };
    expect(set.conflicts).toEqual([]);

    // Hand-edit the scene's text outside the code (an editor-style edit).
    const before = await TimelineSequence.findById(set.timeline_id);
    const textClip = before!
      .toDocument()
      .clips.find((c: { mediaType: string }) => c.mediaType === "text")!;
    const handEdited = (await run.invoke("edit_timeline", {
      timeline_id: set.timeline_id,
      ops: [
        {
          op: "set_clip_params",
          target: textClip.id,
          patch: { textStyle: { ...textClip.textStyle, text: "hand edited" } }
        }
      ]
    })) as { failed: number };
    expect(handEdited.failed).toBe(0);

    // A plain rebake must keep the hand edit and report the conflict.
    const rebaked = (await run.invoke("rebake_timeline_code", {
      timeline_id: set.timeline_id
    })) as {
      conflicts: Array<{ scene: string; reason: string }>;
      scenes: Array<{ name: string; edited: boolean }>;
    };
    expect(rebaked.conflicts).toEqual([{ scene: "one", reason: "edited since the last bake" }]);
    expect(rebaked.scenes).toEqual([{ name: "one", group_id: expect.any(String), edited: true }]);

    const kept = await TimelineSequence.findById(set.timeline_id);
    const keptText = kept!
      .toDocument()
      .clips.find((c: { mediaType: string }) => c.mediaType === "text");
    expect(keptText?.textStyle?.text).toBe("hand edited");

    // force: true overwrites the hand edit with the code's own build.
    const forced = (await run.invoke("rebake_timeline_code", {
      timeline_id: set.timeline_id,
      force: true
    })) as { conflicts: unknown[] };
    expect(forced.conflicts).toEqual([]);

    const overwritten = await TimelineSequence.findById(set.timeline_id);
    const overwrittenText = overwritten!
      .toDocument()
      .clips.find((c: { mediaType: string }) => c.mediaType === "text");
    expect(overwrittenText?.textStyle?.text).toBe("built");
  });

  it("detach_timeline_code stops tracking a scene, so a later rebake never touches it", async () => {
    initTestDb();
    const userId = "u-timeline-code-detach";
    const processingContext = new ProcessingContextClass({
      jobId: "job-timeline-code-detach",
      userId,
      sandboxModuleCatalog: catalog
    });
    processingContext.set(
      PERMISSION_GATE_CONTEXT_KEY,
      headlessGate("timeline code detach test")
    );
    const run = createCapabilityRun({ context: processingContext, gate: UNGATED });

    const created = (await run.invoke("create_timeline", {
      name: "Detach test"
    })) as { timeline_id: string };
    const CODE = `
import { video } from "@nodetool-ai/sandbox-timeline";
const v = video({ width: 1080, height: 1920, fps: 30 });
v.series([v.scene("one", 1, (s) => { s.text("built", {}); })]);
await v.save(nodetool.timelines, { name: "Detach test" });
`;
    const set = (await run.invoke("set_timeline_code", {
      timeline_id: created.timeline_id,
      code: CODE
    })) as { timeline_id: string };

    const detached = (await run.invoke("detach_timeline_code", {
      timeline_id: set.timeline_id,
      scenes: ["one"]
    })) as { scenes: string[] };
    expect(detached.scenes).toEqual(["one"]);

    const afterDetach = await TimelineSequence.findById(set.timeline_id);
    expect(afterDetach!.toDocument().source?.scenes["one"]).toBeUndefined();

    // A detached scene is no longer tracked (`source.scenes` has no entry
    // for it), but its clips are still on the timeline with `sourceScene:
    // "one"`, so a later rebake still finds a same-named scene in the fresh
    // build. With no recorded hash to compare against it reads as an
    // unrelated hand-edited scene — kept, and reported as a conflict —
    // rather than silently overwritten, which is the whole point of
    // detaching it.
    const rebaked = (await run.invoke("rebake_timeline_code", {
      timeline_id: set.timeline_id
    })) as {
      conflicts: Array<{ scene: string; reason: string }>;
      scenes: Array<{ name: string; edited: boolean }>;
    };
    expect(rebaked.conflicts).toEqual([{ scene: "one", reason: "edited since the last bake" }]);
    expect(rebaked.scenes).toEqual([{ name: "one", group_id: expect.any(String), edited: true }]);

    const untouched = await TimelineSequence.findById(set.timeline_id);
    const untouchedText = untouched!
      .toDocument()
      .clips.find((c: { mediaType: string }) => c.mediaType === "text");
    expect(untouchedText?.textStyle?.text).toBe("built");
  });
});

describe("the craft layer", () => {
  it("builds a scene from backdrop/streaks/enter/count/finish that validates clean in the real host", async () => {
    initTestDb();
    const context = createMockContext();
    const run = createCapabilityRun({ context, gate: UNGATED });
    const session = createChatCodeActSession({
      tools: [
        "create_timeline",
        "set_timeline_document",
        "validate_timeline",
        "get_timeline"
      ].map((name) => ({
        name,
        description: name,
        inputSchema: { type: "object", properties: {} }
      })),
      sandboxModuleCatalog: catalog,
      executeTool: (call) => run.invoke(call.name, call.args)
    });
    const observation = JSON.parse(
      await session.executeAction({
        code: `
      import { video } from "@nodetool-ai/sandbox-timeline";
      const W = 1080, H = 1920, FPS = 30;
      const v = video({ width: W, height: H, fps: FPS, palette: { accent: "#34d399" } });
      const scene = v.scene("hero", 3, (s) => {
        s.backdrop();
        s.streaks();
        const title = s.text("Halo", { name: "title", size: 96, weight: 700, color: "#fff" });
        title.enter({ from: { scale: 1.35, blur: 26, opacity: 0 }, at: 0.2, dur: 0.267, ease: "outExpo" });
        const ticker = s.text("0", { size: 60, weight: 700, color: "#fff" });
        ticker.count({ from: 0, to: 1284, at: 0.4, dur: 1.333, prefix: "$" });
        s.finish();
      });
      v.series([scene]);
      return await v.save(nodetool.timelines, { name: "Craft" });
    `
      })
    );
    expect(observation).toMatchObject({ ok: true });
    const row = await TimelineSequence.findById(
      (observation.result as { timeline_id: string }).timeline_id
    );
    const stored = row!.toDocument();
    expect(stored.clips.some((c) => c.repeater != null)).toBe(true);
    expect(
      stored.clips.some((c) =>
        (c.effects ?? []).some((e) => e.type === "generator")
      )
    ).toBe(true);
    expect(
      stored.clips.some((c) =>
        (c.animations ?? []).some((a) => a.textAnimator?.kind === "ticker")
      )
    ).toBe(true);
    const finishClip = stored.clips.find(
      (c) => c.mediaType === "adjustment" && c.name === "finish"
    );
    expect(finishClip).toBeDefined();
    const colorEffect = (finishClip!.effects ?? []).find(
      (e) => e.type === "color"
    ) as { brightness?: number } | undefined;
    expect(colorEffect === undefined || colorEffect.brightness === 0).toBe(
      true
    );
    const validation = await run.invoke("validate_timeline", {
      timeline_id: (observation.result as { timeline_id: string }).timeline_id
    });
    expect(validation).toMatchObject({ ok: true, errors: [] });
  });
});

describe("the builder's text tracking", () => {
  const packEntry = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "sandbox-packs",
    "sandbox-timeline",
    "sandbox",
    "index.js"
  );

  it("reads tracking in em, a fraction of the font size", async () => {
    const { video } = await import(packEntry);
    const v = video({ width: 1920, height: 1080, fps: 30 });
    let clip: { textStyle: { letterSpacingPx: number } } | undefined;
    v.scene("s", 1, (s) => {
      clip = s.text("MERIDIAN", { size: 80, weight: 700, color: "#fff", tracking: -0.04 });
    });
    expect(clip!.textStyle.letterSpacingPx).toBeCloseTo(-3.2);
  });

  it("refuses a tracking value in pixels or percent", async () => {
    // A run passed `tracking: 10` and `-1`: 340px between 34px letters, and
    // an 84px word folded onto itself.
    const { video } = await import(packEntry);
    const v = video({ width: 1920, height: 1080, fps: 30 });
    expect(() =>
      v.scene("s", 1, (s) => {
        s.text("STUDIO", { size: 34, weight: 500, color: "#fff", tracking: 10 });
      })
    ).toThrow(/tracking is in em/);
  });
});

describe("video() authoring surface", () => {
  const packEntry = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "sandbox-packs",
    "sandbox-timeline",
    "sandbox",
    "index.js"
  );

  it("nests local time: a seq at 1.2s inside a scene placed at 3s puts a child's animation window at absolute 4.2s", async () => {
    const { video } = await import(packEntry);
    const v = video({ width: 1920, height: 1080, fps: 30 });
    const s1 = v.scene("s1", 3, (s: { text: (str: string, o: object) => unknown }) => {
      s.text("a", {});
    });
    const s2 = v.scene(
      "s2",
      2,
      (s: {
        seq: (
          at: number,
          dur: number,
          fn: (q: { text: (str: string, o: object) => { enter: (o: object) => void } }) => void
        ) => void;
      }) => {
        s.seq(1.2, 1.0, (q) => {
          const chip = q.text("hello", {});
          chip.enter({ from: { offsetY: 40, opacity: 0 }, at: 0, dur: 0.2 });
        });
      }
    );
    v.series([s1, s2]);
    const document = v._document as {
      clips: Array<{
        textStyle?: { text?: string };
        startMs: number;
        animations?: Array<{ delayMs: number }>;
      }>;
    };
    const clip = document.clips.find((c) => c.textStyle?.text === "hello")!;
    expect(clip.startMs).toBe(4200); // s2 absolute start (3000, s1's own 3s) + the seq's 1.2s
    expect(clip.startMs + clip.animations![0]!.delayMs).toBe(4200); // enter's own `at: 0` adds nothing further
  });

  it("compiles stack/row to a Yoga flex ClipLayout, reparenting children onto the container", async () => {
    const { video } = await import(packEntry);
    const v = video({ width: 1920, height: 1080, fps: 30 });
    let stackId = "", rowId = "";
    let titleId = "", subId = "", aId = "", bId = "";
    const scene = v.scene(
      "s",
      1,
      (s: {
        text: (str: string, o: object) => { id: string };
        stack: (children: unknown[], o: object) => { id: string; layout: unknown };
        row: (children: unknown[], o: object) => { id: string; layout: unknown };
      }) => {
        const title = s.text("Title", { size: 96 });
        const sub = s.text("Sub", { size: 40 });
        const stack = s.stack([title, sub], { gap: 24 });
        stackId = stack.id;
        titleId = title.id;
        subId = sub.id;
        const a = s.text("A", {});
        const b = s.text("B", {});
        const row = s.row([a, b], { gap: 10 });
        rowId = row.id;
        aId = a.id;
        bId = b.id;
      }
    );
    v.series([scene]);
    const document = v._document as {
      clips: Array<{
        id: string;
        parentId?: string;
        layout?: { display: string; flexDirection: string; gap?: number; alignItems?: string };
      }>;
    };
    const stackClip = document.clips.find((c) => c.id === stackId)!;
    expect(stackClip.layout).toEqual({ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 24 });
    const rowClip = document.clips.find((c) => c.id === rowId)!;
    expect(rowClip.layout).toEqual({ display: "flex", flexDirection: "row", alignItems: "flex-start", gap: 10 });
    // Children are REAL children now (parentId), not a `children` id list.
    expect(document.clips.find((c) => c.id === titleId)!.parentId).toBe(stackId);
    expect(document.clips.find((c) => c.id === subId)!.parentId).toBe(stackId);
    expect(document.clips.find((c) => c.id === aId)!.parentId).toBe(rowId);
    expect(document.clips.find((c) => c.id === bId)!.parentId).toBe(rowId);
  });

  it("resolves a stack's children to real Yoga-computed positions, stacked top to bottom by gap", async () => {
    const { resolveClipLayoutsWithDiagnostics } = await import("@nodetool-ai/timeline/scene");
    const { video } = await import(packEntry);
    const v = video({ width: 1920, height: 1080, fps: 30 });
    let stackId = "", aId = "", bId = "";
    const scene = v.scene(
      "s",
      1,
      (s: {
        rect: (w: number, h: number, fill: string, o: object) => { id: string };
        stack: (children: unknown[], o: object) => { id: string };
      }) => {
        const a = s.rect(200, 60, "#fff", {});
        const b = s.rect(200, 60, "#fff", {});
        const stack = s.stack([a, b], { at: { x: 0, y: 0 }, anchor: "top", gap: 20 });
        stackId = stack.id;
        aId = a.id;
        bId = b.id;
      }
    );
    v.series([scene]);
    const document = v._document as {
      clips: Array<{
        id: string;
        parentId?: string;
        mediaType: string;
        transform?: { position: { x: number; y: number } };
      }>;
    };
    const canvas = { width: 1920, height: 1080 };
    const { transforms, resolvedBoxes } = resolveClipLayoutsWithDiagnostics(
      document.clips as never,
      canvas
    );
    const stackBox = resolvedBoxes.get(stackId)!;
    // anchor: "top" puts the container's top edge (not its center) at the
    // authored `at`, so the stack's own box starts at y = 0.
    expect(stackBox.y).toBeCloseTo(0, 5);
    const aTransform = transforms.get(aId)!;
    const bTransform = transforms.get(bId)!;
    // Two 60px-tall rects stacked with a 20px gap: the second sits exactly
    // 80px (60 + 20) below the first, purely from the real Yoga resolver.
    expect(bTransform.position.y - aTransform.position.y).toBeCloseTo(80, 5);
  });

  it("series overlaps two scenes by exactly the transition's duration, on alternating tracks, and sets transitionIn on the incoming scene", async () => {
    const { video } = await import(packEntry);
    const v = video({ width: 1920, height: 1080, fps: 30 });
    const a = v.scene("a", 2, (s: { text: (str: string, o: object) => unknown }) => s.text("x", {}));
    const b = v.scene("b", 2, (s: { text: (str: string, o: object) => unknown }) => s.text("y", {}));
    v.series([a, v.transition("wipe", 0.4, { direction: "left" }), b]);
    const document = v._document as {
      clips: Array<{
        name: string;
        mediaType: string;
        startMs: number;
        durationMs: number;
        trackId: string;
        transitionIn?: { type: string; durationMs: number; direction?: string };
        textStyle?: { text?: string };
      }>;
    };
    const groupA = document.clips.find((c) => c.mediaType === "group" && c.name === "a")!;
    const groupB = document.clips.find((c) => c.mediaType === "group" && c.name === "b")!;
    expect(groupA.startMs).toBe(0);
    expect(groupA.durationMs).toBe(2000);
    // b starts exactly `wipe`'s 400ms before a's own end — the overlap window
    // IS the transition's authored duration, not an approximation of it.
    expect(groupB.startMs).toBe(groupA.startMs + groupA.durationMs - 400);
    expect(groupB.transitionIn).toEqual({ type: "wipe", durationMs: 400, direction: "left" });
    const clipX = document.clips.find((c) => c.textStyle?.text === "x")!;
    const clipY = document.clips.find((c) => c.textStyle?.text === "y")!;
    expect(clipX.trackId).not.toBe(clipY.trackId); // alternating banks: never share a track
  });

  it("accepts start/center/end alignment and refuses an unknown one", async () => {
    const { video } = await import(packEntry);
    const v = video({ width: 1920, height: 1080, fps: 30 });
    for (const align of ["start", "center", "end"] as const) {
      expect(() =>
        v.scene(
          `s-${align}`,
          1,
          (s: {
            text: (str: string, o: object) => unknown;
            stack: (children: unknown[], o: object) => unknown;
          }) => {
            const a = s.text("A", {});
            const b = s.text("B", {});
            s.stack([a, b], { align });
          }
        )
      ).not.toThrow();
    }
    expect(() =>
      v.scene(
        "s-bad",
        1,
        (s: { text: (str: string, o: object) => unknown; stack: (children: unknown[], o: object) => unknown }) => {
          const a = s.text("A", {});
          s.stack([a], { align: "middle" });
        }
      )
    ).toThrow(/align must be/);
  });

  it("enter/exit hold correct values before and after their windows, sampled with the real timeline animation sampler", async () => {
    const { video } = await import(packEntry);
    const { compileClipAnimations, sampleAnimations } = await import("@nodetool-ai/timeline");
    const v = video({ width: 1920, height: 1080, fps: 30 });
    let enterClip: { animations: unknown; durationMs: number } | undefined;
    let exitClip: { animations: unknown; durationMs: number } | undefined;
    v.scene(
      "s",
      3,
      (s: {
        rect: (
          w: number,
          h: number,
          fill: string,
          o: object
        ) => { enter: (o: object) => void; exit: (o: object) => void; animations: unknown; durationMs: number };
      }) => {
        enterClip = s.rect(100, 100, "#fff", {});
        enterClip.enter({ from: { opacity: 0 }, at: 0.5, dur: 0.2 });
        exitClip = s.rect(100, 100, "#fff", {});
        exitClip.exit({ to: { opacity: 0 }, at: 1.0, dur: 0.2 });
      }
    );
    const canvas = { width: 1920, height: 1080 };

    // enter: before its 0.5s delay, holds the `from` value (0); after its
    // window (0.7s), settles at rest (1) — the same value, so no jump.
    const enterCompiled = compileClipAnimations(
      enterClip!.animations as never,
      enterClip!.durationMs,
      canvas
    );
    expect(sampleAnimations(enterCompiled, 0).opacity).toBe(0);
    expect(sampleAnimations(enterCompiled, 600).opacity).toBeGreaterThan(0);
    expect(sampleAnimations(enterCompiled, 600).opacity).toBeLessThan(1);
    expect(sampleAnimations(enterCompiled, 800).opacity).toBe(1);

    // exit: before its 1.0s delay, holds rest (1); after its window (1.2s),
    // holds its `to` value (0).
    const exitCompiled = compileClipAnimations(exitClip!.animations as never, exitClip!.durationMs, canvas);
    expect(sampleAnimations(exitCompiled, 0).opacity).toBe(1);
    expect(sampleAnimations(exitCompiled, 1100).opacity).toBeGreaterThan(0);
    expect(sampleAnimations(exitCompiled, 1100).opacity).toBeLessThan(1);
    expect(sampleAnimations(exitCompiled, 1300).opacity).toBe(0);
  });

  it("returns showcase warnings on save when showcase: true", async () => {
    const timelineId = "d".repeat(32);
    const showcaseValidateCalls: unknown[] = [];
    const session = createChatCodeActSession({
      tools: [
        "create_timeline",
        "set_timeline_document",
        "validate_timeline"
      ].map((name) => ({
        name,
        description: name,
        inputSchema: { type: "object", properties: {} }
      })),
      sandboxModuleCatalog: catalog,
      executeTool: async (call) => {
        if (call.name === "create_timeline") return { timeline_id: timelineId };
        if (call.name === "set_timeline_document") return { written: true };
        if (call.name === "validate_timeline") {
          showcaseValidateCalls.push(call.args);
          const args = call.args as { tier?: string };
          return {
            ok: true,
            errors: [],
            warnings: args.tier === "showcase" ? [{ code: "scene_count_low", message: "few scenes" }] : []
          };
        }
        return { ok: true, errors: [] };
      }
    });
    const observation = JSON.parse(
      await session.executeAction({
        code: `
import { video } from "@nodetool-ai/sandbox-timeline";
const v = video({ width: 1920, height: 1080, fps: 30 });
v.series([v.scene("s", 1, (s) => { s.text("hi", {}); })]);
return await v.save(nodetool.timelines, { name: "Showcase", showcase: true });
`
      })
    );
    expect(observation).toMatchObject({
      ok: true,
      result: { timeline_id: timelineId, warnings: [{ code: "scene_count_low" }] }
    });
    expect(showcaseValidateCalls.some((args) => (args as { tier?: string }).tier === "showcase")).toBe(true);
  });
});

describe("media clips, text passthrough, and path commands", () => {
  it("maps s.video()/s.audio()'s friendly fields to the real document fields", async () => {
    const observation = JSON.parse(
      await chatSession(catalog).executeAction({
        code: `
import { video } from "@nodetool-ai/sandbox-timeline";
const v = video({ width: 1920, height: 1080, fps: 30 });
let clip, remapClip;
v.scene("s", 3, (s) => {
  clip = s.video("asset://vid1", { in: 5, dur: 2, volume: -6, fadeIn: 0.3, fadeOut: 0.2, speed: 1.5, mute: false });
  remapClip = s.audio("asset://aud1", { remap: [{ t: 0, sourceAt: 18 }, { t: 1, sourceAt: 21, ease: "easeIn" }] });
});
return {
  mediaType: clip.mediaType,
  currentAssetId: clip.currentAssetId,
  inPointMs: clip.inPointMs,
  volumeDb: clip.volumeDb,
  fadeInMs: clip.fadeInMs,
  fadeOutMs: clip.fadeOutMs,
  speedMultiplier: clip.speedMultiplier,
  muted: clip.muted,
  audioMediaType: remapClip.mediaType,
  timeRemap: remapClip.timeRemap
};
`
      })
    );
    expect(observation).toMatchObject({
      ok: true,
      result: {
        mediaType: "video",
        currentAssetId: "asset://vid1",
        inPointMs: 5000,
        volumeDb: -6,
        fadeInMs: 300,
        fadeOutMs: 200,
        speedMultiplier: 1.5,
        muted: false,
        audioMediaType: "audio",
        timeRemap: {
          keyframes: [
            { t: 0, sourceMs: 18000 },
            { t: 1, sourceMs: 21000, easing: "easeIn" }
          ]
        }
      }
    });
  });

  it("gives v.audio() and v.music() their own tracks, distinct by default", async () => {
    const observation = JSON.parse(
      await chatSession(catalog).executeAction({
        code: `
import { video } from "@nodetool-ai/sandbox-timeline";
const v = video({ width: 1920, height: 1080, fps: 30 });
v.series([v.scene("s", 2, (s) => { s.text("x", {}); })]);
const score = v.audio("asset://score.wav", { at: 0, volume: -2, fadeIn: 0.35, fadeOut: 0.4 });
const music = v.music("asset://music.wav", { at: 0.5, dur: 1 });
return {
  scoreTrack: score.trackId,
  musicTrack: music.trackId,
  scoreFields: { volumeDb: score.volumeDb, fadeInMs: score.fadeInMs, fadeOutMs: score.fadeOutMs, mediaType: score.mediaType },
  tracks: v._document.tracks.filter((t) => t.type === "audio").map((t) => t.id)
};
`
      })
    );
    expect(observation).toMatchObject({
      ok: true,
      result: {
        scoreTrack: "t_audio",
        musicTrack: "t_music",
        scoreFields: { fadeInMs: 367, fadeOutMs: 400, mediaType: "audio" },
        tracks: expect.arrayContaining(["t_audio", "t_music"])
      }
    });
    expect(observation.result.scoreFields.volumeDb).toBeCloseTo(-2);
  });

  it("accepts italic and a textStyle passthrough with no post-creation mutation", async () => {
    const observation = JSON.parse(
      await chatSession(catalog).executeAction({
        code: `
import { video } from "@nodetool-ai/sandbox-timeline";
const v = video({ width: 1920, height: 1080, fps: 30 });
let clip;
v.scene("s", 1, (s) => {
  clip = s.text("Hi", { italic: true, style: { lineHeight: 1.4, stroke: { color: "#000000", widthPx: 2 } } });
});
return clip.textStyle;
`
      })
    );
    expect(observation).toMatchObject({
      ok: true,
      result: {
        fontStyle: "italic",
        lineHeight: 1.4,
        stroke: { color: "#000000", widthPx: 2 }
      }
    });
  });

  it("builds correct path data for H/V and an elliptical arc, scaling only the point and radius terms", async () => {
    const observation = JSON.parse(
      await chatSession(catalog).executeAction({
        code: `
import { video } from "@nodetool-ai/sandbox-timeline";
const v = video({ width: 1000, height: 500, fps: 30 });
let clip;
v.scene("s", 1, (s) => {
  clip = s.path([["M", -100, 0], ["A", 50, 30, 10, 1, 0, 100, 0], ["H", 150], ["V", 50], ["Z"]], { stroke: "#fff" });
});
return clip.shapeStyle.d;
`
      })
    );
    expect(observation.ok).toBe(true);
    const d = observation.result as string;
    // M: point (x,y) both scaled — x by width, y by height.
    expect(d).toContain("M0.40000 0.50000");
    // A: rx by width, ry by height, angle and flags unscaled, endpoint scaled.
    expect(d).toContain("A0.05000 0.06000 10 1 0 0.60000 0.50000");
    // H: one coordinate, scaled on its own axis (x, by width) only.
    expect(d).toContain("H0.65000");
    // V: one coordinate, scaled on its own axis (y, by height) only.
    expect(d).toContain("V0.60000");
    expect(d).toContain("Z");
  });

  it("round-trips a gradient fill and lineHeight through the textStyle passthrough with no post-creation mutation", async () => {
    // Guards the makeClip/text() field-ordering bug: a caller-provided
    // textStyle field must not be clobbered by a later default.
    const observation = JSON.parse(
      await chatSession(catalog).executeAction({
        code: `
import { video } from "@nodetool-ai/sandbox-timeline";
const v = video({ width: 1920, height: 1080, fps: 30 });
let clip;
v.scene("s", 1, (s) => {
  clip = s.text("Hi", {
    style: {
      fill: { type: "linear", angle: 0, stops: [{ offset: 0, color: "#fff" }, { offset: 1, color: "#000" }] },
      lineHeight: 1.4,
      stroke: { color: "#000000", widthPx: 2 }
    }
  });
});
return clip.textStyle;
`
      })
    );
    expect(observation).toMatchObject({
      ok: true,
      result: {
        fill: { type: "linear", angle: 0, stops: [{ offset: 0, color: "#fff" }, { offset: 1, color: "#000" }] },
        lineHeight: 1.4,
        stroke: { color: "#000000", widthPx: 2 }
      }
    });
  });
});

describe("presets, typewriter, ticker options, midi, beats, and text-on-path", () => {
  it("el.preset() emits a catalog preset with params, not hand-baked curves", async () => {
    const observation = JSON.parse(
      await chatSession(catalog).executeAction({
        code: `
import { video } from "@nodetool-ai/sandbox-timeline";
const v = video({ width: 1920, height: 1080, fps: 30 });
let clip;
v.scene("s", 1, (s) => {
  clip = s.text("Pop", {});
  clip.preset("pop", { at: 0.2, dur: 0.4, ease: "out", scale: 1.4 });
});
return clip.animations[0];
`
      })
    );
    expect(observation).toMatchObject({
      ok: true,
      result: { role: "in", preset: "pop", delayMs: 200, durationMs: 400, easing: "easeOut", params: { scale: 1.4 } }
    });
    // Never a hand-baked custom curve for a catalog preset.
    expect(observation.result.custom).toBeUndefined();
  });

  it("el.typewriter() replaces the clip's animations with a typewriter preset and an optional caret", async () => {
    const observation = JSON.parse(
      await chatSession(catalog).executeAction({
        code: `
import { video } from "@nodetool-ai/sandbox-timeline";
const v = video({ width: 1920, height: 1080, fps: 30 });
let clip;
v.scene("s", 1, (s) => {
  clip = s.text("Typing...", {});
  clip.enter({ from: { opacity: 0 } }); // replaced, not appended, by typewriter()
  clip.typewriter({ at: 0.1, dur: 1.2, caret: { color: "#fff", widthPx: 3, blinkPeriodMs: 800 } });
});
return clip.animations;
`
      })
    );
    expect(observation).toMatchObject({
      ok: true,
      result: [{ role: "in", preset: "typewriter", delayMs: 100, durationMs: 1200, caret: { color: "#fff", widthPx: 3, blinkPeriodMs: 800 } }]
    });
    expect(observation.result).toHaveLength(1);
  });

  it("el.count() accepts padTo, and el.scramble() emits the scramble textAnimator", async () => {
    const observation = JSON.parse(
      await chatSession(catalog).executeAction({
        code: `
import { video } from "@nodetool-ai/sandbox-timeline";
const v = video({ width: 1920, height: 1080, fps: 30 });
let countClip, scrambleClip;
v.scene("s", 1, (s) => {
  countClip = s.text("0", {});
  countClip.count({ from: 0, to: 9, at: 0, dur: 1, padTo: 2 });
  scrambleClip = s.text("SCRAMBLE", {});
  scrambleClip.scramble({ at: 0, dur: 0.5, charset: "ABC", seed: 7 });
});
return { count: countClip.animations[0].textAnimator, scramble: scrambleClip.animations[0].textAnimator };
`
      })
    );
    expect(observation).toMatchObject({
      ok: true,
      result: {
        count: { kind: "ticker", from: 0, to: 9, padTo: 2 },
        scramble: { kind: "scramble", charset: "ABC", seed: 7 }
      }
    });
    // el.count() drives its reveal entirely through `textAnimator`; it must
    // not also carry a curve that never changes (the old NOOP 1→1 opacity
    // curve this animation used to be built with).
    expect(observation.result.count).not.toHaveProperty("curves");
  });

  it("el.count() emits no property curve — custom.curves is empty, not a NOOP 1→1 opacity curve", async () => {
    const observation = JSON.parse(
      await chatSession(catalog).executeAction({
        code: `
import { video } from "@nodetool-ai/sandbox-timeline";
const v = video({ width: 1920, height: 1080, fps: 30 });
let countClip;
v.scene("s", 1, (s) => {
  countClip = s.text("0", {});
  countClip.count({ from: 0, to: 9, at: 0, dur: 1 });
});
return { custom: countClip.animations[0].custom };
`
      })
    );
    expect(observation).toMatchObject({ ok: true, result: { custom: { curves: [] } } });
  });

  it("s.flash() tags its opacity ramp role: \"out\", not the default \"in\"", async () => {
    const observation = JSON.parse(
      await chatSession(catalog).executeAction({
        code: `
import { video } from "@nodetool-ai/sandbox-timeline";
const v = video({ width: 1920, height: 1080, fps: 30 });
let flashClip;
v.scene("s", 1, (s) => {
  flashClip = s.flash({ dur: 0.27, peak: 0.7 });
});
return { role: flashClip.animations[0].role, curve: flashClip.animations[0].custom.curves[0] };
`
      })
    );
    expect(observation).toMatchObject({
      ok: true,
      result: { role: "out", curve: { property: "opacity" } }
    });
  });

  it("v.midi() creates its own track with the instrument shorthand, notes in beats converted to ticks", async () => {
    const observation = JSON.parse(
      await chatSession(catalog).executeAction({
        code: `
import { video } from "@nodetool-ai/sandbox-timeline";
const v = video({ width: 1920, height: 1080, fps: 30 });
v.series([v.scene("s", 3, (s) => { s.text("x", {}); })]);
const clip = v.midi("t_drums", [[0, 36, 0.25, 110], [1, 39, 0.25, 90]], { instrument: "dr1-tr-void" });
const track = v._document.tracks.find((t) => t.id === "t_drums");
return { mediaType: clip.mediaType, notes: clip.notes.map((n) => ({ pitch: n.pitch, velocity: n.velocity, startTick: n.startTick, durationTick: n.durationTick })), track };
`
      })
    );
    expect(observation).toMatchObject({
      ok: true,
      result: {
        mediaType: "midi",
        notes: [
          { pitch: 36, velocity: 110, startTick: 0, durationTick: 240 },
          { pitch: 39, velocity: 90, startTick: 960, durationTick: 240 }
        ],
        track: { id: "t_drums", type: "midi", instrument: { preset: "dr1-tr-void" } }
      }
    });
  });

  it("v.beats() sets document tempo, writes markers directly, and returns only a snap op for v.save's ops", async () => {
    // Markers are a plain document field, written directly (not through an
    // edit op), so a script that only marks beats bakes hermetically — see
    // timeline-code-bake.ts's "no ops" rule. Only `snap` (which moves
    // existing clips) still needs one.
    const observation = JSON.parse(
      await chatSession(catalog).executeAction({
        code: `
import { video } from "@nodetool-ai/sandbox-timeline";
const v = video({ width: 1920, height: 1080, fps: 30 });
v.series([v.scene("s", 3, (s) => { s.text("x", {}); })]);
const ops = v.beats({ bpm: 120, snap: ["t_drums"] });
return { tempo: v._document.tempo, markers: v._document.markers, ops };
`
      })
    );
    expect(observation).toMatchObject({
      ok: true,
      result: {
        tempo: { bpm: 120, offsetMs: 0 },
        ops: [{ op: "snap_to_beats", targets: ["t_drums"], bpm: 120 }]
      }
    });
    expect(observation.result.markers.length).toBeGreaterThan(0);
    expect(observation.result.markers[0]).toMatchObject({ timeMs: 0, label: "Beat 1" });
  });

  it("s.text()'s path option builds text-on-path from the same pathData formatter as s.path()", async () => {
    const observation = JSON.parse(
      await chatSession(catalog).executeAction({
        code: `
import { video } from "@nodetool-ai/sandbox-timeline";
const v = video({ width: 1000, height: 500, fps: 30 });
let onPath, shape;
v.scene("s", 1, (s) => {
  onPath = s.text("Curve", { path: [["M", -100, 0], ["L", 100, 0]] });
  shape = s.path([["M", -100, 0], ["L", 100, 0]], { stroke: "#fff" });
});
return { textPath: onPath.textStyle.path, shapePath: shape.shapeStyle.d };
`
      })
    );
    expect(observation.ok).toBe(true);
    expect(observation.result.textPath).toBe(observation.result.shapePath);
    expect(observation.result.textPath).toBe("M0.40000 0.50000 L0.60000 0.50000");
  });

  it("s.adjust() inside a scene is scoped to that scene's own group surface (the way to grade one scene)", async () => {
    const observation = JSON.parse(
      await chatSession(catalog).executeAction({
        code: `
import { video } from "@nodetool-ai/sandbox-timeline";
const v = video({ width: 1920, height: 1080, fps: 30 });
let grade;
v.scene("grade-scene", 1, (s) => {
  s.rect(100, 100, "#fff", {});
  grade = s.adjust([{ type: "color", saturation: 0.5 }]);
});
return { parentId: grade.parentId, mediaType: grade.mediaType };
`
      })
    );
    expect(observation).toMatchObject({
      ok: true,
      // An adjustment clip's own parentId is the scene's group id — the
      // structural precondition for "group-scoped" per packages/timeline/AGENTS.md
      // ("Inside a group it treats that group's surface and nothing outside").
      result: { parentId: "grade-scene", mediaType: "adjustment" }
    });
  });
});

describe("el.expr(), s.noise(), and el.morph()", () => {
  it("bakes a sine to a reduced keyframe-per-frame curve, and a constant prop to no curve at all", async () => {
    const observation = JSON.parse(
      await chatSession(catalog).executeAction({
        code: `
import { video } from "@nodetool-ai/sandbox-timeline";
const v = video({ width: 1920, height: 1080, fps: 30 });
let sinClip, constClip;
v.scene("s", 2, (s) => {
  sinClip = s.rect(50, 50, "#fff", {});
  sinClip.expr((t) => ({ offsetY: Math.sin(t * Math.PI * 2) * 100 }), { at: 0, dur: 1 });
  constClip = s.rect(50, 50, "#fff", {});
  constClip.expr(() => ({ opacity: 0.5 }), { at: 0, dur: 0.5 });
});
return {
  sinKeyframeCount: sinClip.animations[0].custom.curves[0].keyframes.length,
  sinFirst: sinClip.animations[0].custom.curves[0].keyframes[0],
  sinLast: sinClip.animations[0].custom.curves[0].keyframes.at(-1),
  constAnimations: constClip.animations
};
`
      })
    );
    expect(observation.ok).toBe(true);
    // A sine over 30 frames needs many samples to stay within tolerance —
    // fewer than one-per-frame (31) would be the real regression to catch.
    expect(observation.result.sinKeyframeCount).toBeGreaterThan(2);
    expect(observation.result.sinKeyframeCount).toBeLessThanOrEqual(31);
    expect(observation.result.sinFirst).toMatchObject({ t: 0, value: 0 });
    expect(observation.result.sinLast.t).toBeCloseTo(1);
    expect(observation.result.sinLast.value).toBeCloseTo(0, 1);
    // A prop constant across every sampled frame emits no animation at all.
    expect(observation.result.constAnimations).toBeUndefined();
  });

  it("reduces a linear expr() ramp to two keyframes and a stepped style track to its transition points", async () => {
    const observation = JSON.parse(
      await chatSession(catalog).executeAction({
        code: `
import { video } from "@nodetool-ai/sandbox-timeline";
const v = video({ width: 1920, height: 1080, fps: 30 });
let linClip, colorClip;
v.scene("s", 1, (s) => {
  linClip = s.rect(50, 50, "#fff", {});
  linClip.expr((t) => ({ offsetX: t * 100 }), { at: 0, dur: 1 });
  colorClip = s.text("hi", {});
  colorClip.expr((t, { p }) => ({ "text.color": p < 0.5 ? "#ffffff" : "#ff0000" }), { at: 0, dur: 1 });
});
return {
  linear: linClip.animations[0].custom.curves[0].keyframes,
  color: colorClip.animations[0].styleTracks
};
`
      })
    );
    expect(observation).toMatchObject({
      ok: true,
      result: {
        linear: [{ t: 0, value: 0 }, { t: 1, value: 100 }],
        color: [{
          target: "text.color",
          keyframes: [{ t: 0, value: "#ffffff" }, { value: "#ff0000" }, { t: 1, value: "#ff0000" }]
        }]
      }
    });
    expect(observation.result.color[0].keyframes).toHaveLength(3);
  });

  it("s.noise(seed) is deterministic and repeatable across calls with the same seed", async () => {
    const observation = JSON.parse(
      await chatSession(catalog).executeAction({
        code: `
import { video } from "@nodetool-ai/sandbox-timeline";
const v = video({ width: 1920, height: 1080, fps: 30 });
let a, b;
v.scene("s", 1, (s) => {
  a = s.noise(3)(0.5);
  b = s.noise(3)(0.5);
});
return { a, b, inRange: a >= 0 && a <= 1 };
`
      })
    );
    expect(observation).toMatchObject({ ok: true, result: { inRange: true } });
    expect(observation.result.a).toBe(observation.result.b);
  });

  it("el.morph() resamples both shapes to a common compatible outline and animates shape.d", async () => {
    const observation = JSON.parse(
      await chatSession(catalog).executeAction({
        code: `
import { video } from "@nodetool-ai/sandbox-timeline";
const v = video({ width: 1920, height: 1080, fps: 30 });
let triangle;
v.scene("s", 1, (s) => {
  triangle = s.path([["M", -50, -50], ["L", 50, -50], ["L", 0, 50], ["Z"]], { stroke: "#fff" });
  triangle.morph(
    [["M", -60, 0], ["L", -20, -60], ["L", 20, -60], ["L", 60, 0], ["L", 20, 60], ["L", -20, 60], ["Z"]],
    { at: 0.2, dur: 0.5 }
  );
});
const track = triangle.animations[0].styleTracks[0];
return {
  target: track.target,
  startD: track.keyframes[0].value,
  endD: track.keyframes[1].value,
  shapeStyleD: triangle.shapeStyle.d,
  // Token counts (letters + numbers) must match for the document's own
  // morphCompatiblePath to accept the pair.
  startTokenCount: track.keyframes[0].value.match(/[a-zA-Z]|[-+]?\\d+\\.?\\d*/g).length,
  endTokenCount: track.keyframes[1].value.match(/[a-zA-Z]|[-+]?\\d+\\.?\\d*/g).length
};
`
      })
    );
    expect(observation.ok).toBe(true);
    expect(observation.result.target).toBe("shape.d");
    expect(observation.result.startTokenCount).toBe(observation.result.endTokenCount);
    // The clip's own shapeStyle.d is rewritten to the resampled start shape.
    expect(observation.result.shapeStyleD).toBe(observation.result.startD);
  });

  it("el.morph() throws on a curved path rather than silently authoring an incompatible morph", async () => {
    const observation = JSON.parse(
      await chatSession(catalog).executeAction({
        code: `
import { video } from "@nodetool-ai/sandbox-timeline";
const v = video({ width: 1920, height: 1080, fps: 30 });
v.scene("s", 1, (s) => {
  const arc = s.path([["M", -50, 0], ["A", 50, 50, 0, 1, 0, 50, 0]], { stroke: "#fff" });
  arc.morph([["M", -50, -50], ["L", 50, 50]]);
});
`
      })
    );
    expect(observation.ok).toBe(false);
    expect(observation.error).toContain("morph()");
  });

  it("strips morph()'s private _pathPoints bookkeeping from the saved document", async () => {
    const observation = JSON.parse(
      await chatSession(catalog).executeAction({
        code: `
import { video } from "@nodetool-ai/sandbox-timeline";
const v = video({ width: 1920, height: 1080, fps: 30 });
const scene = v.scene("s", 1, (s) => {
  s.path([["M", -50, -50], ["L", 50, -50], ["L", 0, 50], ["Z"]], { stroke: "#fff" });
});
v.series([scene]);
return { privateKeys: v._document.clips.flatMap((c) => Object.keys(c).filter((k) => k.startsWith("_"))) };
`
      })
    );
    expect(observation.ok).toBe(true);
    expect(observation.result.privateKeys).toEqual([]);
  });

  it("el.tween()'s by/staggerMs let a glyph.* style track validate clean, and inherit a co-authored enter()'s stagger", async () => {
    const { validateTimelineSequence } = await import(
      "@nodetool-ai/execution/timeline-debug"
    );
    const observation = JSON.parse(
      await chatSession(catalog).executeAction({
        code: `
import { video } from "@nodetool-ai/sandbox-timeline";
const v = video({ width: 1920, height: 1080, fps: 30 });
let explicit, inherited;
v.scene("s", 1, (s) => {
  explicit = s.text("Explicit stagger", { anchor: "left" });
  explicit.tween("glyph.color", [[0, "#888888"], [1, "#ffffff"]], { by: "character", staggerMs: 40 });

  inherited = s.text("Inherited stagger", { anchor: "left" });
  inherited.enter({ from: { opacity: 0 }, by: "word", staggerMs: 90 });
  inherited.tween("glyph.blurPx", [[0, 8], [1, 0]]);
});
return {
  explicitStagger: explicit.animations.find((a) => a.styleTracks).stagger,
  inheritedStagger: inherited.animations.find((a) => a.styleTracks).stagger,
};
`
      })
    );
    expect(observation.ok).toBe(true);
    expect(observation.result.explicitStagger).toEqual({ unit: "character", offsetMs: 40 });
    expect(observation.result.inheritedStagger).toEqual({ unit: "word", offsetMs: 90 });

    // The document itself — built the normal way, through v.series() — must
    // validate clean: glyphTracksNeedStagger must not fire for either track.
    const saved = JSON.parse(
      await chatSession(catalog).executeAction({
        code: `
import { video } from "@nodetool-ai/sandbox-timeline";
const v = video({ width: 1920, height: 1080, fps: 30 });
const scene = v.scene("s", 1, (s) => {
  const explicit = s.text("Explicit stagger", { anchor: "left" });
  explicit.tween("glyph.color", [[0, "#888888"], [1, "#ffffff"]], { by: "character", staggerMs: 40 });
  const inherited = s.text("Inherited stagger", { anchor: "left" });
  inherited.enter({ from: { opacity: 0 }, by: "word", staggerMs: 90 });
  inherited.tween("glyph.blurPx", [[0, 8], [1, 0]]);
});
v.series([scene]);
return { document: v._document };
`
      })
    );
    expect(saved.ok).toBe(true);
    const validation = validateTimelineSequence(saved.result.document, {
      fps: 30,
      width: 1920,
      height: 1080
    });
    expect(
      validation.errors.filter((e: { message: string }) =>
        e.message.includes("glyph tracks without a stagger")
      )
    ).toEqual([]);
  });
});

describe("the four rough edges: mask, rotation/anchor, effect defaults, mw inside a container", () => {
  it("el.animate()'s mask option sets custom.mask, matching a hand-written custom.mask = {...}", async () => {
    const observation = JSON.parse(
      await chatSession(catalog).executeAction({
        code: `
import { video } from "@nodetool-ai/sandbox-timeline";
const v = video({ width: 1920, height: 1080, fps: 30 });
let area;
v.scene("s", 1, (s) => {
  area = s.rect(400, 250, "rgba(0,0,0,0.1)", {});
  area.animate({ wipeProgress: [0, 1] }, { at: 0, dur: 0.4, mask: { direction: "left", softness: 0.02 } });
});
return { mask: area.animations.at(-1).custom.mask };
`
      })
    );
    expect(observation.ok).toBe(true);
    expect(observation.result.mask).toEqual({ direction: "left", softness: 0.02 });
  });

  it("el.enter()'s mask option works the same way as animate()'s", async () => {
    const observation = JSON.parse(
      await chatSession(catalog).executeAction({
        code: `
import { video } from "@nodetool-ai/sandbox-timeline";
const v = video({ width: 1920, height: 1080, fps: 30 });
let title;
v.scene("s", 1, (s) => {
  title = s.text("Reveal", {});
  title.enter({ from: { wipeProgress: 0 }, mask: { direction: "right", softness: 0.1 } });
});
return { mask: title.animations.at(-1).custom.mask };
`
      })
    );
    expect(observation.ok).toBe(true);
    expect(observation.result.mask).toEqual({ direction: "right", softness: 0.1 });
  });

  it("rotation (degrees) and anchor are element options, dropping the raw transform override", async () => {
    const observation = JSON.parse(
      await chatSession(catalog).executeAction({
        code: `
import { video } from "@nodetool-ai/sandbox-timeline";
const v = video({ width: 1920, height: 1080, fps: 30 });
let ring;
v.scene("s", 1, (s) => {
  ring = s.ellipse(140, null, { x: -105, rotation: -90, stroke: "#fff", sw: 14 });
});
return { transform: ring.transform };
`
      })
    );
    expect(observation.ok).toBe(true);
    expect(observation.result.transform.rotation).toBeCloseTo((-90 * Math.PI) / 180, 10);
    // anchor left at its {0.5, 0.5} default — only rotation was authored.
    expect(observation.result.transform.anchor).toEqual({ x: 0.5, y: 0.5 });
    expect(observation.result.transform.position).toEqual({ x: -105, y: 0 });
  });

  it("anchor is a passthrough element option distinct from a text's own anchor: string", async () => {
    const observation = JSON.parse(
      await chatSession(catalog).executeAction({
        code: `
import { video } from "@nodetool-ai/sandbox-timeline";
const v = video({ width: 1920, height: 1080, fps: 30 });
let shape;
v.scene("s", 1, (s) => {
  shape = s.rect(100, 100, "#fff", { anchor: { x: 0, y: 1 } });
});
return { transform: shape.transform };
`
      })
    );
    expect(observation.ok).toBe(true);
    expect(observation.result.transform.anchor).toEqual({ x: 0, y: 1 });
  });

  it("clip effects and v.adjust() fill id/enabled:true for an entry that leaves them out, without touching an explicit id or enabled:false", async () => {
    const observation = JSON.parse(
      await chatSession(catalog).executeAction({
        code: `
import { video } from "@nodetool-ai/sandbox-timeline";
const v = video({ width: 1920, height: 1080, fps: 30 });
let glow, named;
const scene = v.scene("s", 1, (s) => {
  glow = s.group({ effects: [{ type: "glow", radius: 30, intensity: 0.9, color: "#fff" }] });
  named = s.group({ effects: [{ id: "kept", type: "glow", enabled: false, radius: 10 }] });
});
v.series([scene]);
v.adjust([{ type: "vignette", amount: 0.2 }], { name: "finish", trackId: "t_finish" });
return {
  autoId: typeof glow.effects[0].id,
  autoEnabled: glow.effects[0].enabled,
  keptId: named.effects[0].id,
  keptEnabled: named.effects[0].enabled,
  adjustEffect: v._document.clips.find((c) => c.name === "finish").effects[0]
};
`
      })
    );
    expect(observation.ok).toBe(true);
    expect(observation.result.autoId).toBe("string");
    expect(observation.result.autoEnabled).toBe(true);
    expect(observation.result.keptId).toBe("kept");
    expect(observation.result.keptEnabled).toBe(false);
    expect(typeof observation.result.adjustEffect.id).toBe("string");
    expect(observation.result.adjustEffect.enabled).toBe(true);
  });

  it("a text's mw is ignored once it sits inside a stack/row (documented, not a bug) — the container decides its width", async () => {
    const { resolveClipLayoutsWithDiagnostics } = await import("@nodetool-ai/timeline/scene");
    const observation = JSON.parse(
      await chatSession(catalog).executeAction({
        code: `
import { video } from "@nodetool-ai/sandbox-timeline";
const v = video({ width: 1920, height: 1080, fps: 30 });
let narrowId, wideId;
const scene = v.scene("s", 1, (s) => {
  const narrow = s.text("A short line", { name: "narrow", anchor: "left", mw: 0.05 });
  const wide = s.text("A short line", { name: "wide", anchor: "left" });
  narrowId = narrow.id;
  wideId = wide.id;
  s.stack([narrow], { at: { x: 0, y: -50 }, anchor: "left" });
  s.stack([wide], { at: { x: 0, y: 50 }, anchor: "left" });
});
v.series([scene]);
return { document: v._document, narrowId, wideId };
`
      })
    );
    expect(observation.ok).toBe(true);
    const canvas = { width: 1920, height: 1080 };
    const { sizes } = resolveClipLayoutsWithDiagnostics(observation.result.document.clips, canvas);
    // Same text, same font, one authored a tiny mw and one none — inside a
    // flex tree both measure at the text's own natural (unconstrained) width,
    // because mw is ignored there. If mw still applied, narrow's box would be
    // a small fraction of wide's.
    const narrowSize = sizes.get(observation.result.narrowId);
    const wideSize = sizes.get(observation.result.wideId);
    expect(narrowSize).toBeDefined();
    expect(wideSize).toBeDefined();
    expect(narrowSize!.width).toBeCloseTo(wideSize!.width, 0);
  });
});
