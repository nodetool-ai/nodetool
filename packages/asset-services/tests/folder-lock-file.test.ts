/**
 * The project folder lock holds across processes (PF17 F7, decision Q3):
 * the desktop server and a CLI command that share one database never work on
 * one project folder at the same time.
 *
 * The second process is a real `node` child that loads the lock module from
 * source.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  FolderLockTimeoutError,
  acquireFolderLockFile,
  projectFolderLockPath,
  setProjectFolderLockDirectory
} from "../src/folder-lock-file.js";
import { withProjectFolderLock } from "../src/project-asset.js";

const MODULE = fileURLToPath(new URL("../src/folder-lock-file.ts", import.meta.url));
const HOLDER = fileURLToPath(new URL("./fixtures/folder-lock-holder.mjs", import.meta.url));

let dir: string;
let lock: string;
const children: ChildProcess[] = [];

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "folder-lock-"));
  lock = join(dir, "project.lock");
});

afterEach(async () => {
  for (const child of children.splice(0)) child.kill("SIGKILL");
  setProjectFolderLockDirectory(undefined);
  await rm(dir, { recursive: true, force: true });
});

/** Start the holder process. Resolves once it holds the lock. */
function startHolder(
  path: string,
  args: string[]
): { child: ChildProcess; held: Promise<void>; exited: Promise<number | null>; output: () => string } {
  const child = spawn(
    process.execPath,
    ["--experimental-strip-types", "--no-warnings", HOLDER, MODULE, path, ...args],
    { stdio: ["ignore", "pipe", "pipe"] }
  );
  children.push(child);
  let out = "";
  let err = "";
  const held = new Promise<void>((resolve, reject) => {
    child.stdout!.on("data", (chunk: Buffer) => {
      out += chunk.toString();
      if (out.includes("held\n")) resolve();
    });
    child.stderr!.on("data", (chunk: Buffer) => {
      err += chunk.toString();
    });
    child.on("exit", (code) => {
      if (!out.includes("held\n")) {
        reject(new Error(`holder exited with ${code} before it held the lock: ${err}`));
      }
    });
  });
  const exited = new Promise<number | null>((resolve) => child.on("exit", resolve));
  return { child, held, exited, output: () => out };
}

describe("the folder lock file", () => {
  it("loses no update when two processes change one file under it", async () => {
    const counter = join(dir, "counter");
    await writeFile(counter, "0");
    const times = 25;
    const holder = startHolder(lock, ["count", counter, String(times)]);
    await holder.held;
    for (let i = 0; i < times; i++) {
      const held = await acquireFolderLockFile(lock);
      const value = Number(await readFile(counter, "utf8"));
      await new Promise((resolve) => setTimeout(resolve, 2));
      await writeFile(counter, String(value + 1));
      await held.release();
    }
    expect(await holder.exited).toBe(0);
    expect(Number(await readFile(counter, "utf8"))).toBe(2 * times);
  }, 30_000);

  it("waits for the other process to release it", async () => {
    const holder = startHolder(lock, ["hold", "400"]);
    await holder.held;
    const held = await acquireFolderLockFile(lock);
    // The holder printed "releasing" before it removed the file.
    expect(holder.output()).toContain("releasing");
    await held.release();
    expect(await holder.exited).toBe(0);
  }, 30_000);

  it("takes over at once from a process on this host that exited holding it", async () => {
    const holder = startHolder(lock, ["die"]);
    await holder.held;
    await holder.exited;
    const started = Date.now();
    const held = await acquireFolderLockFile(lock, { staleMs: 60_000 });
    expect(Date.now() - started).toBeLessThan(5_000);
    await held.release();
  }, 30_000);

  it("keeps a lock of another host while it is touched, and takes it over once it is not", async () => {
    const owner = `1\n${hostname()}-other\nt\n`;
    await writeFile(lock, owner);
    await expect(
      acquireFolderLockFile(lock, { staleMs: 60_000, timeoutMs: 300 })
    ).rejects.toBeInstanceOf(FolderLockTimeoutError);
    expect(await readFile(lock, "utf8")).toBe(owner);

    const old = new Date(Date.now() - 120_000);
    await utimes(lock, old, old);
    const held = await acquireFolderLockFile(lock, { staleMs: 60_000, timeoutMs: 2_000 });
    expect(await readFile(lock, "utf8")).not.toBe(owner);
    await held.release();
  });

  it("serializes two independent holders in one process", async () => {
    const first = await acquireFolderLockFile(lock);
    let second = false;
    const waiting = acquireFolderLockFile(lock).then((held) => {
      second = true;
      return held;
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(second).toBe(false);
    await first.release();
    await (await waiting).release();
    expect(second).toBe(true);
  });

  it("leaves a lock it does not own when it releases", async () => {
    const held = await acquireFolderLockFile(lock);
    const other = `${process.pid}\n${hostname()}\nother\n`;
    await writeFile(lock, other);
    await held.release();
    expect(await readFile(lock, "utf8")).toBe(other);
  });
});

describe("withProjectFolderLock", () => {
  it("waits while another process holds the folder's lock file", async () => {
    setProjectFolderLockDirectory(dir);
    const holder = startHolder(projectFolderLockPath(dir, "user", "project"), [
      "hold",
      "400"
    ]);
    await holder.held;
    let outputAtStart = "";
    await withProjectFolderLock("user", "project", async () => {
      outputAtStart = holder.output();
    });
    expect(outputAtStart).toContain("releasing");
    expect(await holder.exited).toBe(0);
  }, 30_000);

  it("does not wait for the lock of another project", async () => {
    setProjectFolderLockDirectory(dir);
    const holder = startHolder(projectFolderLockPath(dir, "user", "project"), [
      "hold",
      "2000"
    ]);
    await holder.held;
    let outputAtStart = "";
    await withProjectFolderLock("user", "other-project", async () => {
      outputAtStart = holder.output();
    });
    expect(outputAtStart).not.toContain("releasing");
  }, 30_000);
});
