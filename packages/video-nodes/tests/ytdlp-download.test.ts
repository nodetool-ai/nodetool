/**
 * YtDlpDownloadLibNode tests.
 *
 * The node shells out to `yt-dlp` via `spawn` (not execFile), reading stdout,
 * stderr, and the "close" exit code. We mock `node:child_process` with a fake
 * ChildProcess that emits scripted stdout/stderr then closes with a scripted
 * exit code, so no real yt-dlp binary is needed and every branch is exercised
 * on any platform.
 *
 * A single `spawnResponder` decides the response per invocation from (cmd,
 * args); each test overrides it. Every spawn call is recorded in `spawnCalls`
 * so we can assert argument construction (metadata probe args, one call per
 * format, --sub-langs pass-through, …).
 *
 * The default download response plays yt-dlp: it copies a real fixture into
 * the `-o` template's directory, video-only for a selector starting with `bv`
 * and audio-only for any other, and prints the path as
 * `--print after_move:filepath` does. The mux and mp3 encode then run for
 * real, in process.
 */
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest";
import { EventEmitter } from "node:events";
import { copyFileSync, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { streamCodecs } from "@nodetool-ai/runtime/media";
import { generateMedia } from "@nodetool-ai/runtime/media/testing";

type SpawnResult = { stdout?: string; stderr?: string; code?: number };
type SpawnCall = { cmd: string; args: string[] };

const spawnCalls: SpawnCall[] = [];
let spawnResponder: (cmd: string, args: string[]) => SpawnResult;

/** A valid yt-dlp `--print-json` info line. */
const VALID_INFO = JSON.stringify({ id: "abc123", title: "Test", ext: "mp4" });

let fixtureDir: string;
const fixtures = { video: "", audio: "" };

beforeAll(async () => {
  fixtureDir = await fs.mkdtemp(path.join(os.tmpdir(), "ytdlp-fixtures-"));
  fixtures.video = path.join(fixtureDir, "video.mp4");
  fixtures.audio = path.join(fixtureDir, "audio.m4a");
  await generateMedia({
    outPath: fixtures.video,
    video: { source: "testsrc2=size=64x48:rate=24:duration=1" }
  });
  await generateMedia({
    outPath: fixtures.audio,
    audio: { source: "sine=frequency=440:duration=1" }
  });
});

afterAll(async () => {
  await fs.rm(fixtureDir, { recursive: true, force: true });
});

/** Write the fixture a download of `-f` would produce; return its path. */
function fakeDownload(args: string[]): string {
  const template = args[args.indexOf("-o") + 1];
  const selector = args[args.indexOf("-f") + 1];
  const kind = selector.startsWith("bv") ? "video" : "audio";
  const ext = kind === "video" ? "mp4" : "m4a";
  const out = template
    .replace("%(id)s", "abc123")
    .replace("%(format_id)s", kind === "video" ? "137" : "140")
    .replace("%(ext)s", ext);
  copyFileSync(fixtures[kind], out);
  return out;
}

function defaultResponder(_cmd: string, args: string[]): SpawnResult {
  // The metadata probe carries --print-json; anything else is a download.
  if (args.includes("--print-json")) {
    return { stdout: `${VALID_INFO}\n`, stderr: "", code: 0 };
  }
  return { stdout: `${fakeDownload(args)}\n`, stderr: "", code: 0 };
}

class FakeChild extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  kill = vi.fn();
}

vi.mock("node:child_process", async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  const spawn = (cmd: string, args: string[]) => {
    spawnCalls.push({ cmd, args });
    const child = new FakeChild();
    const res = spawnResponder(cmd, args);
    // Emit on the next tick so runCommand can attach its listeners first.
    queueMicrotask(() => {
      if (res.stdout) child.stdout.emit("data", Buffer.from(res.stdout));
      if (res.stderr) child.stderr.emit("data", Buffer.from(res.stderr));
      child.emit("close", res.code ?? 0);
    });
    return child;
  };
  return { ...original, spawn };
});

const { YtDlpDownloadLibNode } = await import("@nodetool-ai/video-nodes");

function makeNode(props: Record<string, unknown>) {
  const node = new YtDlpDownloadLibNode();
  node.assign({ url: "https://example.com/watch?v=abc123", ...props });
  return node;
}

/** The recorded args for the metadata probe (first --print-json call). */
function metadataArgs(): string[] {
  const call = spawnCalls.find((c) => c.args.includes("--print-json"));
  return call?.args ?? [];
}

/** The recorded args for the first download call (no --print-json). */
function downloadArgs(): string[] {
  return downloadCalls()[0] ?? [];
}

/** The recorded args of every download call, in order. */
function downloadCalls(): string[][] {
  return spawnCalls.filter((c) => !c.args.includes("--print-json")).map((c) => c.args);
}

