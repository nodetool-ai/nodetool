/**
 * The argv boundary around the host media binaries.
 *
 * Each case is an escape a model can write today: an absolute path, a `..`
 * chain, a path hidden inside a filter token, a symlink planted in the
 * workspace, and a URL input — which ffmpeg really does open (an unguarded
 * `-i http://…` reaches the socket, so in the cloud it reaches the instance
 * metadata service).
 */
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runHostBinary } from "../src/host-binaries.js";
import {
  FFMPEG_PROTOCOL_WHITELIST,
  confineArgvToWorkspace,
  hardenFfmpegArgv
} from "../src/host-binary-guard.js";

let workspace = "";
let outside = "";

beforeEach(async () => {
  const root = await mkdtemp(path.join(tmpdir(), "nt-guard-"));
  workspace = path.join(root, "ws");
  outside = path.join(root, "outside");
  await mkdir(workspace, { recursive: true });
  await mkdir(outside, { recursive: true });
  await writeFile(path.join(outside, "secret.txt"), "s3cret");
});

afterEach(async () => {
  await rm(path.dirname(workspace), { recursive: true, force: true });
});

async function refusal(argv: string[]): Promise<string> {
  const result = await confineArgvToWorkspace(argv, workspace);
  return result?.error ?? "";
}

describe("confineArgvToWorkspace", () => {
  it("passes argv that stays inside the workspace", async () => {
    await writeFile(path.join(workspace, "in.mp4"), "x");
    expect(
      await refusal(["-i", "in.mp4", "-vf", "scale=1280:-2", "out.mp4"])
    ).toBe("");
  });

  it("refuses an absolute path outside the workspace", async () => {
    expect(await refusal(["-i", "/etc/passwd"])).toContain(
      "resolves outside the workspace"
    );
  });

  it("refuses a `..` chain", async () => {
    expect(await refusal(["-i", "../outside/secret.txt"])).toContain(
      "resolves outside the workspace"
    );
  });

  it("refuses a path buried in a filter token", async () => {
    // The whole token resolves, so no filter-syntax parsing is needed.
    expect(await refusal(["-vf", "subtitles=../outside/secret.txt"])).toContain(
      "resolves outside the workspace"
    );
  });

  it("refuses an in-workspace symlink that points out", async () => {
    await symlink(path.join(outside, "secret.txt"), path.join(workspace, "link"));
    expect(await refusal(["-i", "link"])).toContain(
      "resolves outside the workspace"
    );
  });

  it("refuses writing through a symlinked directory", async () => {
    await symlink(outside, path.join(workspace, "out"));
    expect(await refusal(["out/new.mp4"])).toContain(
      "resolves outside the workspace"
    );
  });

  it.each([
    ["http://169.254.169.254/latest/meta-data/", "://"],
    ["rtmp://example.com/live", "://"],
    ["concat:a.ts|b.ts", "concat:"],
    ["pipe:0", "pipe:"],
    ["/dev/urandom", "/dev/"],
    ["movie=../outside/secret.txt", "movie="]
  ])("refuses %s as a non-file opener", async (arg, token) => {
    const message = await refusal(["-i", arg]);
    expect(message).toContain(token);
    expect(message).toContain("Only workspace files are readable");
  });

  it("allows a file that does not exist yet under a real directory", async () => {
    await mkdir(path.join(workspace, "clips"));
    expect(await refusal(["clips/out.mp4"])).toBe("");
  });
});

describe("hardenFfmpegArgv", () => {
  it("puts the protocol whitelist in front of every input", () => {
    const hardened = hardenFfmpegArgv(["-i", "a.mp4", "-i", "b.mp4", "out.mp4"]);
    expect(hardened).toEqual({
      argv: [
        "-nostdin",
        "-protocol_whitelist",
        FFMPEG_PROTOCOL_WHITELIST,
        "-i",
        "a.mp4",
        "-protocol_whitelist",
        FFMPEG_PROTOCOL_WHITELIST,
        "-i",
        "b.mp4",
        "out.mp4"
      ]
    });
  });

  it("refuses a caller who sets the whitelist itself", () => {
    const hardened = hardenFfmpegArgv([
      "-protocol_whitelist",
      "file,http",
      "-i",
      "a.mp4"
    ]);
    expect(hardened).toEqual({
      error: expect.stringContaining("-protocol_whitelist is set by NodeTool")
    });
  });
});

/** ffmpeg ships on the CI images and on most dev boxes; skip where it does not. */
const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;

describe.skipIf(!hasFfmpeg)("the hardened argv against real ffmpeg", () => {
  it("still transcodes a workspace file", async () => {
    const source = hardenFfmpegArgv([
      "-f",
      "lavfi",
      "-i",
      "testsrc=size=160x120:rate=5",
      "-t",
      "1",
      "-y",
      "out.mp4"
    ]);
    expect("argv" in source).toBe(true);
    if (!("argv" in source)) return;
    const result = await runHostBinary("ffmpeg", source.argv, {
      cwd: workspace,
      timeoutMs: 60_000
    });
    expect(result.exitCode).toBe(0);
    expect((await stat(path.join(workspace, "out.mp4"))).size).toBeGreaterThan(0);
  }, 90_000);

  it("refuses a URL input that got past the token scan", async () => {
    // Defense in depth: the scan above rejects `://` before ffmpeg sees it, so
    // this drives ffmpeg directly to show what the whitelist itself does — an
    // unwhitelisted run opens the socket instead (that is the SSRF this bounds).
    const hardened = hardenFfmpegArgv([
      "-i",
      "http://169.254.169.254/latest/meta-data/",
      "-y",
      "out.txt"
    ]);
    expect("argv" in hardened).toBe(true);
    if (!("argv" in hardened)) return;
    const result = await runHostBinary("ffmpeg", hardened.argv, {
      cwd: workspace,
      timeoutMs: 60_000
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("not on whitelist");
  }, 90_000);
});
