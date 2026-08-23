/**
 * The workspace contract, run twice: once over a real directory and once over
 * an object store. Every assertion below holds for both, which is the whole
 * point of the abstraction — a node that passes locally behaves the same in
 * the cloud.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
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

import { FileStorageAdapter, InMemoryStorageAdapter } from "../src/context.js";
import { PrefixedStorageAdapter } from "../src/prefixed-storage-adapter.js";
import {
  StorageWorkspace,
  createWorkspace
} from "../src/storage-workspace.js";
import { WorkspacePathError, type Workspace } from "../src/workspace.js";

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
    await rm(dir, { recursive: true, force: true });
  });

  it("round-trips text", async () => {
    await workspace.write("notes.md", "hello");
    expect(await workspace.readText("notes.md")).toBe("hello");
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

  it("reports localDir only when the workspace is a real directory", () => {
    expect(workspace.localDir === null).toBe(!isLocal);
  });
});

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
      await symlink(outside, join(dir, "escape"));
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

  it("accepts a workspace root reached through a symlink alias", async () => {
    const actual = join(dir, "actual");
    const alias = join(dir, "alias");
    await mkdir(actual);
    await symlink(actual, alias);

    const workspace = new StorageWorkspace(new FileStorageAdapter(alias));
    await workspace.write("notes.md", "through alias");

    expect(await readFile(join(actual, "notes.md"), "utf8")).toBe(
      "through alias"
    );
  });
});

describe("createWorkspace with a prefix", () => {
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
