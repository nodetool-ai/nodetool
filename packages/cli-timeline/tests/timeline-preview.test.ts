import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadPreviewSource, previewMediaOf, type PreviewSource } from "../src/preview/source.js";
import { startPreviewServer, stripFrames, type PreviewRenderer, type StartedPreviewServer } from "../src/preview/server.js";
import { isLoopbackHost, previewToken, timelinePreviewRenderer } from "../src/commands/timeline-preview.js";
import type { runTimelineRender } from "../src/commands/timeline-render.js";

const ASSET = "0123456789abcdef0123456789abcdef";

const timelineFile = {
  name: "Intro",
  fps: 10,
  width: 320,
  height: 180,
  document: {
    tracks: [{ id: "v1", name: "Video", type: "video", index: 0, visible: true, locked: false }],
    clips: [
      { id: "a", name: "Title", trackId: "v1", mediaType: "text", startMs: 0, durationMs: 1000 },
      { id: "b", name: "Logo", trackId: "v1", mediaType: "shape", startMs: 1000, durationMs: 500 }
    ],
    markers: [{ id: "m", timeMs: 500, label: "beat" }]
  }
};

const storyboardFile = {
  name: "Lighthouse",
  timeline_id: "tl-1",
  document: {
    aspectRatio: "9:16",
    brief: "A keeper at dusk",
    style: "",
    shots: [
      { type: "shot", id: "s2", index: 1, action: "Wide", status: "draft", keyframe: { type: "image", uri: "https://cdn.example/x.png" } },
      { type: "shot", id: "s1", index: 0, slug: "Open", action: "Close up", status: "generated", duration_seconds: 4, keyframe: { type: "image", uri: `asset://${ASSET}` }, clip: { type: "video", asset_id: "fedcba9876543210fedcba9876543210" } }
    ]
  }
};

const noRows = { loadSequence: async () => null, loadStoryboard: async () => null };

let dir: string;
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "preview-test-")); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

async function write(name: string, value: unknown): Promise<string> {
  const file = join(dir, name);
  await writeFile(file, JSON.stringify(value));
  return file;
}

describe("preview source", () => {
  it("reads a timeline file with its frame count, tracks, clips and markers", async () => {
    const source = await loadPreviewSource(await write("t.json", timelineFile), noRows);
    expect(source).toMatchObject({
      kind: "timeline", name: "Intro", fps: 10, width: 320, height: 180, durationMs: 1500, totalFrames: 15,
      tracks: [{ id: "v1", clipCount: 2 }], markers: [{ timeMs: 500, label: "beat" }], validation: null
    });
    expect(source.kind === "timeline" && source.clips.map((clip) => clip.name)).toEqual(["Title", "Logo"]);
  });

  it("reads a file with shots as a storyboard, in shot order, with servable media", async () => {
    const source = await loadPreviewSource(await write("s.json", storyboardFile), noRows);
    if (source.kind !== "storyboard") throw new Error("expected a storyboard");
    expect(source).toMatchObject({ name: "Lighthouse", aspectRatio: "9:16", timelineId: "tl-1" });
    expect(source.shots.map((shot) => shot.id)).toEqual(["s1", "s2"]);
    expect(source.shots[0]).toMatchObject({
      durationSeconds: 4,
      keyframe: { src: `/asset/${ASSET}`, assetId: ASSET },
      clip: { src: "/asset/fedcba9876543210fedcba9876543210" }
    });
    expect(source.shots[1]?.keyframe).toEqual({ src: "https://cdn.example/x.png" });
  });

  it("looks an id up as a timeline sequence, then as a storyboard", async () => {
    const source = await loadPreviewSource("board-1", {
      loadSequence: async () => null,
      loadStoryboard: async (id) => ({ id, name: "Board", timeline_id: null, document: JSON.stringify(storyboardFile.document) })
    });
    expect(source).toMatchObject({ kind: "storyboard", name: "Board", timelineId: null });
    await expect(loadPreviewSource("missing", noRows)).rejects.toThrow(/No timeline file, timeline sequence or storyboard/);
  });

  it("changes version when the document changes", async () => {
    const file = await write("t.json", timelineFile);
    const before = await loadPreviewSource(file, noRows);
    await writeFile(file, JSON.stringify({ ...timelineFile, fps: 24 }));
    expect((await loadPreviewSource(file, noRows)).version).not.toBe(before.version);
  });

  it("serves only asset ids and http(s) URIs", () => {
    expect(previewMediaOf({ uri: "data:image/png;base64,AAAA" })).toBeNull();
    expect(previewMediaOf({ uri: "file:///etc/passwd" })).toBeNull();
    expect(previewMediaOf({ asset_id: "../secret" })).toBeNull();
    expect(previewMediaOf(null)).toBeNull();
  });
});

