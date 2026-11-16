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
import { createLocalWorkspace, type Workspace } from "@nodetool-ai/runtime";
import { createDirectoryLink } from "./_helpers/filesystem-links.js";
import {
  MAX_DOWNLOAD_BYTES,
  buildYtDlpArgv,
  confineArgvToWorkspace,
  confineMediaPaths,
  confineOutputTemplate,
  hostMediaPath,
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

/** The directory a host binary runs in, with the workspace it belongs to. */
function hostRoot(): { cwd: string; workspace: Workspace } {
  return {
    cwd: workspace,
    // A game's workspace has no `.nodetool/`: the host names it.
    workspace: createLocalWorkspace(workspace, {
      nestedFolders: () => ["games/tetris"]
    })
  };
}

async function refusal(argv: string[]): Promise<string> {
  const result = await confineArgvToWorkspace(argv, hostRoot());
  return result?.error ?? "";
}

/** Give the workspace the folder of another project and a game's folder. */
async function makeOtherFolders(): Promise<void> {
  await mkdir(path.join(workspace, "projects/abc/.nodetool"), { recursive: true });
  await mkdir(path.join(workspace, "projects/abc/Generated"), { recursive: true });
  await writeFile(path.join(workspace, "projects/abc/Generated/fox.mp4"), "fox");
  await mkdir(path.join(workspace, "games/tetris"), { recursive: true });
  await writeFile(path.join(workspace, "games/tetris/clip.mp4"), "clip");
  await writeFile(path.join(workspace, "projects/own.mp4"), "own");
}

describe("confineArgvToWorkspace", () => {
  it.each([
    ["projects/abc/Generated/%(title)s.%(ext)s"],
    ["-i", "games/tetris/clip.mp4"],
    ["-vf", "subtitles=projects/abc/Generated/fox.mp4"],
    ["-o", "games/tetris/%(title)s.%(ext)s"]
  ])("refuses argv that reaches the folder of another project or of a game: %j", async (...argv) => {
    await makeOtherFolders();
    expect(await refusal(argv)).toMatch(/folder of another project/);
  });

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

describe("confineOutputTemplate", () => {
  const refusal = async (template: string): Promise<string> =>
    (await confineOutputTemplate(template, hostRoot()))?.error ?? "";

  it.each([
    "projects/%(id).0sgame1/x.%(ext)s",
    "games/%(id).0stetris/%(title)s.%(ext)s",
    "%(uploader)s/%(title)s.%(ext)s",
    "downloads\\%(id)s\\clip.%(ext)s"
  ])("refuses %s, whose directory a field would choose", async (template) => {
    await makeOtherFolders();
    expect(await refusal(template)).toMatch(/directory.*cannot contain a field/);
  });

  it("passes a literal directory and refuses one in another folder", async () => {
    await makeOtherFolders();
    expect(await refusal("downloads/%(title)s [%(id)s].%(ext)s")).toBe("");
    expect(await refusal("%(title)s.%(ext)s")).toBe("");
    expect(await refusal("games/tetris/%(title)s.%(ext)s")).toMatch(
      /folder of another project/
    );
    expect(await refusal("../outside/%(title)s.%(ext)s")).toMatch(
      /outside the workspace/
    );
  });
});

describe("confineMediaPaths", () => {
  const refusal = async (paths: string[]): Promise<string> =>
    (await confineMediaPaths(paths, hostRoot(), "Name a workspace file."))?.error ?? "";

  it.each([
    "projects/abc/Generated/fox.mp4",
    "projects/abc/Generated/new.mp4",
    "projects/abc",
    "projects/../projects/abc/Generated/fox.mp4",
    "games/tetris/clip.mp4",
    "games/tetris/new/clip.mp4",
    "games/tetris"
  ])("refuses %s, a path in the folder of another project or of a game", async (file) => {
    await makeOtherFolders();
    expect(await refusal([file])).toMatch(/folder of another project/);
    expect(await refusal([path.join(workspace, file)])).toMatch(
      /folder of another project|outside the workspace/
    );
  });

  // The media readers open `hostMediaPath`, which reads a path the way the
  // workspace does. Every spelling of one file is judged as that file.
  it.each([
    "workspace/projects/abc/Generated/fox.mp4",
    "workspace/games/tetris/clip.mp4",
    "projects\\abc\\Generated\\fox.mp4",
    "games\\tetris\\clip.mp4",
    "workspace\\games\\tetris\\new.mp4",
    "C:/projects/abc/Generated/fox.mp4",
    "c:\\games\\tetris\\clip.mp4",
    "workspace/projects/abc",
    "projects/./abc/../abc/Generated/fox.mp4"
  ])("refuses the spelling %s of a path in another folder", async (file) => {
    await makeOtherFolders();
    const result = await refusal([file]);
    expect(result).toMatch(/folder of another project|outside the workspace/);
    // The path that would be opened is in the other folder, whatever is said.
    const opened = hostMediaPath(hostRoot(), file);
    expect(
      path.relative(workspace, opened).split(path.sep).slice(0, 2).join("/")
    ).toMatch(/^(projects\/abc|games\/tetris)$/);
  });

  it("opens the path it judged, for every spelling of a file of the run", async () => {
    await makeOtherFolders();
    for (const file of [
      "projects/own.mp4",
      "workspace/projects/own.mp4",
      "projects\\own.mp4",
      "C:/projects/own.mp4"
    ]) {
      expect(hostMediaPath(hostRoot(), file)).toBe(
        path.join(workspace, "projects", "own.mp4")
      );
    }
    expect(await refusal(["workspace/projects/own.mp4", "projects\\own.mp4"])).toBe("");
  });

  it("refuses a link in the folder that points at a folder the host names", async () => {
    await makeOtherFolders();
    await createDirectoryLink(
      path.join(workspace, "games/tetris"),
      path.join(workspace, "shortcut")
    );
    expect(await refusal(["shortcut/clip.mp4"])).toMatch(/folder of another project/);
    expect(await refusal(["shortcut/new/clip.mp4"])).toMatch(/folder of another project/);
  });

  it("still passes a file beside the folder of another project", async () => {
    await makeOtherFolders();
    expect(await refusal(["projects/own.mp4", "projects/new.mp4", "games"])).toBe("");
  });

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
