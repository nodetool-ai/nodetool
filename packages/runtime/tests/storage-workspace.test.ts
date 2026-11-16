/**
 * The workspace contract, run twice: once over a real directory and once over
 * an object store. Every assertion below holds for both, which is the whole
 * point of the abstraction — a node that passes locally behaves the same in
 * the cloud.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fsPromises, {
  mkdir,
  mkdtemp,
  rm,
  readFile,
  symlink,
  writeFile
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  FileStorageAdapter,
  InMemoryStorageAdapter
} from "@nodetool-ai/storage";
import { PrefixedStorageAdapter } from "../src/prefixed-storage-adapter.js";
import {
  StorageWorkspace,
  assertLocalPathIsOwn,
  createWorkspace
} from "../src/storage-workspace.js";
import {
  NestedFolders,
  WorkspaceFolderCheckError,
  WorkspacePathError,
  WorkspaceReservedPathError,
  observeWorkspace,
  type Workspace
} from "../src/workspace.js";
import { ProcessingContext } from "../src/context.js";

const backends = [
  {
    name: "local (FileStorageAdapter)",
    isLocal: true
  },
  {
    name: "virtual (object store)",
    isLocal: false
  }
] as const;

describe.each(backends)("Workspace over $name", ({ isLocal }) => {
  let dir: string;
  let workspace: Workspace;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ws-contract-"));
    workspace = isLocal
      ? new StorageWorkspace(new FileStorageAdapter(dir))
      : new StorageWorkspace(new InMemoryStorageAdapter());
  });

  afterEach(async () => {
    await workspace.cleanupScratch?.();
    await rm(dir, { recursive: true, force: true });
  });

  it("round-trips text", async () => {
    await workspace.write("notes.md", "hello");
    expect(await workspace.readText("notes.md")).toBe("hello");
  });

  it("writeNew creates a file and never replaces one", async () => {
    expect(await workspace.writeNew("Generated/fox.txt", "first")).toBe(true);
    expect(await workspace.writeNew("Generated/fox.txt", "second")).toBe(false);
    expect(await workspace.readText("Generated/fox.txt")).toBe("first");

    // A file `write` put there is not replaced either.
    await workspace.write("notes.md", "kept");
    expect(await workspace.writeNew("notes.md", "lost")).toBe(false);
    expect(await workspace.readText("notes.md")).toBe("kept");
  });

  it("writeNew gives one path to exactly one of many racing writers", async () => {
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        workspace.writeNew("race.txt", `writer ${i}`)
      )
    );

    const winners = results.flatMap((won, i) => (won ? [i] : []));
    expect(winners).toHaveLength(1);
    expect(await workspace.readText("race.txt")).toBe(`writer ${winners[0]}`);
  });

  it("writeNew with a staging name never replaces a file and leaves no staging file", async () => {
    const options = { stagingName: ".asset1.nodetool-move.tmp" };
    expect(
      await workspace.writeNew("Shots/fox.txt", "first", undefined, options)
    ).toBe(true);
    expect(
      await workspace.writeNew("Shots/fox.txt", "second", undefined, options)
    ).toBe(false);
    expect(await workspace.readText("Shots/fox.txt")).toBe("first");
    // An empty file is a file: it is never taken for a write to finish.
    await workspace.write("Shots/empty.txt", "");
    expect(
      await workspace.writeNew("Shots/empty.txt", "lost", undefined, options)
    ).toBe(false);
    expect(await workspace.readText("Shots/empty.txt")).toBe("");
    const names = (await workspace.list("Shots")).map((entry) => entry.name);
    expect(names.sort()).toEqual(["empty.txt", "fox.txt"]);
  });

  it("writeNew refuses a staging name outside the directory of the path", async () => {
    await expect(
      workspace.writeNew("fox.txt", "x", undefined, { stagingName: "../x.tmp" })
    ).rejects.toBeInstanceOf(WorkspacePathError);
    await expect(
      workspace.writeNew("fox.txt", "x", undefined, { stagingName: ".nodetool" })
    ).rejects.toBeInstanceOf(WorkspaceReservedPathError);
    expect(await workspace.exists("fox.txt")).toBe(false);
  });

  it("writeNew refuses the reserved directory and a path outside the root", async () => {
    await expect(
      workspace.writeNew(".nodetool/project.json", "{}")
    ).rejects.toBeInstanceOf(WorkspaceReservedPathError);
    await expect(workspace.writeNew("../escape.txt", "x")).rejects.toBeInstanceOf(
      WorkspacePathError
    );
  });

  it("an observed workspace reports writeNew only when it wrote", async () => {
    const changes: string[] = [];
    const observed = observeWorkspace(workspace, (change) =>
      changes.push(`${change.kind}:${change.path}`)
    );

    expect(await observed.writeNew("a.txt", "one")).toBe(true);
    expect(await observed.writeNew("a.txt", "two")).toBe(false);

    expect(changes).toEqual(["write:a.txt"]);
  });

  it("preserves and explicitly replaces a child execution workspace", async () => {
    const context = new ProcessingContext({ jobId: "parent", workspace });
    const child = context.copy({ jobId: "child" });
    expect(child.workspace).toBe(workspace);
    await child.workspace?.write("child.txt", "recorded run");
    expect(await workspace.read("child.txt")).toEqual(new TextEncoder().encode("recorded run"));
    const replacement = new StorageWorkspace(new InMemoryStorageAdapter());
    expect(context.copy({ workspace: replacement }).workspace).toBe(replacement);
    expect(context.copy({ workspace: null }).workspace).toBeNull();
  });

  it("round-trips bytes in a subdirectory", async () => {
    await workspace.write("out/data.bin", new Uint8Array([1, 2, 3]));
    expect(await workspace.read("out/data.bin")).toEqual(
      new Uint8Array([1, 2, 3])
    );
  });

  it("reads a missing file as null rather than throwing", async () => {
    expect(await workspace.read("nope.txt")).toBeNull();
    expect(await workspace.stat("nope.txt")).toBeNull();
    expect(await workspace.exists("nope.txt")).toBe(false);
  });

  it("treats /workspace/, workspace/ and a bare path as one file", async () => {
    await workspace.write("/workspace/notes.md", "a");
    expect(await workspace.readText("workspace/notes.md")).toBe("a");
    expect(await workspace.readText("notes.md")).toBe("a");
    expect(workspace.key("/workspace/notes.md")).toBe("notes.md");
  });

  it("reads an absolute path as workspace-relative", async () => {
    await workspace.write("/etc/passwd", "not really");
    expect(workspace.key("/etc/passwd")).toBe("etc/passwd");
    expect(await workspace.readText("etc/passwd")).toBe("not really");
  });

  it("refuses a path that climbs out of the root", async () => {
    expect(() => workspace.key("../secrets.txt")).toThrow(WorkspacePathError);
    expect(() => workspace.key("a/../../secrets.txt")).toThrow(
      WorkspacePathError
    );
  });

  it("keeps an in-root path containing .. segments that resolve inside", async () => {
    expect(workspace.key("a/b/../c.txt")).toBe("a/c.txt");
  });

  it("lists direct children with directories collapsed", async () => {
    await workspace.write("a.txt", "a");
    await workspace.write("out/b.txt", "b");
    await workspace.write("out/deep/c.txt", "c");

    const top = await workspace.list();
    expect(top.map((e) => `${e.isDirectory ? "d" : "f"}:${e.path}`)).toEqual([
      "f:a.txt",
      "d:out"
    ]);

    const inner = await workspace.list("out");
    expect(inner.map((e) => e.path)).toEqual(["out/b.txt", "out/deep"]);
  });

  it("lists every descendant when recursive", async () => {
    await workspace.write("a.txt", "a");
    await workspace.write("out/deep/c.txt", "c");
    const all = await workspace.list("", { recursive: true });
    expect(all.map((e) => e.path).sort()).toEqual(["a.txt", "out/deep/c.txt"]);
  });

  it("stats a directory as a directory", async () => {
    await workspace.write("out/b.txt", "b");
    const st = await workspace.stat("out");
    expect(st?.isDirectory).toBe(true);
    expect((await workspace.stat("out/b.txt"))?.isDirectory).toBe(false);
  });

  it("deletes a file and reports whether it was there", async () => {
    await workspace.write("a.txt", "a");
    expect(await workspace.delete("a.txt")).toBe(true);
    expect(await workspace.delete("a.txt")).toBe(false);
    expect(await workspace.exists("a.txt")).toBe(false);
  });

  it("deletes a directory tree and counts what went", async () => {
    await workspace.write("out/b.txt", "b");
    await workspace.write("out/deep/c.txt", "c");
    expect(await workspace.deleteAll("out")).toBe(2);
    expect(await workspace.list()).toEqual([]);
  });

  it("copies and moves", async () => {
    await workspace.write("a.txt", "a");
    await workspace.copy("a.txt", "b.txt");
    expect(await workspace.readText("b.txt")).toBe("a");
    await workspace.move("b.txt", "sub/c.txt");
    expect(await workspace.readText("sub/c.txt")).toBe("a");
    expect(await workspace.exists("b.txt")).toBe(false);
  });

  it("moves a directory with everything under it", async () => {
    await workspace.write("Shots/a.txt", "a");
    await workspace.write("Shots/day 1/b.txt", "b");
    const before = await workspace.stat("Shots/a.txt");
    await workspace.move("Shots", "Takes/Wide");
    expect(await workspace.readText("Takes/Wide/a.txt")).toBe("a");
    expect(await workspace.readText("Takes/Wide/day 1/b.txt")).toBe("b");
    expect(await workspace.stat("Shots")).toBeNull();
    expect(
      (await workspace.list("", { recursive: true }))
        .filter((entry) => !entry.isDirectory)
        .map((entry) => entry.path)
        .sort()
    ).toEqual(["Takes/Wide/a.txt", "Takes/Wide/day 1/b.txt"]);
    if (isLocal) {
      // A local directory is renamed, so its files keep their mtimes.
      expect((await workspace.stat("Takes/Wide/a.txt"))?.modifiedAt).toBe(
        before?.modifiedAt
      );
    }
  });

  it("refuses to move a directory into itself or onto an existing entry", async () => {
    await workspace.write("Shots/a.txt", "a");
    await workspace.write("Takes/b.txt", "b");
    await expect(workspace.move("Shots", "Shots/inner")).rejects.toThrow(
      /into itself/
    );
    await expect(workspace.move("Shots", "Takes")).rejects.toThrow(
      /already exists/
    );
    await expect(workspace.move("Nowhere", "Else")).rejects.toThrow(
      /does not exist/
    );
    expect(await workspace.readText("Shots/a.txt")).toBe("a");
    expect(await workspace.readText("Takes/b.txt")).toBe("b");
  });

  it("refuses to copy a file that is not there", async () => {
    await expect(workspace.copy("nope.txt", "b.txt")).rejects.toThrow(
      /does not exist/
    );
  });

  it("mkdir succeeds whether or not directories are real", async () => {
    await expect(workspace.mkdir("out/deep")).resolves.toBeUndefined();
  });

  it("materializes a file to a real path a host binary can read", async () => {
    await workspace.write("in/clip.txt", "frames");
    const local = await workspace.materialize("in/clip.txt");
    expect(existsSync(local)).toBe(true);
    expect(await readFile(local, "utf8")).toBe("frames");
  });

  it("absorbs a host binary's output back into the workspace", async () => {
    const scratch = await workspace.scratchDir();
    const produced = join(scratch, "rendered.txt");
    await writeFile(produced, "output");
    await workspace.absorb(produced, "out/rendered.txt");
    expect(await workspace.readText("out/rendered.txt")).toBe("output");
  });

  it("removes staged scratch files when the run ends", async () => {
    if (isLocal) return;
    const [scratch, second] = await Promise.all([
      workspace.scratchDir(),
      workspace.scratchDir()
    ]);
    expect(second).toBe(scratch);
    await writeFile(join(scratch, "staged.txt"), "temporary");
    await workspace.cleanupScratch?.();
    expect(existsSync(scratch)).toBe(false);
  });

  it("reports localDir only when the workspace is a real directory", () => {
    expect(workspace.localDir === null).toBe(!isLocal);
  });
});

/**
 * `.nodetool/` belongs to NodeTool (PRD D11). Agent tools, Code nodes and save
 * nodes all reach files through a Workspace, so refusing the directory here
 * keeps every one of them out of it.
 */