/** The -f value of every download call, in order. */
function downloadSelectors(): string[] {
  return downloadCalls().map((args) => args[args.indexOf("-f") + 1]);
}

/** Flags that make yt-dlp run ffmpeg to merge, remux or convert. */
const FFMPEG_FLAGS = [
  "--merge-output-format",
  "--remux-video",
  "--recode-video",
  "-x",
  "--extract-audio",
  "--audio-format",
  "--embed-subs",
  "--embed-thumbnail",
  "--embed-metadata",
  "--embed-chapters",
  "--convert-subs",
  "--convert-thumbnails",
  "--ffmpeg-location"
];

/** The bytes of a node output ref, written to a file to read its streams. */
async function refCodecs(ref: unknown): Promise<{ video: string | null; audio: string | null }> {
  const data = (ref as { data?: string }).data;
  if (!data) throw new Error("The output ref has no data");
  const file = path.join(fixtureDir, `out-${Date.now()}-${Math.random()}`);
  await fs.writeFile(file, Buffer.from(data, "base64"));
  return streamCodecs(file);
}

beforeEach(() => {
  spawnCalls.length = 0;
  spawnResponder = defaultResponder;
});

describe("YtDlpDownloadLibNode — metadata mode", () => {
  it("builds the metadata probe args and does not run a download", async () => {
    const node = makeNode({ mode: "metadata" });
    const result = await node.process();

    const args = metadataArgs();
    expect(args).toContain("--print-json");
    expect(args).toContain("--skip-download");
    expect(args).toContain("--no-playlist");
    expect(args[args.length - 1]).toBe("https://example.com/watch?v=abc123");

    // No second (download) invocation in metadata mode.
    expect(spawnCalls.filter((c) => !c.args.includes("--print-json"))).toEqual(
      []
    );
    expect((result.metadata as Record<string, unknown>).id).toBe("abc123");
  });

  it("emits typed empty refs for all media outputs", async () => {
    const node = makeNode({ mode: "metadata" });
    const result = await node.process();

    expect(result.video).toEqual({
      type: "video",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    });
    expect(result.audio).toEqual({
      type: "audio",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    });
    expect(result.thumbnail).toEqual({
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    });
    expect(result.subtitles).toBe("");
  });
});

describe("YtDlpDownloadLibNode — audio mode", () => {
  it("downloads bestaudio/best with no ffmpeg post-processor and encodes mp3 in process", async () => {
    const node = makeNode({ mode: "audio" });
    const result = await node.process();

    expect(downloadSelectors()).toEqual(["bestaudio/best"]);
    for (const flag of FFMPEG_FLAGS) expect(downloadArgs()).not.toContain(flag);
    expect(await refCodecs(result.audio)).toEqual({ video: null, audio: "mp3" });
    expect(spawnCalls.every((c) => c.cmd === "yt-dlp")).toBe(true);
  });

  it("throws when yt-dlp exits cleanly but names no file", async () => {
    spawnResponder = (_cmd, args) =>
      args.includes("--print-json")
        ? { stdout: `${VALID_INFO}\n`, code: 0 }
        : { stdout: "", code: 0 };
    const node = makeNode({ mode: "audio" });
    await expect(node.process()).rejects.toThrow(
      /yt-dlp wrote no file for format "bestaudio\/best"/
    );
  });
});

