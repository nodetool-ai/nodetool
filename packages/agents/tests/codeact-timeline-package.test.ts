import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  createSandboxModuleCatalog,
  discoverSandboxPack
} from "@nodetool-ai/node-sdk";
import type {
  BaseProvider,
  ProcessingContext,
  ProviderStreamItem,
  SandboxModuleCatalog
} from "@nodetool-ai/runtime";
import { initTestDb, TimelineSequence } from "@nodetool-ai/models";
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
import { createBuilder, cv, kfs, saveTimeline } from "@nodetool-ai/sandbox-timeline";
const b = createBuilder({ W: 1080, H: 1920, FPS: 30 });
b.scene("intro", 0, 59);
for (let i = 0; i < 3; i++) {
  const clip = b.text("Layer " + i, 64, 600, "#fff", { y: i * 80 });
  b.on(clip, 0, 20, [cv("opacity", 0, 1), kfs("y", [[0, 80], [1, 0, "easeOutExpo"]])]);
}
const layers = b.sceneTracks(1);
const result = { tracks: [{ id: "t_scenes", name: "Scenes", type: "video", index: 0, visible: true, locked: false }, ...layers.tracks], clips: [...b.scenes.map(s => s.group), ...layers.clips] };
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
        code: 'import { saveTimeline } from "@nodetool-ai/sandbox-timeline"; await saveTimeline({ name: "Invalid", document: { clips: [{ durationMs: -1 }], tracks: [] } }, { timelines: nodetool.timelines });'
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
const bundle = { name: "Intro", fps: 30, width: 1080, height: 1920, document: { ...result, markers: [] } };
return await saveTimeline(bundle, { timelines: nodetool.timelines });
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
      import { createBuilder, tf, saveTimeline } from "@nodetool-ai/sandbox-timeline";
      const b = createBuilder({ W: 1080, H: 1920, FPS: 30 });
      b.scene("depth", 0, 59);
      b.box(100, 100, "#fff", { transform: tf(0, 0, 1, { depthPx: -400 }), effects: [{ type: "grain", amount: 0.1 }] });
      const layers = b.sceneTracks(1);
      return await saveTimeline({ name: "Depth", fps: 30, width: 1080, height: 1920, document: {
        ...layers, clips: [...b.scenes.map(s => s.group), ...layers.clips],
        camera2d: { position: { x: 0, y: 0 }, depthPx: 0, focalLengthPx: 1000,
          keyframes: [{ timeMs: 0, position: { x: 0, y: 0 }, depthPx: 0 }, { timeMs: 1900, position: { x: 0, y: 0 }, depthPx: 200 }] }
      } }, { timelines: nodetool.timelines });
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
    expect(
      stored.clips.find((c) => c.mediaType === "shape")?.effects?.[0]
    ).toMatchObject({ id: "effect_1", enabled: true });
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
        code: 'import { saveTimeline } from "@nodetool-ai/sandbox-timeline"; await saveTimeline({ name: "Invalid", document: { tracks: [], clips: [{ id: "bad", durationMs: -1 }] } }, { timelines: nodetool.timelines });'
      })
    );
    expect(result.ok).toBe(false);
    expect(await run.invoke("list_timelines", {})).toEqual(before);
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
    const { createBuilder } = await import(packEntry);
    const b = createBuilder({ W: 1920, H: 1080, FPS: 30 });
    b.scene("s", 0, 29);
    const clip = b.text("MERIDIAN", 80, 700, "#fff", { tracking: -0.04 });
    expect(clip.textStyle.letterSpacingPx).toBeCloseTo(-3.2);
  });

  it("refuses a tracking value in pixels or percent", async () => {
    // A run passed `tracking: 10` and `-1`: 340px between 34px letters, and
    // an 84px word folded onto itself.
    const { createBuilder } = await import(packEntry);
    const b = createBuilder({ W: 1920, H: 1080, FPS: 30 });
    b.scene("s", 0, 29);
    expect(() => b.text("STUDIO", 34, 500, "#fff", { tracking: 10 })).toThrow(
      /tracking is in em/
    );
  });
});