describe.each(backends)("Reserved .nodetool directory over $name", ({ isLocal }) => {
  let dir: string;
  let storage: FileStorageAdapter | InMemoryStorageAdapter;
  let workspace: Workspace;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ws-reserved-"));
    storage = isLocal
      ? new FileStorageAdapter(dir)
      : new InMemoryStorageAdapter();
    workspace = new StorageWorkspace(storage);
    // What NodeTool's own writer leaves behind, written past the workspace.
    await storage.store(".nodetool/project.json", new TextEncoder().encode("{}"));
    await workspace.write("notes.md", "hello");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const reserved = [
    ".nodetool/x",
    ".nodetool/project.json",
    ".nodetool",
    "/workspace/.nodetool/x",
    "workspace/.nodetool/x",
    "/.nodetool/x",
    "out/../.nodetool/x",
    ".NodeTool/x",
    ".nodetool\\x"
  ];

  it.each(reserved)("refuses %s in every operation", async (path) => {
    const refused = WorkspaceReservedPathError;
    expect(() => workspace.key(path)).toThrow(refused);
    expect(() => workspace.uri(path)).toThrow(refused);
    await expect(workspace.write(path, "x")).rejects.toThrow(refused);
    await expect(workspace.read(path)).rejects.toThrow(refused);
    await expect(workspace.readText(path)).rejects.toThrow(refused);
    await expect(workspace.list(path)).rejects.toThrow(refused);
    await expect(workspace.list(path, { recursive: true })).rejects.toThrow(refused);
    await expect(workspace.stat(path)).rejects.toThrow(refused);
    await expect(workspace.delete(path)).rejects.toThrow(refused);
    await expect(workspace.deleteAll(path)).rejects.toThrow(refused);
    await expect(workspace.mkdir(path)).rejects.toThrow(refused);
    await expect(workspace.copy("notes.md", path)).rejects.toThrow(refused);
    await expect(workspace.copy(path, "copy.md")).rejects.toThrow(refused);
    await expect(workspace.move("notes.md", path)).rejects.toThrow(refused);
    await expect(workspace.move(path, "moved.md")).rejects.toThrow(refused);
    await expect(workspace.materialize(path)).rejects.toThrow(refused);
    expect(await workspace.exists(path)).toBe(false);
  });

  it("leaves the reserved files untouched by every refused call", async () => {
    await workspace.write(".nodetool/project.json", "overwritten").catch(() => {});
    await workspace.delete(".nodetool/project.json").catch(() => {});
    await workspace.move("notes.md", ".nodetool/project.json").catch(() => {});
    const bytes = await storage.retrieve(storage.uriForKey(".nodetool/project.json"));
    expect(new TextDecoder().decode(bytes ?? new Uint8Array())).toBe("{}");
    expect(await workspace.readText("notes.md")).toBe("hello");
  });

  it("keeps the reserved directory out of root listings", async () => {
    expect((await workspace.list("")).map((entry) => entry.path)).toEqual([
      "notes.md"
    ]);
    expect(
      (await workspace.list("", { recursive: true })).map((entry) => entry.path)
    ).toEqual(["notes.md"]);
  });

  it("clears the workspace without clearing the reserved directory", async () => {
    expect(await workspace.deleteAll("")).toBe(1);
    expect(
      await storage.exists(storage.uriForKey(".nodetool/project.json"))
    ).toBe(true);
  });

  it("still accepts names that only look like the reserved directory", async () => {
    // Only a path segment that is exactly the name is reserved. These are
    // files and directories a creator can have anywhere in the folder.
    const ordinary = [
      ".nodetoolkit/a.txt",
      "docs/.nodetool.md",
      "docs/fox.nodetool",
      "docs/.nodetool-old/b.txt",
      "docs/nodetool/c.txt",
      "docs/x.nodetool/d.txt"
    ];
    for (const path of ordinary) {
      await workspace.write(path, path);
      expect(await workspace.readText(path)).toBe(path);
    }
    expect(
      (await workspace.list("", { recursive: true })).map((entry) => entry.path)
    ).toEqual([...ordinary, "notes.md"].sort((x, y) => x.localeCompare(y)));
    expect(await workspace.isNestedFolder("docs")).toBe(false);
    await workspace.move("docs", "papers");
    expect(await workspace.readText("papers/.nodetool.md")).toBe(
      "docs/.nodetool.md"
    );
  });

  it("is reachable through a workspace rooted at the reserved directory", async () => {
    // NodeTool's own entry point roots a workspace at `.nodetool/`, so its
    // keys never begin with the reserved segment.
    const nodetoolDir = createWorkspace(storage, { prefix: ".nodetool" });
    await nodetoolDir.write("project.json", '{"id":"p"}');
    expect(await nodetoolDir.readText("project.json")).toBe('{"id":"p"}');
  });
});