describe("YtDlpDownloadLibNode — video mode", () => {
  it("downloads each side of the default selector and muxes them in process", async () => {
    const node = makeNode({ mode: "video" });
    const result = await node.process();

    expect(downloadSelectors()).toEqual(["bv*", "ba/b"]);
    for (const args of downloadCalls()) {
      for (const flag of FFMPEG_FLAGS) expect(args).not.toContain(flag);
    }
    expect(await refCodecs(result.video)).toEqual({ video: "h264", audio: "aac" });
    expect(spawnCalls.every((c) => c.cmd === "yt-dlp")).toBe(true);
  });

  it("splits a user selector on its top-level + and keeps / fallbacks", async () => {
    const node = makeNode({
      mode: "video",
      format_selector: "bv[ext=mp4]/bv+ba[ext=m4a]/ba",
      container: "mkv"
    });
    const result = await node.process();

    expect(downloadSelectors()).toEqual(["bv[ext=mp4]/bv", "ba[ext=m4a]/ba"]);
    expect(await refCodecs(result.video)).toEqual({ video: "h264", audio: "aac" });
  });

  it("downloads a selector with no + as one file, unmuxed", async () => {
    const node = makeNode({ mode: "video", format_selector: "bv*[height<=720]" });
    const result = await node.process();

    expect(downloadSelectors()).toEqual(["bv*[height<=720]"]);
    const bytes = Buffer.from((result.video as { data: string }).data, "base64");
    expect(bytes.equals(await fs.readFile(fixtures.video))).toBe(true);
  });

  it("names both formats and the codecs when the container cannot hold them", async () => {
    const node = makeNode({ mode: "video", container: "webm" });
    await expect(node.process()).rejects.toThrow(
      /Format "bv\*" \(abc123\.f137\.mp4\) and format "ba\/b" \(abc123\.f140\.m4a\) could not be muxed: Cannot stream-copy h264 video with aac audio into webm/
    );
  });

  it("refuses a merge inside parentheses before running yt-dlp", async () => {
    const node = makeNode({ mode: "video", format_selector: "(bv+ba)/b" });
    await expect(node.process()).rejects.toThrow(/merges inside parentheses/);
    expect(spawnCalls).toEqual([]);
  });

  it("asks for subtitles and the thumbnail on the first download only", async () => {
    const node = makeNode({ mode: "video", subtitles: true, thumbnail: true });
    await node.process();

    const [first, second] = downloadCalls();
    expect(first).toContain("--write-subs");
    expect(first).toContain("--write-thumbnail");
    expect(second).not.toContain("--write-subs");
    expect(second).not.toContain("--write-thumbnail");
  });
});

describe("YtDlpDownloadLibNode — subtitle languages", () => {
  it("passes sub_langs through to --sub-langs", async () => {
    const node = makeNode({
      mode: "video",
      subtitles: true,
      sub_langs: "de,fr"
    });
    await node.process();

    const args = downloadArgs();
    expect(args).toContain("--sub-langs");
    expect(args[args.indexOf("--sub-langs") + 1]).toBe("de,fr");
  });

  it("falls back to the default when sub_langs is empty", async () => {
    const node = makeNode({
      mode: "video",
      subtitles: true,
      sub_langs: "   "
    });
    await node.process();

    const args = downloadArgs();
    expect(args[args.indexOf("--sub-langs") + 1]).toBe("en,en-US,en-GB");
  });

  it("does not add subtitle args when subtitles is disabled", async () => {
    const node = makeNode({ mode: "video", subtitles: false });
    await node.process();

    expect(downloadArgs()).not.toContain("--sub-langs");
  });
});

describe("YtDlpDownloadLibNode — URL validation", () => {
  it("rejects an empty URL", async () => {
    const node = makeNode({ url: "" });
    await expect(node.process()).rejects.toThrow(/URL cannot be empty/);
  });

  it("rejects a non-http(s) URL", async () => {
    const node = makeNode({ url: "ftp://example.com/file" });
    await expect(node.process()).rejects.toThrow(/Invalid URL format/);
  });

  it("rejects a malformed URL string", async () => {
    const node = makeNode({ url: "not a url" });
    await expect(node.process()).rejects.toThrow(/Invalid URL format/);
  });

  it("accepts a well-formed https URL", async () => {
    const node = makeNode({ url: "https://example.com/x", mode: "metadata" });
    await expect(node.process()).resolves.toBeDefined();
  });
});

describe("YtDlpDownloadLibNode — process failures", () => {
  it("throws with stderr when the metadata probe exits non-zero", async () => {
    spawnResponder = () => ({
      stdout: "",
      stderr: "ERROR: video unavailable",
      code: 1
    });
    const node = makeNode({ mode: "metadata" });
    await expect(node.process()).rejects.toThrow(/video unavailable/);
  });

  it("throws a clear error when metadata JSON is malformed", async () => {
    spawnResponder = (_cmd, args) => {
      if (args.includes("--print-json")) {
        return { stdout: "{ this is not valid json\n", stderr: "", code: 0 };
      }
      return { stdout: "", stderr: "", code: 0 };
    };
    const node = makeNode({ mode: "metadata" });
    await expect(node.process()).rejects.toThrow(/malformed/i);
  });

  it("throws a clear error when yt-dlp emits no JSON info line", async () => {
    spawnResponder = () => ({ stdout: "no json here\n", stderr: "", code: 0 });
    const node = makeNode({ mode: "metadata" });
    await expect(node.process()).rejects.toThrow(
      /malformed.*no JSON info line/i
    );
  });

  it("throws with stderr when the download exits non-zero", async () => {
    spawnResponder = (_cmd, args) => {
      if (args.includes("--print-json")) {
        return { stdout: `${VALID_INFO}\n`, stderr: "", code: 0 };
      }
      return { stdout: "", stderr: "ERROR: download blocked", code: 1 };
    };
    const node = makeNode({ mode: "video" });
    await expect(node.process()).rejects.toThrow(/download blocked/);
  });
});
