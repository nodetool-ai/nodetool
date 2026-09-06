/**
 * `observeWorkspace` is what tells the Workspace Explorer a run wrote a file.
 * Workspace files are not database rows, so nothing else reports them.
 */

import { describe, it, expect, beforeEach } from "vitest";

import { InMemoryStorageAdapter } from "@nodetool-ai/storage";
import { StorageWorkspace } from "../src/storage-workspace.js";
import {
  observeWorkspace,
  type Workspace,
  type WorkspaceChange
} from "../src/workspace.js";

describe("observeWorkspace", () => {
  let inner: Workspace;
  let observed: Workspace;
  let changes: WorkspaceChange[];

  beforeEach(() => {
    inner = new StorageWorkspace(new InMemoryStorageAdapter());
    changes = [];
    observed = observeWorkspace(inner, (change) => changes.push(change));
  });

  it("reports a write once the bytes are stored", async () => {
    await observed.write("notes.md", "hello");
    expect(changes).toEqual([{ kind: "write", path: "notes.md" }]);
    expect(await inner.readText("notes.md")).toBe("hello");
  });

  it("stays quiet on reads", async () => {
    await observed.write("notes.md", "hello");
    changes.length = 0;
    await observed.readText("notes.md");
    await observed.list(".");
    await observed.stat("notes.md");
    await observed.exists("notes.md");
    expect(changes).toEqual([]);
  });

  it("does not announce a file a failed write never created", async () => {
    await expect(observed.write("../escape.md", "x")).rejects.toThrow();
    expect(changes).toEqual([]);
  });

  it("reports delete only when something went", async () => {
    await observed.write("gone.md", "x");
    changes.length = 0;
    expect(await observed.delete("gone.md")).toBe(true);
    expect(await observed.delete("gone.md")).toBe(false);
    expect(changes).toEqual([{ kind: "delete", path: "gone.md" }]);
  });

  it("reports copy and move against the destination", async () => {
    await observed.write("a.md", "x");
    changes.length = 0;
    await observed.copy("a.md", "b.md");
    await observed.move("b.md", "c.md");
    expect(changes).toEqual([
      { kind: "copy", path: "b.md" },
      { kind: "move", path: "c.md" }
    ]);
  });

  it("survives a listener that throws", async () => {
    const rigged = observeWorkspace(inner, () => {
      throw new Error("listener blew up");
    });
    await expect(rigged.write("notes.md", "hello")).resolves.toBeUndefined();
    expect(await inner.readText("notes.md")).toBe("hello");
  });
});