/**
 * A workspace can hold the folder of another project: Personal's managed
 * folder holds `projects/<id>`, the folder of a cloud project, an imported
 * project or a game. That folder's `.nodetool/` is reserved in the outer
 * workspace exactly as the outer workspace's own is.
 */
describe.each(backends)(
  "Reserved .nodetool directory of a nested folder over $name",
  ({ isLocal }) => {
    const INNER = "projects/abc";
    const MANIFEST = `${INNER}/.nodetool/project.json`;
    let dir: string;
    let storage: FileStorageAdapter | InMemoryStorageAdapter;
    let workspace: Workspace;

    const stored = async (key: string): Promise<string | null> => {
      const bytes = await storage.retrieve(storage.uriForKey(key));
      return bytes ? new TextDecoder().decode(bytes) : null;
    };

    beforeEach(async () => {
      dir = await mkdtemp(join(tmpdir(), "ws-nested-"));
      storage = isLocal
        ? new FileStorageAdapter(dir)
        : new InMemoryStorageAdapter();
      workspace = new StorageWorkspace(storage, {
        nestedFolders: () => ["games/tetris"]
      });
      // What the inner project's own writers leave, written past the workspace.
      await storage.store(MANIFEST, new TextEncoder().encode("{}"));
      await storage.store(`${INNER}/Generated/fox.txt`, new TextEncoder().encode("fox"));
      await workspace.write("notes.md", "hello");
    });

    afterEach(async () => {
      await rm(dir, { recursive: true, force: true });
    });

    const reserved = [
      MANIFEST,
      `${INNER}/.nodetool`,
      `${INNER}/.nodetool/trash/x`,
      `${INNER}/.NodeTool/project.json`,
      `/workspace/${INNER}/.nodetool/x`,
      `${INNER}/Generated/../.nodetool/x`,
      "projects\\abc\\.nodetool\\x",
      "a/b/c/.nodetool/x"
    ];

    it.each(reserved)("refuses %s in every operation", async (path) => {
      const refused = WorkspaceReservedPathError;
      expect(() => workspace.key(path)).toThrow(refused);
      expect(() => workspace.uri(path)).toThrow(refused);
      await expect(workspace.write(path, "x")).rejects.toThrow(refused);
      await expect(workspace.writeNew(path, "x")).rejects.toThrow(refused);
      await expect(workspace.read(path)).rejects.toThrow(refused);
      await expect(workspace.readText(path)).rejects.toThrow(refused);
      await expect(workspace.list(path)).rejects.toThrow(refused);
      await expect(workspace.stat(path)).rejects.toThrow(refused);
      await expect(workspace.delete(path)).rejects.toThrow(refused);
      await expect(workspace.deleteAll(path)).rejects.toThrow(refused);
      await expect(workspace.mkdir(path)).rejects.toThrow(refused);
      await expect(workspace.copy("notes.md", path)).rejects.toThrow(refused);
      await expect(workspace.copy(path, "copy.md")).rejects.toThrow(refused);
      await expect(workspace.move("notes.md", path)).rejects.toThrow(refused);
      await expect(workspace.move(path, "moved.md")).rejects.toThrow(refused);
      await expect(workspace.materialize(path)).rejects.toThrow(refused);
      expect(await workspace.exists(path)).toBe(false);
      expect(await stored(MANIFEST)).toBe("{}");
      expect(await workspace.readText("notes.md")).toBe("hello");
    });

    it("refuses a staging name that is the reserved directory, at any depth", async () => {
      await expect(
        workspace.writeNew(`${INNER}/fox.txt`, "x", undefined, {
          stagingName: ".nodetool"
        })
      ).rejects.toThrow(WorkspaceReservedPathError);
    });

    it("keeps a reserved directory below a plain directory out of every listing", async () => {
      // A reserved directory with no file in it marks no folder on an object
      // store, so `docs` stays a directory of this workspace on both backends.
      await storage.store("docs/.nodetool", new TextEncoder().encode("x"));
      await workspace.write("docs/a.txt", "a");

      expect((await workspace.list("docs")).map((entry) => entry.path)).toEqual([
        "docs/a.txt"
      ]);
    });

    it.each(["projects", INNER])(
      "refuses to move %s, which holds a reserved directory, and moves nothing",
      async (path) => {
        await expect(workspace.move(path, "elsewhere")).rejects.toThrow(
          WorkspaceReservedPathError
        );

        expect(await stored(MANIFEST)).toBe("{}");
        expect(await stored(`${INNER}/Generated/fox.txt`)).toBe("fox");
        expect(await workspace.exists("elsewhere")).toBe(false);
      }
    );

    it("names a directory with a reserved directory, or one the host names, as a nested folder", async () => {
      // A game's file, written past the workspace as the game's writers do.
      await storage.store("games/tetris/sprite.txt", new TextEncoder().encode("x"));
      await workspace.write("plain/a.txt", "a");

      expect(await workspace.isNestedFolder(INNER)).toBe(true);
      expect(await workspace.isNestedFolder("games/tetris")).toBe(true);
      // The root is this folder itself, and a parent of a folder is not one.
      expect(await workspace.isNestedFolder("")).toBe(false);
      expect(await workspace.isNestedFolder("projects")).toBe(false);
      expect(await workspace.isNestedFolder("games")).toBe(false);
      expect(await workspace.isNestedFolder("plain")).toBe(false);
      expect(await workspace.isNestedFolder("missing")).toBe(false);
      expect(await workspace.isNestedFolder("notes.md")).toBe(false);
      expect(await workspace.isNestedFolder("../outside")).toBe(false);
      expect(await workspace.isNestedFolder(`${INNER}/.nodetool`)).toBe(false);
    });

    it("answers for every path through NestedFolders", async () => {
      const nested = new NestedFolders(workspace);
      expect(await nested.holds(`${INNER}/Generated/fox.txt`)).toBe(true);
      expect(await nested.holds(INNER)).toBe(false);
      expect(await nested.covers(INNER)).toBe(true);
      expect(await nested.covers("projects")).toBe(false);
      expect(await nested.holds("games/tetris/sprite.txt")).toBe(true);
      expect(await nested.holds("notes.md")).toBe(false);
      expect(await nested.holds("projects/other/fox.txt")).toBe(false);
    });

    it("passes the question through an observed workspace", async () => {
      const observed = observeWorkspace(workspace, () => {});
      expect(await observed.isNestedFolder(INNER)).toBe(true);
      expect(await observed.isNestedFolder("projects")).toBe(false);
    });
  }
);

