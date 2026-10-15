import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { missingRuntimePackageOf } from "@nodetool-ai/protocol";
import { createFakeContext, type FakeContextHandle } from "@nodetool-ai/runtime";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resetManimgxBinaryCache } from "../src/manimgx-binary.js";
import {
  MANIMGX_DISABLED_ERROR,
  childEnv,
  manimgxArgs,
  runManimgx,
  type ManimgxRenderSettings
} from "../src/run-manimgx.js";

const FAKE = path.join(path.dirname(fileURLToPath(import.meta.url)), "helpers", "fake-manimgx.mjs");

const SETTINGS: ManimgxRenderSettings = { width: 640, height: 360, fps: 30, preset: "veryfast", crf: 23 };
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];

function scene(mode: string): string {
  return `import manimgx as m\n# fake:${mode}\nclass Fake(m.Scene):\n    def construct(self):\n        self.wait(1)\n`;
}

describe("manimgxArgs", () => {
  it("builds a fixed render argv from validated values", () => {
    expect(manimgxArgs({ code: "x", sceneName: "Intro" }, { command: "render", settings: SETTINGS })).toEqual([
      "render", "scene.py", "Intro", "-r", "640x360", "--fps", "30", "--preset", "veryfast", "--crf", "23", "-o", "scene.mp4"
    ]);
  });

  it("rounds odd dimensions up to even and clamps the frame rate", () => {
    const args = manimgxArgs({ code: "x" }, { command: "render", settings: { ...SETTINGS, width: 641, height: 3, fps: 500 } });
    expect(args.slice(2, 6)).toEqual(["-r", "642x16", "--fps", "120"]);
  });

  it.each(["--output", "-o", "a b", "1Scene", "Scene;rm"])("refuses scene name %j", (name) => {
    expect(() => manimgxArgs({ code: "x", sceneName: name }, { command: "inspect" })).toThrow(/not a Python class name/);
  });

  it("passes inspection times and refuses anything else", () => {
    expect(manimgxArgs({ code: "x" }, { command: "inspect", times: "0.5, 2,end" })).toEqual([
      "inspect", "scene.py", "-o", "storyboard.png", "-t", "0.5,2,end"
    ]);
    expect(() => manimgxArgs({ code: "x" }, { command: "inspect", times: "1,--help" })).toThrow(/seconds or 'end'/);
  });

  it("refuses an unknown preset", () => {
    expect(() =>
      manimgxArgs({ code: "x" }, { command: "render", settings: { ...SETTINGS, preset: "--x" as never } })
    ).toThrow(/unknown x264 preset/);
  });
});

describe("childEnv", () => {
  it("keeps the allowlist and GPU prefixes, drops secrets", () => {
    const env = childEnv({ PATH: "/bin", OPENAI_API_KEY: "sk", VK_ICD_FILENAMES: "x", SECRETS_MASTER_KEY: "k" });
    expect(env).toEqual({ PATH: "/bin", VK_ICD_FILENAMES: "x", PYTHONDONTWRITEBYTECODE: "1", PYTHONIOENCODING: "utf-8" });
  });
});

