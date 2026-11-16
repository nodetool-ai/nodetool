import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  folderPathOf,
  resolveSaveFolder,
  resolveSaveTarget,
  saveFilename,
  uniqueFilePath,
  writeSavedFile
} from "../src/save-target.js";
import {
  WorkspaceReservedPathError,
  createLocalWorkspace,
  setProjectFolderResolver,
  type RunFileAssetContext
} from "@nodetool-ai/runtime";

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

describe("saveFilename", () => {
  it("uses the fallback when the name is blank", () => {
    expect(
      saveFilename({ filename: "  ", fallback: "image_2026.png" })
    ).toBe("image_2026.png");
  });

  it("appends the extension when the name carries none", () => {
    expect(
      saveFilename({ filename: "render", fallback: "x.png", extension: ".png" })
    ).toBe("render.png");
  });

  it("leaves a name that already has an extension alone", () => {
    expect(
      saveFilename({ filename: "render.jpg", fallback: "x.png", extension: ".png" })
    ).toBe("render.jpg");
    expect(
      saveFilename({ filename: "shot.", fallback: "x.png", extension: ".png" })
    ).toBe("shot..png");
    expect(
      saveFilename({ filename: ".hidden", fallback: "x.png", extension: ".png" })
    ).toBe(".hidden.png");
  });
});

describe("an empty filename", () => {
  it("is refused rather than resolved to the destination folder", async () => {
    // `path.resolve(folder, "")` is the folder itself: the file used to land
    // beside the workspace, named after it.
    await expect(
      resolveSaveTarget({
        folder: "",
        filename: "",
        saveToWorkspace: true,
        workspaceDir: path.join(dir, "ws")
      })
    ).rejects.toThrow(/empty filename/);
  });
});

describe("writeSavedFile with the run's context", () => {
  afterEach(() => {
    setProjectFolderResolver(null);
  });

  it("claims a numbered name exclusively and saves the asset at it", async () => {
    const workspace = createLocalWorkspace(dir);
    setProjectFolderResolver(async () => ({ ok: true, projectId: "p1", workspace }));
    // Another writer already holds the first name.
    await workspace.write("renders/still.png", new Uint8Array([9]));
    const claims: string[] = [];
    const writeNew = workspace.writeNew.bind(workspace);
    workspace.writeNew = async (target, data, contentType) => {
      const created = await writeNew(target, data, contentType);
      claims.push(`${target}:${created}`);
      return created;
    };
    const created: Array<{ path?: string | null; name: string }> = [];
    const context: RunFileAssetContext = {
      userId: "u1",
      projectId: "p1",
      workspace,
      hasModelInterface: () => true,
      createAsset: async (args) => {
        created.push({ path: args.path, name: args.name });
        await workspace.write(args.path ?? "", args.content);
        return { id: `asset-${created.length}` };
      }
    };

    const target = await writeSavedFile({
      folder: "",
      filename: "renders/still.png",
      saveToWorkspace: true,
      workspace,
      context,
      contentType: "image/png",
      bytes: new Uint8Array([1])
    });

    expect(target).toBe(path.join(dir, "renders/still_1.png"));
    expect(claims).toEqual(["renders/still.png:false", "renders/still_1.png:true"]);
    expect(created).toEqual([{ path: "renders/still_1.png", name: "still_1.png" }]);
    // The file that held the name first is untouched.
    expect(await workspace.read("renders/still.png")).toEqual(new Uint8Array([9]));
    expect(await workspace.read("renders/still_1.png")).toEqual(new Uint8Array([1]));
  });

  it("returns the real path for a local workspace", async () => {
    const workspace = createLocalWorkspace(dir);
    const target = await writeSavedFile({
      folder: "",
      filename: "note.txt",
      saveToWorkspace: true,
      workspace,
      bytes: "hello"
    });
    expect(target).toBe(path.join(dir, "note.txt"));
  });
});

describe("a save with Save to workspace off in a run with a workspace", () => {
  let outside: string;

  beforeEach(async () => {
    outside = await mkdtemp(path.join(tmpdir(), "nodetool-save-outside-"));
    await mkdir(path.join(dir, ".nodetool"));
    await writeFile(path.join(dir, ".nodetool", "project.json"), "manifest");
    await mkdir(path.join(dir, "projects", "abc", ".nodetool"), { recursive: true });
    await writeFile(path.join(dir, "projects", "abc", "fox.png"), "theirs");
  });

  afterEach(async () => {
    await rm(outside, { recursive: true, force: true });
  });

  const save = (folder: string, filename: string, overwrite = false) =>
    writeSavedFile({
      folder,
      filename,
      saveToWorkspace: false,
      workspace: createLocalWorkspace(dir),
      overwrite,
      bytes: "new"
    });

  it.each([
    ["another project's folder", path.join("projects", "abc"), "fox.png"],
    ["a new directory in it", path.join("projects", "abc", "deep"), "x.png"],
    ["the reserved directory", ".nodetool", "project.json"],
    ["a file name that reaches in", "", "projects/abc/fox.png"],
    ["a name that reaches the reserved directory", "", ".nodetool/project.json"],
    ["a name that climbs back in", "sub", "../projects/abc/new.png"]
  ])("refuses %s", async (_label, folder, filename) => {
    await expect(
      save(folder === "" ? "" : path.join(dir, folder), filename, true)
    ).rejects.toThrow(WorkspaceReservedPathError);
    expect(await readFile(path.join(dir, "projects/abc/fox.png"), "utf8")).toBe("theirs");
    expect(await readFile(path.join(dir, ".nodetool/project.json"), "utf8")).toBe("manifest");
    await expect(stat(path.join(dir, "projects/abc/deep"))).rejects.toThrow();
    await expect(stat(path.join(dir, "projects/abc/new.png"))).rejects.toThrow();
    await expect(stat(path.join(dir, "sub"))).rejects.toThrow();
  });

  it("still saves in the project's own folder and in a folder elsewhere", async () => {
    const own = await save(path.join(dir, "renders"), "a.png");
    expect(own).toBe(path.join(dir, "renders", "a.png"));
    const elsewhere = await save(outside, "b.png");
    expect(elsewhere).toBe(path.join(outside, "b.png"));
    expect(await readFile(elsewhere, "utf8")).toBe("new");
  });
});