/**
 * The files of a nested folder belong to another project. A run in the outer
 * project reaches them through no workspace operation: agent file tools, the
 * JS sandbox and save nodes all go through this interface.
 */
describe.each(backends)(
  "The folder of another project inside a workspace over $name",
  ({ isLocal }) => {
    /** A project folder: it holds a `.nodetool/` directory. */
    const INNER = "projects/abc";
    /** A game workspace: no `.nodetool/`, named by the host. */
    const GAME = "games/tetris";
    let dir: string;
    let storage: FileStorageAdapter | InMemoryStorageAdapter;
    let workspace: Workspace;

    const bytes = (value: string): Uint8Array => new TextEncoder().encode(value);
    const stored = async (key: string): Promise<string | null> => {
      const found = await storage.retrieve(storage.uriForKey(key));
      return found ? new TextDecoder().decode(found) : null;
    };
    /** Every file of both nested folders is as the test set it up. */
    const expectNestedIntact = async (): Promise<void> => {
      expect(await stored(`${INNER}/.nodetool/project.json`)).toBe("{}");
      expect(await stored(`${INNER}/Generated/fox.txt`)).toBe("fox");
      expect(await stored(`${INNER}/notes.txt`)).toBe("inner");
      expect(await stored(`${GAME}/sprite.txt`)).toBe("sprite");
    };

    beforeEach(async () => {
      dir = await mkdtemp(join(tmpdir(), "ws-other-folder-"));
      storage = isLocal
        ? new FileStorageAdapter(dir)
        : new InMemoryStorageAdapter();
      workspace = new StorageWorkspace(storage, {
        nestedFolders: () => [GAME]
      });
      // What the other project's own writers leave, written past the workspace.
      await storage.store(`${INNER}/.nodetool/project.json`, bytes("{}"));
      await storage.store(`${INNER}/Generated/fox.txt`, bytes("fox"));
      await storage.store(`${INNER}/notes.txt`, bytes("inner"));
      await storage.store(`${GAME}/sprite.txt`, bytes("sprite"));
      // The outer project's own files, one of them beside the nested folder.
      await workspace.write("notes.md", "hello");
      await workspace.write("projects/readme.txt", "outer");
    });

    afterEach(async () => {
      await rm(dir, { recursive: true, force: true });
    });

    it.each([
      `${INNER}/Generated/fox.txt`,
      `${INNER}/notes.txt`,
      `${INNER}/new.txt`,
      `${INNER}/Generated`,
      `${INNER}/deep/er/new.txt`,
      `/workspace/${INNER}/notes.txt`,
      `workspace/${INNER}/notes.txt`,
      `projects/../${INNER}/notes.txt`,
      "projects\\abc\\notes.txt",
      `C:/${INNER}/notes.txt`,
      `${GAME}/sprite.txt`,
      `${GAME}/new/sprite.txt`,
      `workspace/${GAME}/sprite.txt`,
      "games\\tetris\\sprite.txt",
      `c:/${GAME}/sprite.txt`
    ])("refuses %s in every operation", async (path) => {
      const refused = WorkspaceReservedPathError;
      const local = join(dir, "outside.txt");
      await writeFile(local, "from a host binary");
      await expect(workspace.read(path)).rejects.toThrow(refused);
      await expect(workspace.readText(path)).rejects.toThrow(refused);
      await expect(workspace.write(path, "x")).rejects.toThrow(refused);
      await expect(workspace.writeNew(path, "x")).rejects.toThrow(refused);
      await expect(workspace.stat(path)).rejects.toThrow(refused);
      await expect(workspace.list(path)).rejects.toThrow(refused);
      await expect(workspace.list(path, { recursive: true })).rejects.toThrow(refused);
      await expect(workspace.delete(path)).rejects.toThrow(refused);
      await expect(workspace.deleteAll(path)).rejects.toThrow(refused);
      await expect(workspace.mkdir(path)).rejects.toThrow(refused);
      await expect(workspace.copy("notes.md", path)).rejects.toThrow(refused);
      await expect(workspace.copy(path, "copy.md")).rejects.toThrow(refused);
      await expect(workspace.move("notes.md", path)).rejects.toThrow(refused);
      await expect(workspace.move(path, "moved.md")).rejects.toThrow(refused);
      await expect(workspace.materialize(path)).rejects.toThrow(refused);
      await expect(workspace.absorb(local, path)).rejects.toThrow(refused);
      expect(await workspace.exists(path)).toBe(false);

      await expectNestedIntact();
      expect(await workspace.readText("notes.md")).toBe("hello");
      expect(await workspace.exists("copy.md")).toBe(false);
      expect(await workspace.exists("moved.md")).toBe(false);
    });

    it.each([INNER, GAME])(
      "refuses the nested folder %s itself as a directory",
      async (path) => {
        const refused = WorkspaceReservedPathError;
        await expect(workspace.stat(path)).rejects.toThrow(refused);
        await expect(workspace.list(path)).rejects.toThrow(refused);
        await expect(workspace.list(path, { recursive: true })).rejects.toThrow(refused);
        await expect(workspace.deleteAll(path)).rejects.toThrow(refused);
        await expect(workspace.mkdir(path)).rejects.toThrow(refused);
        await expect(workspace.move(path, "elsewhere")).rejects.toThrow(refused);
        await expect(workspace.move("projects", `${path}/projects`)).rejects.toThrow(
          refused
        );
        // A real path to the folder would let a host binary work in it.
        await expect(workspace.materialize(path)).rejects.toThrow(refused);
        expect(await workspace.exists(path)).toBe(false);

        await expectNestedIntact();
        expect(await workspace.readText("projects/readme.txt")).toBe("outer");
      }
    );

    it("leaves the nested folders out of every listing", async () => {
      const paths = async (
        path: string,
        recursive = false
      ): Promise<string[]> =>
        (await workspace.list(path, { recursive })).map((entry) => entry.path);

      expect(await paths("")).toEqual(["games", "notes.md", "projects"]);
      expect(await paths("projects")).toEqual(["projects/readme.txt"]);
      expect(await paths("games")).toEqual([]);
      expect(await paths("", true)).toEqual(["notes.md", "projects/readme.txt"]);
      expect(await paths("projects", true)).toEqual(["projects/readme.txt"]);
    });

    it.each(["projects", ""])(
      "deleteAll of '%s' deletes the outer project's files and leaves the nested folders intact",
      async (path) => {
        expect(await workspace.deleteAll(path)).toBe(path ? 1 : 2);

        await expectNestedIntact();
        expect(await stored("projects/readme.txt")).toBeNull();
        expect(await workspace.list("projects")).toEqual([]);
      }
    );

    it("deleteAll of a directory that only leads to a nested folder deletes nothing", async () => {
      expect(await workspace.deleteAll("games")).toBe(0);
      await expectNestedIntact();
    });

    it.each(["projects", "games"])(
      "refuses to move %s, which holds a nested folder, and moves nothing",
      async (path) => {
        await expect(workspace.move(path, "elsewhere")).rejects.toThrow(
          WorkspaceReservedPathError
        );

        await expectNestedIntact();
        expect(await stored("projects/readme.txt")).toBe("outer");
        expect(await workspace.exists("elsewhere")).toBe(false);
      }
    );

    it("never excludes the folder's own root", async () => {
      // The inner project's own workspace is rooted at its folder, which
      // holds `.nodetool/` and which a host could name by mistake.
      const inner = createWorkspace(storage, {
        prefix: INNER,
        nestedFolders: () => ["", ".", "/"]
      });

      expect(await inner.readText("notes.txt")).toBe("inner");
      expect(
        (await inner.list("", { recursive: true })).map((entry) => entry.path)
      ).toEqual(["Generated/fox.txt", "notes.txt"]);
      await inner.write("Generated/wolf.txt", "wolf");
      expect(await inner.deleteAll("Generated")).toBe(2);
      expect(await inner.isNestedFolder("")).toBe(false);
      expect(await stored(`${INNER}/.nodetool/project.json`)).toBe("{}");
    });

    it("asks the storage about a directory once while it works in it", async () => {
      await workspace.write("Shots/day 1/a.txt", "a");
      const fresh = new StorageWorkspace(storage, { nestedFolders: () => [GAME] });
      const lists = vi.spyOn(storage, "list");
      const stats = vi.spyOn(fsPromises, "stat");
      const marker = (calls: unknown[][]): number =>
        calls.filter(([target]) => String(target).includes(".nodetool")).length;

      await fresh.write("Shots/day 1/b.txt", "b");
      const first = marker(isLocal ? stats.mock.calls : lists.mock.calls);
      for (const name of ["a", "b"]) {
        expect(await fresh.readText(`Shots/day 1/${name}.txt`)).toBe(name);
      }
      await fresh.write("Shots/day 1/c.txt", "c");
      await fresh.delete("Shots/day 1/a.txt");

      // One question per directory above the files: `Shots` and `Shots/day 1`.
      expect(first).toBe(2);
      expect(marker(isLocal ? stats.mock.calls : lists.mock.calls)).toBe(2);
    });

    it.runIf(isLocal)(
      "refuses a path through a link that points at a folder the host names",
      async () => {
        // The game's folder has no `.nodetool/` to read through the link.
        await symlink(join(dir, GAME), join(dir, "shortcut"), "dir");
        const refused = WorkspaceReservedPathError;

        await expect(workspace.read("shortcut/sprite.txt")).rejects.toThrow(refused);
        await expect(workspace.write("shortcut/sprite.txt", "x")).rejects.toThrow(refused);
        await expect(workspace.write("shortcut/new/a.txt", "x")).rejects.toThrow(refused);
        await expect(workspace.list("shortcut")).rejects.toThrow(refused);
        await expect(workspace.deleteAll("shortcut")).rejects.toThrow(refused);
        await expect(workspace.materialize("shortcut/sprite.txt")).rejects.toThrow(refused);
        await expect(
          assertLocalPathIsOwn(workspace, dir, join(dir, "shortcut", "sprite.txt"))
        ).rejects.toThrow(refused);
        await expectNestedIntact();
      }
    );

    it("takes a key as it is, also below a directory named workspace", async () => {
      // `workspace/` at the start of a caller's path means the root. A key is
      // past that reading: this folder is two directories deep.
      await storage.store("workspace/abc/.nodetool/project.json", bytes("{}"));
      await storage.store("workspace/abc/notes.txt", bytes("inner"));

      expect(await workspace.isNestedFolder("workspace/abc")).toBe(true);
      expect(
        await new NestedFolders(workspace).holds("workspace/abc/notes.txt")
      ).toBe(true);
      await expect(
        workspace.read("workspace/workspace/abc/notes.txt")
      ).rejects.toThrow(WorkspaceReservedPathError);
    });

    it("refuses with a clear error while the host cannot name its folders, and never answers that a file is absent", async () => {
      let broken = true;
      const guarded = new StorageWorkspace(storage, {
        nestedFolders: () => {
          if (broken) throw new Error("SQLITE_BUSY: database is locked");
          return [GAME];
        }
      });

      for (const attempt of [
        () => guarded.read("projects/readme.txt"),
        () => guarded.write("projects/readme.txt", "overwritten"),
        () => guarded.stat("projects/readme.txt"),
        () => guarded.list("projects"),
        () => guarded.deleteAll("projects"),
        () => guarded.exists("projects/readme.txt"),
        () => guarded.isNestedFolder("projects")
      ]) {
        const refusal = attempt();
        await expect(refusal).rejects.toBeInstanceOf(WorkspaceFolderCheckError);
        await expect(refusal).rejects.toThrow(/could not be checked/);
        await expect(refusal).rejects.toThrow(/database is locked/);
      }
      expect(await stored("projects/readme.txt")).toBe("outer");

      // The failure is not remembered: the next question is asked again.
      broken = false;
      expect(await guarded.exists("projects/readme.txt")).toBe(true);
      expect(await guarded.readText("projects/readme.txt")).toBe("outer");
      await expect(guarded.read(`${GAME}/sprite.txt`)).rejects.toThrow(
        WorkspaceReservedPathError
      );
    });

    it("sees a folder that became another project's after a short time", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      try {
        await workspace.write("later/a.txt", "a");
        expect(await workspace.readText("later/a.txt")).toBe("a");
        await storage.store("later/.nodetool/project.json", bytes("{}"));

        vi.setSystemTime(Date.now() + 60_000);

        await expect(workspace.readText("later/a.txt")).rejects.toThrow(
          WorkspaceReservedPathError
        );
      } finally {
        vi.useRealTimers();
      }
    });
  }
);

