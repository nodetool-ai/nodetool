/**
 * A `file://` URI or an absolute path in a media ref is read from the host
 * with `node:fs`, past the workspace. When the run has a workspace, a path in
 * the reserved `.nodetool/` directory or in the folder of another project
 * inside it is refused, as the workspace refuses it.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { loadMediaRefBytes } from "../src/media-ref-bytes.js";
import { createLocalWorkspace } from "../src/storage-workspace.js";
import { WorkspaceReservedPathError } from "@nodetool-ai/runtime-core";

let dir: string;
let outside: string;
let context: Parameters<typeof loadMediaRefBytes>[1];

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "mediaref-ws-"));
  outside = await mkdtemp(join(tmpdir(), "mediaref-out-"));
  await mkdir(join(dir, ".nodetool"));
  await writeFile(join(dir, ".nodetool", "project.json"), "manifest");
  await mkdir(join(dir, "projects", "abc", ".nodetool"), { recursive: true });
  await writeFile(join(dir, "projects", "abc", "fox.png"), "theirs");
  await writeFile(join(dir, "own.png"), "mine");
  await writeFile(join(outside, "host.png"), "host");
  context = { workspace: createLocalWorkspace(dir), workspaceDir: dir } as never;
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  await rm(outside, { recursive: true, force: true });
});

const read = (uri: string, ctx = context) =>
  loadMediaRefBytes({ type: "image", uri }, ctx);
const text = (bytes: Uint8Array | null) =>
  bytes ? new TextDecoder().decode(bytes) : null;

describe("a local media path in a run with a workspace", () => {
  it.each([
    ["file:// URI", (p: string) => pathToFileURL(p).href],
    ["absolute path", (p: string) => p]
  ])("refuses another project's file as a %s", async (_name, spell) => {
    await expect(read(spell(join(dir, "projects", "abc", "fox.png")))).rejects.toThrow(
      WorkspaceReservedPathError
    );
  });

  it("refuses the reserved directory", async () => {
    await expect(
      read(pathToFileURL(join(dir, ".nodetool", "project.json")).href)
    ).rejects.toThrow(WorkspaceReservedPathError);
  });

  it("refuses a spelling with .. segments", async () => {
    await expect(
      read(join(dir, "x", "..", "projects", "abc", "fox.png"))
    ).rejects.toThrow(WorkspaceReservedPathError);
  });

  it("still reads the project's own file and a file elsewhere on the host", async () => {
    expect(text(await read(pathToFileURL(join(dir, "own.png")).href))).toBe("mine");
    expect(text(await read(join(outside, "host.png")))).toBe("host");
  });

  it("reads as before when the run has no workspace", async () => {
    expect(
      text(await read(join(dir, "projects", "abc", "fox.png"), {}))
    ).toBe("theirs");
  });
});