describe("strip frames", () => {
  it("spreads frames evenly with the first and the last", () => {
    expect(stripFrames(100, 5)).toEqual([0, 25, 50, 74, 99]);
    expect(stripFrames(3, 12)).toEqual([0, 1, 2]);
    expect(stripFrames(1, 12)).toEqual([0]);
    expect(stripFrames(0, 12)).toEqual([]);
  });
});

describe("preview server", () => {
  let server: StartedPreviewServer | undefined;
  afterEach(async () => { await server?.close(); server = undefined; });

  function fakeRenderer(calls: { frames: number[][]; videos: number }) : PreviewRenderer {
    return {
      async frames(frames) {
        calls.frames.push(frames);
        return new Map(frames.map((frame) => [frame, new Uint8Array([137, 80, 78, 71, frame])]));
      },
      async video() {
        calls.videos++;
        const file = join(dir, "video.mp4");
        await writeFile(file, Buffer.from("0123456789"));
        return file;
      }
    };
  }

  async function start(source: PreviewSource, options: { token?: string } = {}) {
    const calls = { frames: [] as number[][], videos: 0 };
    const assetFile = join(dir, "still.png");
    await writeFile(assetFile, Buffer.from("png"));
    server = await startPreviewServer({
      host: "127.0.0.1", port: 0, scale: 0.5, ...options,
      load: async () => source,
      render: fakeRenderer(calls),
      assetPath: async (id) => (id === ASSET ? assetFile : null)
    });
    const base = `http://127.0.0.1:${server.port}`;
    return { calls, base };
  }

  it("serves the page, the source, and frames rendered once per document version", async () => {
    const source = await loadPreviewSource(await write("t.json", timelineFile), noRows);
    const { calls, base } = await start(source);
    expect((await fetch(`${base}/`)).headers.get("content-type")).toMatch(/text\/html/);
    expect(await (await fetch(`${base}/api/source`)).json()).toMatchObject({ kind: "timeline", totalFrames: 15 });

    const frame = await fetch(`${base}/frame/3.png`);
    expect(frame.status).toBe(200);
    expect([...new Uint8Array(await frame.arrayBuffer())]).toEqual([137, 80, 78, 71, 3]);
    await fetch(`${base}/frame/3.png`);
    expect(calls.frames).toEqual([[3]]);

    const outside = await fetch(`${base}/frame/15.png`);
    expect(outside.status).toBe(404);
    expect((await outside.json()).error).toMatch(/frames 0-14/);
    expect((await fetch(`${base}/frame/1.png?scale=2`)).status).toBe(400);
  });

  it("renders a thumbnail strip in one compositor run", async () => {
    const source = await loadPreviewSource(await write("t.json", timelineFile), noRows);
    const { calls, base } = await start(source);
    const strip = await (await fetch(`${base}/api/strip?count=4`)).json();
    expect(strip).toMatchObject({ frames: [0, 5, 9, 14], scale: 0.25 });
    expect(calls.frames).toEqual([[0, 5, 9, 14]]);
    await fetch(`${base}/frame/9.png?scale=0.25`);
    expect(calls.frames).toHaveLength(1);
  });

  it("renders the video once and serves byte ranges", async () => {
    const source = await loadPreviewSource(await write("t.json", timelineFile), noRows);
    const { calls, base } = await start(source);
    const ranged = await fetch(`${base}/video.mp4`, { headers: { Range: "bytes=2-5" } });
    expect(ranged.status).toBe(206);
    expect(ranged.headers.get("content-range")).toBe("bytes 2-5/10");
    expect(await ranged.text()).toBe("2345");
    expect(await (await fetch(`${base}/video.mp4`)).text()).toBe("0123456789");
    expect(calls.videos).toBe(1);
  });

  it("serves only the assets the storyboard references, and no frames", async () => {
    const source = await loadPreviewSource(await write("s.json", storyboardFile), noRows);
    const { base } = await start(source);
    const still = await fetch(`${base}/asset/${ASSET}`);
    expect(still.status).toBe(200);
    expect(still.headers.get("content-type")).toBe("image/png");
    expect((await fetch(`${base}/asset/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`)).status).toBe(404);
    expect((await fetch(`${base}/frame/0.png`)).status).toBe(404);
  });

  it("requires the token, then accepts the cookie it sets", async () => {
    const source = await loadPreviewSource(await write("t.json", timelineFile), noRows);
    const { base } = await start(source, { token: "secret" });
    expect(server?.url).toBe(`http://127.0.0.1:${server?.port}/?token=secret`);
    expect((await fetch(`${base}/api/source`)).status).toBe(401);
    expect((await fetch(`${base}/api/source?token=wrong`)).status).toBe(401);
    const opened = await fetch(`${base}/?token=secret`);
    expect(opened.status).toBe(200);
    const cookie = opened.headers.get("set-cookie")?.split(";")[0] ?? "";
    expect(cookie).toBe("nodetool_preview=secret");
    expect((await fetch(`${base}/api/source`, { headers: { cookie } })).status).toBe(200);
  });
});