describe("Workspace over a local directory", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ws-local-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("materializes in place, so a binary editing the file edits the workspace", async () => {
    const workspace = new StorageWorkspace(new FileStorageAdapter(dir));
    await workspace.write("clip.txt", "before");
    const local = await workspace.materialize("clip.txt");

    await writeFile(local, "after");
    await workspace.absorb(local, "clip.txt");

    expect(await workspace.readText("clip.txt")).toBe("after");
  });

  it("refuses to read through a symlink that escapes the root", async () => {
    // The containment rule the file tools rely on: an agent must not be able
    // to read ~/.ssh/id_rsa through a workspace file called `notes`.
    const outside = await mkdtemp(join(tmpdir(), "ws-outside-"));
    try {
      const secret = join(outside, "id_rsa");
      await writeFile(secret, "SECRET");
      await symlink(secret, join(dir, "notes"));

      const workspace = new StorageWorkspace(new FileStorageAdapter(dir));
      await expect(workspace.read("notes")).rejects.toThrow(WorkspacePathError);
      await expect(workspace.stat("notes")).rejects.toThrow(WorkspacePathError);
      expect(await workspace.exists("notes")).toBe(false);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("refuses to write under a symlinked-out directory", async () => {
    const outside = await mkdtemp(join(tmpdir(), "ws-outside-"));
    try {
      await symlink(outside, join(dir, "escape"), process.platform === "win32" ? "junction" : "dir");
      const workspace = new StorageWorkspace(new FileStorageAdapter(dir));
      await expect(
        workspace.write("escape/planted.txt", "nope")
      ).rejects.toThrow(WorkspacePathError);
      expect(existsSync(join(outside, "planted.txt"))).toBe(false);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("refuses to create through a dangling symlink that escapes the root", async () => {
    const outside = await mkdtemp(join(tmpdir(), "ws-outside-"));
    try {
      // Target does not exist: `access` would report the path as absent and a
      // create would then follow the link out of the workspace.
      await symlink(join(outside, "not-yet.txt"), join(dir, "later.txt"));
      const workspace = new StorageWorkspace(new FileStorageAdapter(dir));
      await expect(workspace.write("later.txt", "nope")).rejects.toThrow(
        WorkspacePathError
      );
      expect(existsSync(join(outside, "not-yet.txt"))).toBe(false);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("still writes into a directory it has to create", async () => {
    const workspace = new StorageWorkspace(new FileStorageAdapter(dir));
    await workspace.write("out/deep/nested.txt", "ok");
    expect(await workspace.readText("out/deep/nested.txt")).toBe("ok");
  });

  it("works when the workspace folder does not exist yet", async () => {
    // A managed workspace is created on first use, and the MCP tools point at
    // a per-user folder that may never have been written to. Refusing every
    // path until someone else creates the directory made such a workspace
    // useless.
    const fresh = join(dir, "not-created-yet");
    const workspace = new StorageWorkspace(new FileStorageAdapter(fresh));
    await workspace.write("first.txt", "hello");
    expect(await workspace.readText("first.txt")).toBe("hello");
  });

  it("writes through to the real directory", async () => {
    const workspace = new StorageWorkspace(new FileStorageAdapter(dir));
    await workspace.write("notes.md", "on disk");
    expect(await readFile(resolve(dir, "notes.md"), "utf8")).toBe("on disk");
  });

  it("refuses to deleteAll through a symlinked-out directory", async () => {
    // `list` reads through the symlink and returns keys that look lexically
    // inside the root, so the adapter's own check passes and `unlink` follows
    // the link out — deleting the user's real files.
    const outside = await mkdtemp(join(tmpdir(), "ws-outside-"));
    try {
      await writeFile(join(outside, "important.txt"), "KEEP");
      await symlink(outside, join(dir, "escape"), process.platform === "win32" ? "junction" : "dir");
      const workspace = new StorageWorkspace(new FileStorageAdapter(dir));

      await expect(workspace.deleteAll("escape")).rejects.toThrow(
        WorkspacePathError
      );
      expect(existsSync(join(outside, "important.txt"))).toBe(true);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("refuses to mkdir under a symlinked-out directory", async () => {
    const outside = await mkdtemp(join(tmpdir(), "ws-outside-"));
    try {
      await symlink(outside, join(dir, "escape"), process.platform === "win32" ? "junction" : "dir");
      const workspace = new StorageWorkspace(new FileStorageAdapter(dir));

      await expect(workspace.mkdir("escape/planted")).rejects.toThrow(
        WorkspacePathError
      );
      expect(existsSync(join(outside, "planted"))).toBe(false);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("accepts a workspace root reached through a symlink alias", async () => {
    const actual = join(dir, "actual");
    const alias = join(dir, "alias");
    await mkdir(actual);
    await symlink(actual, alias, process.platform === "win32" ? "junction" : "dir");

    const workspace = new StorageWorkspace(new FileStorageAdapter(alias));
    await workspace.write("notes.md", "through alias");

    expect(await readFile(join(actual, "notes.md"), "utf8")).toBe(
      "through alias"
    );
  });
});

describe("createWorkspace with a prefix", () => {
  it("writeNew is exclusive within the prefix and independent across prefixes", async () => {
    const shared = new InMemoryStorageAdapter();
    const alice = createWorkspace(shared, { prefix: "workspaces/alice" });
    const bob = createWorkspace(shared, { prefix: "workspaces/bob" });

    expect(await alice.writeNew("Generated/fox.txt", "alice's")).toBe(true);
    expect(await alice.writeNew("Generated/fox.txt", "again")).toBe(false);
    expect(await bob.writeNew("Generated/fox.txt", "bob's")).toBe(true);

    expect(await alice.readText("Generated/fox.txt")).toBe("alice's");
    expect(await bob.readText("Generated/fox.txt")).toBe("bob's");
  });

  it("writeNew throws on storage with no exclusive create, and writes nothing", async () => {
    const plain = new InMemoryStorageAdapter();
    // A backend from before the operation existed: it can only `store`.
    Object.defineProperty(plain, "storeIfAbsent", { value: undefined });
    for (const workspace of [
      new StorageWorkspace(plain),
      createWorkspace(plain, { prefix: "workspaces/u1" })
    ]) {
      await expect(workspace.writeNew("fox.txt", "x")).rejects.toThrow(
        /exclusive create|without replacing/
      );
      expect(await workspace.exists("fox.txt")).toBe(false);
    }
  });

  it("keeps each user's keys apart inside one bucket", async () => {
    const shared = new InMemoryStorageAdapter();
    const alice = createWorkspace(shared, { prefix: "workspaces/alice" });
    const bob = createWorkspace(shared, { prefix: "workspaces/bob" });

    await alice.write("notes.md", "alice's");
    await bob.write("notes.md", "bob's");

    expect(await alice.readText("notes.md")).toBe("alice's");
    expect(await bob.readText("notes.md")).toBe("bob's");
    expect((await alice.list()).map((e) => e.path)).toEqual(["notes.md"]);
  });

  it("hides the prefix from listings", async () => {
    const shared = new InMemoryStorageAdapter();
    const ws = createWorkspace(shared, { prefix: "workspaces/u1" });
    await ws.write("out/report.pdf", "pdf");

    expect((await ws.list()).map((e) => e.path)).toEqual(["out"]);
    expect((await ws.list("out")).map((e) => e.path)).toEqual([
      "out/report.pdf"
    ]);
    // The underlying bucket still carries the namespaced key.
    const raw = await shared.list("", {});
    expect(raw.entries.map((e) => e.key)).toEqual([
      "workspaces/u1/out/report.pdf"
    ]);
  });

  it("cannot reach a sibling prefix by climbing", async () => {
    const shared = new InMemoryStorageAdapter();
    const alice = createWorkspace(shared, { prefix: "workspaces/alice" });
    await shared.store("workspaces/bob/secret.txt", new Uint8Array([1]));

    expect(() => alice.key("../bob/secret.txt")).toThrow(WorkspacePathError);
    expect(await alice.read("/workspaces/bob/secret.txt")).toBeNull();
  });
});

describe("PrefixedStorageAdapter", () => {
  it("round-trips a key through store and retrieve", async () => {
    const inner = new InMemoryStorageAdapter();
    const scoped = new PrefixedStorageAdapter(inner, "ns");
    const uri = await scoped.store("a.txt", new Uint8Array([7]));
    expect(uri).toContain("ns/a.txt");
    expect(await scoped.retrieve(uri)).toEqual(new Uint8Array([7]));
    expect(await scoped.retrieve(scoped.uriForKey("a.txt"))).toEqual(
      new Uint8Array([7])
    );
  });

  it("reports stat keys without the prefix", async () => {
    const inner = new InMemoryStorageAdapter();
    const scoped = new PrefixedStorageAdapter(inner, "ns");
    await scoped.store("a.txt", new Uint8Array([7]));
    expect((await scoped.stat(scoped.uriForKey("a.txt")))?.key).toBe("a.txt");
  });
});

describe("localDir detection", () => {
  it("sees a real root on any adapter that exposes one", () => {
    // Two FileStorageAdapter classes ship in this repo — this package's and
    // `@nodetool-ai/storage`'s. Hosts pass either, so the check is structural;
    // an `instanceof` against one of them reports the other as virtual and
    // sends a local run through the staging path.
    const foreign = {
      rootDir: "/srv/ws",
      store: async () => "",
      retrieve: async () => null,
      exists: async () => false,
      uriForKey: (k: string) => k,
      list: async () => ({ entries: [], commonPrefixes: [] }),
      delete: async () => false,
      stat: async () => null
    };
    expect(new StorageWorkspace(foreign).localDir).toBe("/srv/ws");
  });

  it("treats an adapter with no root as virtual", () => {
    expect(new StorageWorkspace(new InMemoryStorageAdapter()).localDir).toBeNull();
  });
});
