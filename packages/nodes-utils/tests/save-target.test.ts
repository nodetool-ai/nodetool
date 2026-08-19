import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  folderPathOf,
  resolveSaveFolder,
  resolveSaveTarget,
  uniqueFilePath
} from "../src/save-target.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "nodetool-save-target-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("folderPathOf", () => {
  it("reads a plain path, a file:// URI and a folder ref", () => {
    expect(folderPathOf("/tmp/out")).toBe("/tmp/out");
    expect(folderPathOf("file:///tmp/out")).toBe("/tmp/out");
    expect(folderPathOf({ uri: "file:///tmp/out" })).toBe("/tmp/out");
  });

  it("returns an empty string when nothing is set", () => {
    expect(folderPathOf("")).toBe("");
    expect(folderPathOf(null)).toBe("");
    expect(folderPathOf({ uri: "" })).toBe("");
  });
});

describe("resolveSaveFolder", () => {
  it("uses the workspace when the toggle is on", () => {
    expect(
      resolveSaveFolder({
        folder: "/somewhere/else",
        saveToWorkspace: true,
        workspaceDir: "/ws"
      })
    ).toBe("/ws");
  });

  it("uses the folder when the toggle is off", () => {
    expect(
      resolveSaveFolder({
        folder: "/somewhere/else",
        saveToWorkspace: false,
        workspaceDir: "/ws"
      })
    ).toBe("/somewhere/else");
  });

  it("falls back to the folder when the run has no workspace", () => {
    expect(
      resolveSaveFolder({
        folder: "/somewhere/else",
        saveToWorkspace: true,
        workspaceDir: null
      })
    ).toBe("/somewhere/else");
  });

  it("falls back to the working directory when nothing is set", () => {
    expect(
      resolveSaveFolder({ folder: "", saveToWorkspace: true, workspaceDir: null })
    ).toBe(".");
  });
});

describe("uniqueFilePath", () => {
  it("returns the target when nothing occupies it", async () => {
    const target = path.join(dir, "out.png");
    expect(await uniqueFilePath(target)).toBe(target);
  });

  it("numbers the name past every file already there", async () => {
    await writeFile(path.join(dir, "out.png"), "a");
    await writeFile(path.join(dir, "out_1.png"), "b");
    expect(await uniqueFilePath(path.join(dir, "out.png"))).toBe(
      path.join(dir, "out_2.png")
    );
  });
});

describe("resolveSaveTarget", () => {
  it("creates the destination folder and numbers a collision", async () => {
    const workspace = path.join(dir, "ws");
    const first = await resolveSaveTarget({
      folder: "",
      filename: "note.txt",
      saveToWorkspace: true,
      workspaceDir: workspace
    });
    expect(first).toBe(path.join(workspace, "note.txt"));
    await expect(stat(workspace)).resolves.toBeTruthy();

    await writeFile(first, "first");
    const second = await resolveSaveTarget({
      folder: "",
      filename: "note.txt",
      saveToWorkspace: true,
      workspaceDir: workspace
    });
    expect(second).toBe(path.join(workspace, "note_1.txt"));
  });

  it("writes over the existing file when overwrite is on", async () => {
    const target = path.join(dir, "note.txt");
    await writeFile(target, "first");
    expect(
      await resolveSaveTarget({
        folder: dir,
        filename: "note.txt",
        saveToWorkspace: false,
        overwrite: true
      })
    ).toBe(target);
  });
});
