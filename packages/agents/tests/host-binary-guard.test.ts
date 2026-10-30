/**
 * The path boundary around yt-dlp's argv and the in-process media readers.
 *
 * Each case is an escape a model can write today: an absolute path, a `..`
 * chain, a path hidden inside a filter token, a symlink planted in the
 * workspace, and a URL input — which libav really does open, so in the cloud
 * an unguarded one reaches the instance metadata service.
 */
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDirectoryLink } from "./_helpers/filesystem-links.js";
import {
  MAX_DOWNLOAD_BYTES,
  buildYtDlpArgv,
  confineArgvToWorkspace,
  confineMediaPaths,
  refuseFlagLikeValue
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

  it.each([
    // ffmpeg resolves the path inside the token against its own cwd, so the
    // whole token resolving inside the workspace is the wrong question:
    // `<ws>/subtitles=../../etc/passwd` normalizes to `<ws>/etc/passwd`, while
    // ffmpeg opens `../../etc/passwd`.
    "subtitles=../../etc/passwd",
    "subtitles=../outside/secret.txt",
    "drawtext=fontfile=/etc/passwd"
  ])("refuses the path buried in %s", async (token) => {
    expect(await refusal(["-vf", token])).toContain(
      "resolves outside the workspace"
    );
  });

  it("passes a filter value that names no path", async () => {
    expect(await refusal(["-vf", "scale=1280:-2,fps=30"])).toBe("");
  });

  it("allows an output whose directories do not exist yet", async () => {
    // yt-dlp's default template is two levels deep and creates as it goes.
    expect(await refusal(["downloads/yt-dlp/%(id)s.%(ext)s"])).toBe("");
  });

  it("refuses an in-workspace symlink that points out", async () => {
    await createDirectoryLink(outside, path.join(workspace, "outside"));
    expect(await refusal(["-i", "outside/secret.txt"])).toContain(
      "resolves outside the workspace"
    );
  });

  it("refuses writing through a symlinked directory", async () => {
    await createDirectoryLink(outside, path.join(workspace, "out"));
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

describe("confineMediaPaths", () => {
  const refusal = async (paths: string[]): Promise<string> =>
    (await confineMediaPaths(paths, workspace, "Name a workspace file."))?.error ?? "";

  it("refuses a path that leaves the workspace, a flag-shaped one included", async () => {
    expect(await refusal(["../outside/secret.txt"])).toMatch(/outside the workspace/);
    expect(await refusal([path.join(outside, "secret.txt")])).toMatch(/outside the workspace/);
    // argv confinement skips flags; a media path has none, so this is a path.
    expect(await refusal(["-x/../../outside/secret.txt"])).toMatch(/outside the workspace/);
  });

  it("refuses an opener other than a file", async () => {
    expect(await refusal(["http://169.254.169.254/latest/meta-data/"])).toMatch(/":\/\/" is not allowed/);
    expect(await refusal(["concat:a.mp4|b.mp4"])).toMatch(/not allowed/);
    expect(await refusal(["/dev/stdin"])).toMatch(/not allowed/);
  });

  it("refuses a symlink out of the workspace", async () => {
    await createDirectoryLink(outside, path.join(workspace, "link"));
    expect(await refusal(["link/secret.txt"])).toMatch(/outside the workspace/);
  });

  it("allows workspace files, existing or not", async () => {
    await mkdir(path.join(workspace, "clips"));
    expect(await refusal(["clips/in.mp4", "clips/out.mp4"])).toBe("");
  });
});

describe("buildYtDlpArgv", () => {
  it("ignores config files, clears post-processing, and ends the options", () => {
    const argv = buildYtDlpArgv({
      url: "https://example.com/watch?v=1",
      outputFile: "downloads/%(id)s.%(ext)s"
    });
    expect(argv).toEqual([
      "--ignore-config",
      "--no-exec",
      "--no-playlist",
      "--no-warnings",
      "--max-filesize",
      String(MAX_DOWNLOAD_BYTES),
      "--print",
      "after_move:filepath",
      "-o",
      "downloads/%(id)s.%(ext)s",
      "--",
      "https://example.com/watch?v=1"
    ]);
  });

  it("passes a format selector before the end-of-options marker", () => {
    const argv = buildYtDlpArgv({
      url: "https://example.com/v",
      outputFile: "out.mp4",
      format: "bestaudio"
    });
    expect(argv.slice(-4)).toEqual([
      "-f",
      "bestaudio",
      "--",
      "https://example.com/v"
    ]);
  });
});

describe("refuseFlagLikeValue", () => {
  it("refuses a value that would be read as an option", () => {
    expect(refuseFlagLikeValue("--exec", "format")).toEqual({
      error: expect.stringContaining("format cannot start with")
    });
  });

  it("passes an ordinary value", () => {
    expect(refuseFlagLikeValue("bestvideo+bestaudio", "format")).toBeUndefined();
  });
});