describe("runManimgx against a fake manimgx", () => {
  let handle: FakeContextHandle;
  const saved = {
    path: process.env["MANIMGX_PATH"],
    profile: process.env["NODETOOL_NODE_PROFILE"],
    secret: process.env["OPENAI_API_KEY"]
  };

  beforeEach(() => {
    process.env["MANIMGX_PATH"] = FAKE;
    delete process.env["NODETOOL_NODE_PROFILE"];
    resetManimgxBinaryCache();
    handle = createFakeContext();
  });

  afterEach(() => {
    handle.cleanup();
    for (const [key, value] of [
      ["MANIMGX_PATH", saved.path],
      ["NODETOOL_NODE_PROFILE", saved.profile],
      ["OPENAI_API_KEY", saved.secret]
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    resetManimgxBinaryCache();
  });

  const run = (code: string, command: "render" | "inspect" = "render", inputs?: Record<string, unknown>) =>
    runManimgx(
      handle.context,
      { code, inputs },
      command === "render" ? { command, settings: SETTINGS } : { command },
      { timeoutMs: 20000 }
    );

  it("renders: video, storyboard pages in order, report, duration", async () => {
    const result = await run(scene("ok"));
    expect(result.ok).toBe(true);
    expect(Array.from(result.video?.slice(4, 8) ?? [])).toEqual([0x66, 0x74, 0x79, 0x70]);
    expect(result.storyboards).toHaveLength(2);
    expect(result.storyboards[1].length).toBe(2 * result.storyboards[0].length);
    expect(Array.from(result.storyboards[0].slice(0, 4))).toEqual(PNG_MAGIC);
    expect(result.report).toContain("layout: no problems");
    expect(result.report).not.toMatch(/^storyboard:/m);
    expect(result.duration).toBe(2);
  });

  it("deletes its scratch directory after the run", async () => {
    await run(scene("ok"));
    const scratch = await handle.context.workspace.scratchDir();
    expect((await readdir(scratch)).filter((name) => name.startsWith("manimgx-"))).toEqual([]);
  });

  it("returns a failing scene's traceback instead of throwing", async () => {
    const result = await run(scene("error"), "inspect");
    expect(result.ok).toBe(false);
    expect(result.report).toContain("did you mean Circle");
    expect(result.storyboards).toEqual([]);
  });

  it("reads layout problems as a result, not a failure", async () => {
    const result = await run(scene("problems"), "inspect");
    expect(result).toMatchObject({ ok: true, problems: true, duration: 3 });
    expect(result.report).toContain("texts overlap");
    expect(result.storyboards).toHaveLength(1);
  });

  it("keeps the server's secrets out of the scene's environment", async () => {
    process.env["OPENAI_API_KEY"] = "sk-test";
    const result = await run(scene("env"));
    const keys = /env: (.*)/.exec(result.report)?.[1]?.split(",") ?? [];
    expect(keys).toContain("PATH");
    expect(keys).not.toContain("OPENAI_API_KEY");
    expect(keys).not.toContain("MANIMGX_PATH");
  });

  it("stages media inputs as files and passes values as JSON", async () => {
    const png = Buffer.from(PNG_MAGIC.concat([9, 9, 9]));
    const result = await run(scene("inputs"), "inspect", {
      title: "Euler",
      count: 3,
      logo: { type: "image", uri: "", asset_id: null, data: png.toString("base64") }
    });
    const inputs = JSON.parse(/inputs: (.*)/.exec(result.report)?.[1] ?? "{}") as Record<string, unknown>;
    expect(inputs["title"]).toBe("Euler");
    expect(inputs["count"]).toBe(3);
    expect(String(inputs["logo"])).toMatch(/inputs[/\\]1_logo\.png$/);
    expect(result.report).toContain(`sizes: [${png.length}]`);
    expect(result.report).toContain("module: true");
  });

  it("never reads a video the scene left as a symlink", async () => {
    await expect(run(scene("symlink"))).rejects.toThrow(/wrote no video/);
  });

  it("throws when a clean exit wrote no video", async () => {
    await expect(run(scene("empty"))).rejects.toThrow(/wrote no video/);
  });

  it("kills a scene that runs past its timeout and says which knobs fix it", async () => {
    await expect(
      runManimgx(handle.context, { code: scene("hang") }, { command: "inspect" }, { timeoutMs: 500 })
    ).rejects.toThrow(/past its 1 s timeout/);
  }, 15000);

  it("refuses empty code", async () => {
    await expect(run("  \n")).rejects.toThrow(/empty/);
  });

  it("refuses to run under the cloud profile", async () => {
    process.env["NODETOOL_NODE_PROFILE"] = "cloud";
    await expect(run(scene("ok"))).rejects.toThrow(MANIMGX_DISABLED_ERROR);
  });

  it("asks for the manimgx runtime package when no manimgx is found", async () => {
    process.env["MANIMGX_PATH"] = path.join(path.dirname(FAKE), "missing-manimgx");
    const savedPath = process.env["PATH"];
    process.env["PATH"] = "";
    const savedHome = process.env["HOME"];
    process.env["HOME"] = path.dirname(FAKE);
    try {
      const error = await run(scene("ok")).catch((err: unknown) => err);
      expect(missingRuntimePackageOf(error)).toBe("manimgx");
      expect(String(error)).toContain("uv tool install manimgx");
      expect(String(error)).toContain("MANIMGX_PATH=");
    } finally {
      process.env["PATH"] = savedPath;
      process.env["HOME"] = savedHome;
    }
  });
});
