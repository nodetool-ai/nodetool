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
 * so we can assert argument construction (metadata probe args, -x audio args,
 * --sub-langs pass-through, …).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";

type SpawnResult = { stdout?: string; stderr?: string; code?: number };
type SpawnCall = { cmd: string; args: string[] };

const spawnCalls: SpawnCall[] = [];
let spawnResponder: (cmd: string, args: string[]) => SpawnResult;

/** A valid yt-dlp `--print-json` info line. */
const VALID_INFO = JSON.stringify({ id: "abc123", title: "Test", ext: "mp4" });

function defaultResponder(_cmd: string, args: string[]): SpawnResult {
  // The metadata probe carries --print-json; anything else is the download.
  if (args.includes("--print-json")) {
    return { stdout: `${VALID_INFO}\n`, stderr: "", code: 0 };
  }
  return { stdout: "", stderr: "", code: 0 };
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

/** The recorded args for the download call (no --print-json). */
function downloadArgs(): string[] {
  const call = spawnCalls.find((c) => !c.args.includes("--print-json"));
  return call?.args ?? [];
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
  it("adds -x --audio-format mp3 to the download args", async () => {
    const node = makeNode({ mode: "audio" });
    await node.process();

    const args = downloadArgs();
    expect(args).toContain("-x");
    expect(args).toContain("--audio-format");
    expect(args[args.indexOf("--audio-format") + 1]).toBe("mp3");
    expect(args).toContain("bestaudio/best");
  });

  it("leaves audio/video/thumbnail as typed empty refs when no file is produced", async () => {
    const node = makeNode({ mode: "audio" });
    const result = await node.process();

    // Download exits 0 but writes no file to the temp dir → empty ref stays.
    expect(result.audio).toEqual({
      type: "audio",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    });
    expect(result.video).toEqual({
      type: "video",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    });
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
