import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ScriptedProvider,
  createFakeContext,
  type FakeContextHandle,
  type Message
} from "@nodetool-ai/runtime";
import { missingRuntimePackageOf } from "@nodetool-ai/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  GenerateSceneNode,
  InspectSceneNode,
  MANIMGX_NODES,
  RenderSceneNode,
  extractSceneCode,
  resetManimgxBinaryCache
} from "../src/index.js";

const FAKE = path.join(path.dirname(fileURLToPath(import.meta.url)), "helpers", "fake-manimgx.mjs");

function scene(mode: string): string {
  return `import manimgx as m\n# fake:${mode}\nclass Fake(m.Scene):\n    def construct(self):\n        self.wait(1)\n`;
}

/** Every key a node returns must be a declared output slot. */
function expectDeclared(node: { constructor: unknown }, result: Record<string, unknown>): void {
  const declared = Object.keys((node.constructor as { metadataOutputTypes: Record<string, string> }).metadataOutputTypes);
  expect(Object.keys(result).sort()).toEqual(declared.sort());
}

describe("ManimGX nodes against a fake manimgx", () => {
  let handle: FakeContextHandle;
  const savedPath = process.env["MANIMGX_PATH"];

  beforeEach(() => {
    process.env["MANIMGX_PATH"] = FAKE;
    resetManimgxBinaryCache();
    handle = createFakeContext();
  });

  afterEach(() => {
    handle.cleanup();
    if (savedPath === undefined) delete process.env["MANIMGX_PATH"];
    else process.env["MANIMGX_PATH"] = savedPath;
    resetManimgxBinaryCache();
  });

  it("exports the three node types under nodetool.manimgx", () => {
    expect(MANIMGX_NODES.map((node) => node.nodeType)).toEqual([
      "nodetool.manimgx.RenderScene",
      "nodetool.manimgx.InspectScene",
      "nodetool.manimgx.GenerateScene"
    ]);
  });

  it("declares manimgx as a required runtime on every node", () => {
    for (const node of MANIMGX_NODES) {
      expect(node.requiredRuntimes).toEqual(["manimgx"]);
    }
  });

  it("keeps a missing manimgx findable through the node's error", async () => {
    process.env["MANIMGX_PATH"] = path.join(path.dirname(FAKE), "missing-manimgx");
    const saved = { path: process.env["PATH"], home: process.env["HOME"] };
    process.env["PATH"] = "";
    process.env["HOME"] = path.dirname(FAKE);
    try {
      const node = new RenderSceneNode();
      node.assign({ code: scene("ok") });
      const error = await node.process(handle.context).catch((err: unknown) => err);
      expect(String(error)).toMatch(/nodetool\.manimgx\.RenderScene: manimgx was not found/);
      expect(missingRuntimePackageOf(error)).toBe("manimgx");
    } finally {
      process.env["PATH"] = saved.path;
      process.env["HOME"] = saved.home;
    }
  });

  it("RenderScene fills every declared output", async () => {
    const node = new RenderSceneNode();
    node.assign({ code: scene("ok"), width: 640, height: 360, fps: 30 });
    const result = await node.process(handle.context);
    expectDeclared(node, result);
    expect(result.video).toMatchObject({ type: "video", content_type: "video/mp4" });
    expect(Buffer.from(result.video.data, "base64").subarray(4, 8).toString()).toBe("ftyp");
    expect(result.storyboard).toHaveLength(2);
    expect(result.storyboard[0]).toMatchObject({ type: "image", content_type: "image/png" });
    expect(result.duration).toBe(2);
  });

  it("RenderScene passes its settings to manimgx", async () => {
    const node = new RenderSceneNode();
    node.assign({ code: scene("argv"), scene_name: "Fake", width: 1280, height: 720, fps: 24, preset: "fast", crf: 18 });
    const result = await node.process(handle.context);
    expect(JSON.parse(/argv: (.*)/.exec(result.report)?.[1] ?? "[]")).toEqual([
      "render", "scene.py", "Fake", "-r", "1280x720", "--fps", "24", "--preset", "fast", "--crf", "18", "-o", "scene.mp4"
    ]);
  });

  it("RenderScene hands dynamic inputs to the scene", async () => {
    const node = new RenderSceneNode();
    node.assign({ code: scene("inputs") });
    node.setDynamic("title", "Pythagoras");
    const result = await node.process(handle.context);
    expect(result.report).toContain(`"title":"Pythagoras"`);
  });

  it("RenderScene throws a failing scene's traceback with the node name", async () => {
    const node = new RenderSceneNode();
    node.assign({ code: scene("error") });
    await expect(node.process(handle.context)).rejects.toThrow(
      /nodetool\.manimgx\.RenderScene: the scene failed:[\s\S]*did you mean Circle/
    );
  });

  it("InspectScene reports a failing scene as ok: false", async () => {
    const node = new InspectSceneNode();
    node.assign({ code: scene("error") });
    const result = await node.process(handle.context);
    expectDeclared(node, result);
    expect(result).toMatchObject({ ok: false, problems: false, storyboard: [] });
    expect(result.report).toContain("AttributeError");
  });

  it("InspectScene reports layout problems with the storyboard", async () => {
    const node = new InspectSceneNode();
    node.assign({ code: scene("problems"), times: "1,end" });
    const result = await node.process(handle.context);
    expect(result).toMatchObject({ ok: true, problems: true });
    expect(result.storyboard).toHaveLength(1);
  });

  it("GenerateScene fixes the scene from the report, then renders", async () => {
    const replies = [scene("error"), scene("problems"), scene("ok")];
    const provider = new ScriptedProvider(
      replies.map((code) => () => [{ type: "chunk" as const, content: `Here:\n\`\`\`python\n${code}\`\`\`\n`, done: true }])
    );
    handle.cleanup();
    handle = createFakeContext({ providers: { scripted: provider } });
    const node = new GenerateSceneNode();
    node.assign({
      prompt: "Animate a circle",
      model: { type: "language_model", provider: "scripted", id: "m", name: "m" },
      max_attempts: 3
    });
    const result = await node.process(handle.context);
    expectDeclared(node, result);
    expect(result.attempts).toBe(3);
    expect(result.code).toContain("# fake:ok");
    expect(result.video).toMatchObject({ type: "video" });

    const feedback = provider.callLog.map((call) => call.messages.at(-1) as Message);
    expect(String(feedback[1].content)).toContain("did you mean Circle");
    const withImages = feedback[2].content as Array<{ type: string }>;
    expect(withImages.map((part) => part.type)).toEqual(["text", "image_url"]);
  });

  it("GenerateScene throws the last traceback when the scene never runs", async () => {
    const provider = new ScriptedProvider([
      () => [{ type: "chunk" as const, content: `\`\`\`python\n${scene("error")}\`\`\``, done: true }]
    ]);
    handle.cleanup();
    handle = createFakeContext({ providers: { scripted: provider } });
    const node = new GenerateSceneNode();
    node.assign({
      prompt: "x",
      model: { type: "language_model", provider: "scripted", id: "m", name: "m" },
      max_attempts: 1
    });
    await expect(node.process(handle.context)).rejects.toThrow(/still fails after 1 attempts[\s\S]*Circcle/);
  });

  it("GenerateScene needs a model", async () => {
    const node = new GenerateSceneNode();
    node.assign({ prompt: "x" });
    await expect(node.process(handle.context)).rejects.toThrow(/pick a model/);
  });
});

describe("extractSceneCode", () => {
  it("takes the longest fenced block", () => {
    expect(extractSceneCode("a\n```python\nshort\n```\n```py\nimport manimgx as m\nlonger\n```")).toBe(
      "import manimgx as m\nlonger"
    );
  });

  it("reads a long run of fences in linear time", () => {
    const hostile = "```" + "```py".repeat(50000);
    const started = Date.now();
    extractSceneCode(hostile);
    expect(Date.now() - started).toBeLessThan(500);
  });

  it("accepts bare code and rejects prose", () => {
    expect(extractSceneCode("import manimgx as m\nclass A(m.Scene): ...")).toContain("class A");
    expect(extractSceneCode("I cannot do that.")).toBe("");
  });
});
