import assert from "node:assert/strict";
import * as nodeFs from "node:fs";
import { tmpdir } from "node:os";
import { registerHooks } from "node:module";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { resolveReal } from "../host-modules.mjs";

// `guest-real:` is resolved by the guest build. Resolve it here as it does.
registerHooks({
  resolve: (specifier, context, next) =>
    specifier.startsWith("guest-real:")
      ? { url: pathToFileURL(resolveReal(specifier.slice("guest-real:".length))).href, shortCircuit: true }
      : next(specifier, context)
});
const { LocalWorkspace } = await import("./workspace.mjs");

// The `files` host capability on a real temporary folder, without the native
// runner's own checks, so the guest's checks are what the test sees. Node's
// error messages have the shape guest/host/fs.mjs parses from the host.
function withWorkspace(body) {
  const dir = nodeFs.realpathSync(nodeFs.mkdtempSync(join(tmpdir(), "gr-workspace-")));
  const previous = globalThis.__host;
  globalThis.__host = {
    files: {
      cwd: () => dir,
      bound: () => false,
      readFile: (path) => new Uint8Array(nodeFs.readFileSync(path)),
      writeFile: (path, bytes, append) =>
        append ? nodeFs.appendFileSync(path, bytes) : nodeFs.writeFileSync(path, bytes),
      stat: (path, follow) => {
        const st = follow ? nodeFs.statSync(path) : nodeFs.lstatSync(path);
        const kind = st.isDirectory() ? "directory" : st.isFile() ? "file" : "other";
        return JSON.stringify({ kind, size: st.size, mode: st.mode, mtimeMs: st.mtimeMs, ctimeMs: st.ctimeMs, birthtimeMs: st.birthtimeMs });
      },
      readdir: (path) =>
        JSON.stringify(
          nodeFs
            .readdirSync(path, { withFileTypes: true })
            .map((entry) => [entry.name, entry.isDirectory() ? "directory" : entry.isFile() ? "file" : "other"])
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        ),
      mkdir: (path, recursive) => nodeFs.mkdirSync(path, { recursive }),
      rm: (path, recursive, force) => nodeFs.rmSync(path, { recursive, force }),
      rmdir: (path) => nodeFs.rmdirSync(path),
      unlink: (path) => nodeFs.unlinkSync(path)
    }
  };
  const write = (rel, text) => {
    nodeFs.mkdirSync(join(dir, rel, ".."), { recursive: true });
    nodeFs.writeFileSync(join(dir, rel), text);
  };
  return Promise.resolve(body(new LocalWorkspace(dir), dir, write)).finally(() => {
    globalThis.__host = previous;
    nodeFs.rmSync(dir, { recursive: true, force: true });
  });
}

const reserved = /Path '.*' is inside \.nodetool\/, which NodeTool reserves for its own files/;

test("the workspace refuses every path in .nodetool/, in any case", () =>
  withWorkspace(async (workspace, dir, write) => {
    write(".nodetool/state.json", "{}");
    write("notes.md", "notes");
    for (const path of [
      ".nodetool",
      ".nodetool/state.json",
      ".NodeTool/state.json",
      "sub/.NODETOOL/x.txt",
      "/workspace/.nodetool/state.json",
      "workspace/.nodetool",
      `${dir}/.nodetool/state.json`,
      "sub/../.nodetool/state.json"
    ]) {
      assert.throws(() => workspace.key(path), reserved, path);
    }
    await assert.rejects(workspace.read(".nodetool/state.json"), reserved);
    await assert.rejects(workspace.write(".nodetool/new.txt", "x"), reserved);
    await assert.rejects(workspace.stat(".nodetool/state.json"), reserved);
    await assert.rejects(workspace.delete(".nodetool/state.json"), reserved);
    await assert.rejects(workspace.copy(".nodetool/state.json", "copy.json"), reserved);
    await assert.rejects(workspace.move("notes.md", ".nodetool/notes.md"), reserved);
    await assert.rejects(workspace.materialize(".nodetool/state.json"), reserved);
    await assert.rejects(workspace.list(".nodetool"), reserved);
    await assert.rejects(workspace.list("sub/.NodeTool", { recursive: true }), reserved);
    await assert.rejects(workspace.mkdir(".nodetool/deep"), reserved);
    await assert.rejects(workspace.deleteAll(".nodetool"), reserved);
    assert.equal(await workspace.exists(".nodetool/state.json"), false);
    assert.equal(nodeFs.readFileSync(join(dir, ".nodetool/state.json"), "utf8"), "{}");
    assert.equal(nodeFs.existsSync(join(dir, ".nodetool/new.txt")), false);
    assert.equal(nodeFs.existsSync(join(dir, ".nodetool/deep")), false);
    assert.equal(nodeFs.existsSync(join(dir, ".nodetool/notes.md")), false);
    assert.equal(nodeFs.readFileSync(join(dir, "notes.md"), "utf8"), "notes");
  }));

test("only a segment named exactly .nodetool is reserved", () =>
  withWorkspace(async (workspace) => {
    for (const path of [".nodetool.md", "fox.nodetool", ".nodetool-old/x.txt", "a/.nodetools/b"]) {
      assert.equal(workspace.key(path), path);
    }
    await workspace.write(".nodetool-old/x.txt", "old");
    assert.equal(await workspace.readText(".nodetool-old/x.txt"), "old");
  }));

test("listings and deleteAll leave .nodetool/ out", () =>
  withWorkspace(async (workspace, dir, write) => {
    write(".nodetool/state.json", "{}");
    write(".nodetool.md", "notes");
    write("sub/a.txt", "a");
    write("sub/.NodeTool/x.txt", "nested");
    write("sub/deep/b.txt", "b");

    const top = await workspace.list("");
    assert.deepEqual(top.map((e) => [e.path, e.isDirectory]), [
      [".nodetool.md", false],
      ["sub", true]
    ]);
    const all = await workspace.list("", { recursive: true });
    assert.deepEqual(all.map((e) => e.path), [".nodetool.md", "sub/a.txt", "sub/deep/b.txt"]);
    const sub = await workspace.list("sub");
    assert.deepEqual(sub.map((e) => e.path), ["sub/a.txt", "sub/deep"]);

    assert.equal(await workspace.deleteAll("sub"), 2);
    // The reserved directory stays, with the directory that leads to it.
    assert.equal(nodeFs.readFileSync(join(dir, "sub/.NodeTool/x.txt"), "utf8"), "nested");
    assert.equal(nodeFs.existsSync(join(dir, "sub/a.txt")), false);
    assert.equal(nodeFs.existsSync(join(dir, "sub/deep")), false);

    assert.equal(await workspace.deleteAll(""), 1);
    assert.equal(nodeFs.readFileSync(join(dir, ".nodetool/state.json"), "utf8"), "{}");
    assert.equal(nodeFs.existsSync(join(dir, ".nodetool.md")), false);

    // A directory with nothing reserved in it is removed whole.
    write("plain/c.txt", "c");
    assert.equal(await workspace.deleteAll("plain"), 1);
    assert.equal(nodeFs.existsSync(join(dir, "plain")), false);
  }));