describe("preview command helpers", () => {
  it("generates a token only beyond loopback", () => {
    expect(isLoopbackHost("127.0.0.1")).toBe(true);
    expect(isLoopbackHost("0.0.0.0")).toBe(false);
    expect(previewToken("127.0.0.1", undefined)).toBeUndefined();
    expect(previewToken("0.0.0.0", undefined)).toMatch(/^[0-9a-f]{32}$/);
    expect(previewToken("127.0.0.1", "mine")).toBe("mine");
    expect(() => previewToken("0.0.0.0", " ")).toThrow(/--token/);
  });

  it("reads rendered stills back by frame index", async () => {
    const seen: unknown[] = [];
    const render = (async (_ref, opts) => {
      seen.push(opts);
      for (const frame of String(opts.frames).split(",")) {
        await writeFile(join(String(opts.out), `frame_${frame.padStart(6, "0")}.png`), Buffer.from(`png${frame}`));
      }
      return {} as Awaited<ReturnType<typeof runTimelineRender>>;
    }) as typeof runTimelineRender;
    const renderer = timelinePreviewRenderer("t.json", async () => null, dir, render);
    const frames = await renderer.frames([2, 7], 0.25);
    expect(Buffer.from(frames.get(7) ?? []).toString()).toBe("png7");
    expect(seen[0]).toMatchObject({ frames: "2,7", stills: true, scale: "0.25" });
    await expect(readFile(join(dir, "frames-"))).rejects.toThrow();
  });
});

describe("preview server errors", () => {
  it("keeps an unexpected error's message out of the response and logs it", async () => {
    const lines: string[] = [];
    const started = await startPreviewServer({
      host: "127.0.0.1", port: 0, scale: 0.5,
      load: async () => { throw new Error("/home/me/secret.json is not valid JSON"); },
      render: { frames: async () => new Map(), video: async () => "" },
      assetPath: async () => null,
      onLog: (line) => lines.push(line)
    });
    try {
      const response = await fetch(`http://127.0.0.1:${started.port}/api/source`);
      expect(response.status).toBe(500);
      expect((await response.json()).error).not.toContain("secret");
      expect(lines.join("\n")).toContain("/home/me/secret.json");
    } finally {
      await started.close();
    }
  });
});
