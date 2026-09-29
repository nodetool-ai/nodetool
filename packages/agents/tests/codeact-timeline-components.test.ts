import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  createSandboxModuleCatalog,
  discoverSandboxPack
} from "@nodetool-ai/node-sdk";
import type { SandboxModuleCatalog } from "@nodetool-ai/runtime";
import { createChatCodeActSession } from "../src/codeact/chat-codeact.js";

/**
 * Real-sandbox tests for `component()`/`s.use()`/`Comp.saveAsComposition()`
 * in the shipped `@nodetool-ai/sandbox-timeline` pack — the same discovery +
 * CodeAct session harness `codeact-timeline-package.test.ts` uses, so these
 * scripts run in the actual QuickJS sandbox against the real `index.js`, not
 * a Node-side reimplementation.
 */

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

function chatSession(sandboxModuleCatalog: SandboxModuleCatalog | null) {
  return createChatCodeActSession({
    tools: [],
    executeTool: async () => ({}),
    sandboxModuleCatalog
  });
}

describe("timeline pack components", () => {
  it("fills prop defaults and folds the build's clips into one group", async () => {
    const observation = JSON.parse(
      await chatSession(catalog).executeAction({
        code: `
import { video, component } from "@nodetool-ai/sandbox-timeline";
const Badge = component("Badge", {
  props: {
    label: { type: "string", default: "Hi" },
    tone: { type: "color", default: "#112233" }
  },
  duration: 1
}, (s, p) => {
  s.text(p.label, { color: p.tone });
});
const v = video({ width: 1080, height: 1920, fps: 30 });
let groupId;
const scene = v.scene("s", 2, (s) => {
  groupId = s.use(Badge, { label: "Hello" }).id;
});
v.series([scene]);
const children = v._document.clips.filter((c) => c.parentId === groupId);
return {
  groupId,
  isGroup: v._document.clips.find((c) => c.id === groupId)?.mediaType,
  childCount: children.length,
  text: children[0].textStyle.text,
  color: children[0].textStyle.color
};
`
      })
    );
    expect(observation.ok).toBe(true);
    expect(observation.result).toMatchObject({
      isGroup: "group",
      childCount: 1,
      text: "Hello",
      color: "#112233"
    });
  });

  it("throws naming the prop when use() is given the wrong type", async () => {
    const observation = JSON.parse(
      await chatSession(catalog).executeAction({
        code: `
import { video, component } from "@nodetool-ai/sandbox-timeline";
const Badge = component("Badge", {
  props: { size: { type: "number", default: 40 } }
}, (s, p) => { s.text("x", { size: p.size }); });
const v = video({ width: 1080, height: 1920, fps: 30 });
v.scene("s", 1, (s) => { s.use(Badge, { size: "big" }); });
`
      })
    );
    expect(observation.ok).toBe(false);
    expect(observation.error).toContain("size");
    expect(observation.error).toContain("number");
  });

  it("throws naming the prop when component() declares a bad default", async () => {
    const observation = JSON.parse(
      await chatSession(catalog).executeAction({
        code: `
import { component } from "@nodetool-ai/sandbox-timeline";
component("Bad", { props: { tone: { type: "color", default: "not-a-color" } } }, () => {});
`
      })
    );
    expect(observation.ok).toBe(false);
    expect(observation.error).toContain("tone");
  });

  it("nests use() inside a seq() local clock at the right absolute time", async () => {
    const observation = JSON.parse(
      await chatSession(catalog).executeAction({
        code: `
import { video, component } from "@nodetool-ai/sandbox-timeline";
const Chip = component("Chip", { props: {}, duration: 1 }, (s) => { s.text("chip"); });
const v = video({ width: 1080, height: 1920, fps: 30 });
let groupId;
const scene = v.scene("s", 3, (s) => {
  s.seq(1, 1, (q) => { groupId = q.use(Chip).id; });
});
v.series([scene]);
const group = v._document.clips.find((c) => c.id === groupId);
return { startMs: group.startMs };
`
      })
    );
    expect(observation.ok).toBe(true);
    expect(observation.result.startMs).toBe(1000);
  });

  it("saves a component as a composition and the params round-trip through insert_composition", async () => {
    const calls: string[] = [];
    let insertedParams: unknown;
    const session = createChatCodeActSession({
      tools: [
        "create_timeline",
        "set_timeline_document",
        "validate_timeline",
        "save_composition",
        "insert_composition"
      ].map((name) => ({
        name,
        description: name,
        inputSchema: { type: "object", properties: {} }
      })),
      sandboxModuleCatalog: catalog,
      executeTool: async (call) => {
        calls.push(call.name);
        if (call.name === "create_timeline") return { timeline_id: "a".repeat(32) };
        if (call.name === "set_timeline_document") return { written: true };
        if (call.name === "validate_timeline") return { ok: true, errors: [], warnings: [] };
        if (call.name === "save_composition") {
          insertedParams = call.args.params;
          return { composition_id: "comp1" };
        }
        return { ok: true };
      }
    });
    const observation = JSON.parse(
      await session.executeAction({
        code: `
import { component } from "@nodetool-ai/sandbox-timeline";
const Badge = component("Badge", {
  props: {
    label: { type: "string", default: "Hi" },
    tone: { type: "color", default: "#112233" }
  },
  duration: 1
}, (s, p) => { s.text(p.label, { color: p.tone }); });
return await Badge.saveAsComposition(nodetool.timelines, { width: 1080, height: 1920, fps: 30, name: "Badge" });
`
      })
    );
    expect(observation.ok).toBe(true);
    expect(observation.result).toMatchObject({
      composition_id: "comp1",
      skippedParams: []
    });
    expect(calls).toContain("save_composition");
    expect(insertedParams).toMatchObject({
      label: { type: "string", default: "Hi", path: "/0/textStyle/text" },
      tone: { type: "color", default: "#112233", path: "/0/textStyle/color" }
    });
  });

  it("reports a prop that toggles a whole field as skipped rather than mapped wrong", async () => {
    let insertedParams: unknown;
    const session = createChatCodeActSession({
      tools: [
        "create_timeline",
        "set_timeline_document",
        "validate_timeline",
        "save_composition"
      ].map((name) => ({
        name,
        description: name,
        inputSchema: { type: "object", properties: {} }
      })),
      sandboxModuleCatalog: catalog,
      executeTool: async (call) => {
        if (call.name === "create_timeline") return { timeline_id: "b".repeat(32) };
        if (call.name === "set_timeline_document") return { written: true };
        if (call.name === "validate_timeline") return { ok: true, errors: [], warnings: [] };
        if (call.name === "save_composition") {
          insertedParams = call.args.params;
          return { composition_id: "comp2" };
        }
        return { ok: true };
      }
    });
    const observation = JSON.parse(
      await session.executeAction({
        code: `
import { component } from "@nodetool-ai/sandbox-timeline";
const Badge = component("Badge", {
  props: { emphasize: { type: "boolean", default: true } },
  duration: 1
}, (s, p) => {
  const t = s.text("Hi");
  if (p.emphasize) t.enter({ from: { opacity: 0 } });
});
return await Badge.saveAsComposition(nodetool.timelines, { width: 1080, height: 1920, fps: 30, name: "Badge" });
`
      })
    );
    expect(observation.ok).toBe(true);
    expect(observation.result.skippedParams).toEqual(["emphasize"]);
    expect(insertedParams).toEqual({});
  });

  it("captures a nested flex container's own children, and still maps a prop that reaches into it", async () => {
    let insertedGroupTarget: unknown;
    let insertedParams: unknown;
    const session = createChatCodeActSession({
      tools: [
        "create_timeline",
        "set_timeline_document",
        "validate_timeline",
        "save_composition"
      ].map((name) => ({
        name,
        description: name,
        inputSchema: { type: "object", properties: {} }
      })),
      sandboxModuleCatalog: catalog,
      executeTool: async (call) => {
        if (call.name === "create_timeline") return { timeline_id: "c".repeat(32) };
        if (call.name === "set_timeline_document") return { written: true };
        if (call.name === "validate_timeline") return { ok: true, errors: [], warnings: [] };
        if (call.name === "save_composition") {
          insertedGroupTarget = call.args.group_target;
          insertedParams = call.args.params;
          return { composition_id: "comp3" };
        }
        return { ok: true };
      }
    });
    const observation = JSON.parse(
      await session.executeAction({
        code: `
import { component } from "@nodetool-ai/sandbox-timeline";
const Card = component("Card", {
  props: { label: { type: "string", default: "One" } },
  duration: 1
}, (s, p) => {
  s.row([s.rect(20, 20, "#000000"), s.text(p.label)]);
});
return await Card.saveAsComposition(nodetool.timelines, { width: 1080, height: 1920, fps: 30, name: "Card" });
`
      })
    );
    expect(observation.ok).toBe(true);
    expect(observation.result).toMatchObject({ composition_id: "comp3", skippedParams: [] });
    expect(insertedParams).toMatchObject({
      label: { type: "string", default: "One", path: expect.stringContaining("textStyle/text") }
    });
    expect(insertedGroupTarget).toBeTruthy();
  });
});
