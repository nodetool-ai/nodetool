import fs from "node:fs";
import fsp, { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
import { copyBackendBundleForSmoke, smokeBackendBundle } from "../smoke-backend-bundle.mjs";

async function smokeFixture(run, { probe = "", server = "" } = {}) {
  const root = await mkdtemp(join(tmpdir(), "backend-smoke-probe-"));
  const bundle = join(root, "bundle");
  const report = join(root, "probe.jsonl");
  const bunnyDir = join(bundle, "_modules", "mediabunny", "dist", "modules", "src");
  const serverDir = join(bundle, "_modules", "@mediabunny", "server", "dist", "bundles");
  try {
    await Promise.all([mkdir(bunnyDir, { recursive: true }), mkdir(serverDir, { recursive: true })]);
    await writeFile(join(bunnyDir, "index.js"), `
      import assert from "node:assert/strict";
      export class BufferTarget {}
      export class Mp4OutputFormat {}
      export class Output { constructor(options) { Object.assign(this, options); } }
      export class BufferSource { constructor(bytes) { this.bytes = bytes; } }
      export class Input { constructor(options) { Object.assign(this, options); } }
      export const ALL_FORMATS = [];
      export class Conversion {
        static async init(options) {
          assert.equal(options.audio.codec, "aac");
          assert.equal(new TextDecoder().decode(options.input.source.bytes.slice(0, 4)), "RIFF");
          return { isValid: true, async execute() { options.output.target.buffer = new ArrayBuffer(8); } };
        }
      }
    `);
    await writeFile(join(serverDir, "mediabunny-server.mjs"), `
      import { appendFileSync, existsSync } from "node:fs";
      const report = ${JSON.stringify(report)};
      appendFileSync(report, JSON.stringify({ event: "import", pid: process.pid, execPath: process.execPath }) + "\\n");
      process.once("exit", () => {
        if (existsSync(report)) appendFileSync(report, JSON.stringify({ event: "close", pid: process.pid }) + "\\n");
      });
      ${probe}
      export function registerMediabunnyServer() {}
    `);
    await writeFile(join(bundle, "server.mjs"), server || `
      import http from "node:http";
      http.createServer((request, response) => response.end("healthy"))
        .listen(Number(process.env.PORT), "127.0.0.1");
    `);
    await run({ bundle, report });
  } finally {
    vi.restoreAllMocks();
    await rm(root, { recursive: true, force: true });
  }
}

test("native codec probe uses bundled Node and closes before Windows-style cleanup", async () => {
  await smokeFixture(async ({ bundle, report }) => {
    const runtime = join(bundle, "runtime");
    await mkdir(runtime);
    await copyFile(process.execPath, join(runtime, process.platform === "win32" ? "node.exe" : "node"), fs.constants.COPYFILE_FICLONE);
    const remove = fsp.rm;
    vi.spyOn(fsp, "rm").mockImplementation(async (target, options) => {
      if (String(target).includes("nodetool-bundle-smoke-")) {
        const events = (await readFile(report, "utf8")).trim().split("\n").map(JSON.parse);
        // Windows cannot unlink a native library still loaded in a live process.
        if (events[0].pid === process.pid || !events.some((event) => event.event === "close")) {
          throw Object.assign(new Error("EPERM: native codec is still loaded"), { code: "EPERM" });
        }
      }
      return remove(target, options);
    });
    const result = await smokeBackendBundle(bundle, { timeoutMs: 5_000 });
    const [loaded, closed] = (await readFile(report, "utf8")).trim().split("\n").map(JSON.parse);
    expect(result.healthy).toBe(true);
    expect(loaded.pid).not.toBe(process.pid);
    expect(loaded.execPath).toBe(result.nodeBinary);
    expect(closed).toEqual({ event: "close", pid: loaded.pid });
    expect(fs.existsSync(result.nodeBinary)).toBe(false);
  });
});

test("native probe failure includes child output and exit status", async () => {
  await smokeFixture(async ({ bundle }) => {
    await expect(smokeBackendBundle(bundle)).rejects.toThrow(/code 1[\s\S]*fixture codec failure/);
  }, { probe: 'throw new Error("fixture codec failure");' });
});

test("native probe handles a missing Node executable", async () => {
  await smokeFixture(async ({ bundle }) => {
    await expect(smokeBackendBundle(bundle, { nodePath: join(bundle, "missing-node") }))
      .rejects.toThrow(/Mediabunny.*ENOENT/s);
  });
});

test("native probe timeout terminates the child before cleanup", async () => {
  await smokeFixture(async ({ bundle, report }) => {
    await expect(smokeBackendBundle(bundle, { timeoutMs: 1_500 }))
      .rejects.toThrow(/Mediabunny.*1500ms/s);
    const [{ execPath, pid }] = (await readFile(report, "utf8")).trim().split("\n").map(JSON.parse);
    expect(execPath).toBe(process.execPath);
    expect(() => process.kill(pid, 0)).toThrow();
  }, { probe: 'await new Promise(() => { setInterval(() => {}, 1000); });' });
});

test.skipIf(process.platform === "win32")("native probe reports termination by signal", async () => {
  await smokeFixture(async ({ bundle }) => {
    await expect(smokeBackendBundle(bundle)).rejects.toThrow(/code null, signal SIGTERM/);
  }, { probe: 'process.kill(process.pid, "SIGTERM");' });
});

test("healthy smoke still fails when cleanup fails", async () => {
  await smokeFixture(async ({ bundle }) => {
    const remove = fsp.rm;
    const blocked = [];
    vi.spyOn(fsp, "rm").mockImplementation(async (target, options) => {
      if (String(target).includes("nodetool-bundle-smoke-")) {
        blocked.push(target);
        throw new Error("fixture cleanup failure");
      }
      return remove(target, options);
    });
    try {
      await expect(smokeBackendBundle(bundle)).rejects.toThrow("fixture cleanup failure");
    } finally {
      await Promise.all(blocked.map((target) => remove(target, { recursive: true, force: true })));
    }
  });
});

test.each(["probe", "boot"])("cleanup failure preserves the primary %s error", async (stage) => {
  await smokeFixture(async ({ bundle }) => {
    const remove = fsp.rm;
    const blocked = [];
    vi.spyOn(fsp, "rm").mockImplementation(async (target, options) => {
      if (String(target).includes("nodetool-bundle-smoke-")) {
        blocked.push(target);
        throw new Error("fixture cleanup failure");
      }
      return remove(target, options);
    });
    const warning = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(smokeBackendBundle(bundle, { timeoutMs: 5_000 }))
        .rejects.toThrow(stage === "probe" ? "fixture codec failure" : "fixture boot failure");
      expect(warning).toHaveBeenCalledWith(expect.stringContaining("fixture cleanup failure"));
    } finally {
      await Promise.all(blocked.map((target) => remove(target, { recursive: true, force: true })));
    }
  }, stage === "probe"
    ? { probe: 'throw new Error("fixture codec failure");' }
    : { server: 'console.error("fixture boot failure"); process.exit(7);' });
});

test("backend smoke cannot resolve an unstaged dependency from the checkout", async () => {
  const root = await mkdtemp(join(tmpdir(), "backend-smoke-resolution-"));
  try {
    const project = join(root, "checkout");
    const dependency = join(project, "node_modules", "fixture-ancestor");
    const bundle = join(project, "backend-bundle");
    const temporary = join(root, "isolated");
    await Promise.all([mkdir(dependency, { recursive: true }), mkdir(bundle, { recursive: true }), mkdir(temporary)]);
    await writeFile(join(dependency, "package.json"), JSON.stringify({ name: "fixture-ancestor", main: "index.cjs" }));
    await writeFile(join(dependency, "index.cjs"), "module.exports = 7;");
    await writeFile(join(bundle, "server.cjs"), 'module.exports = require("fixture-ancestor");');
    expect(createRequire(join(bundle, "entry.cjs"))("./server.cjs")).toBe(7);

    const isolated = await copyBackendBundleForSmoke(bundle, temporary);
    expect(() => createRequire(join(isolated, "entry.cjs"))("./server.cjs")).toThrow("Cannot find module 'fixture-ancestor'");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
