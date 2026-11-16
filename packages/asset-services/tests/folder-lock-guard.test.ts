/**
 * The guard of a folder lock file is removed only when it is still the one
 * that was judged left behind. Before, a stale guard was found with `stat`
 * and removed with a separate call, which removed a guard that another
 * process created in between.
 */
import * as fsPromises from "node:fs/promises";
import { mkdtemp, readFile, rm, unlink, utimes, writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, rename: vi.fn(actual.rename) };
});

const { acquireFolderLockFile } = await import("../src/folder-lock-file.js");

let dir: string;
let lock: string;
let guard: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "folder-lock-guard-"));
  lock = join(dir, "project.lock");
  guard = `${lock}.guard`;
});

afterEach(async () => {
  vi.mocked(fsPromises.rename).mockClear();
  await rm(dir, { recursive: true, force: true });
});

const old = new Date(Date.now() - 120_000);

describe("the folder lock guard", () => {
  it("leaves a guard another process created after the stale one was found", async () => {
    // A lock of another host, untouched for long: taken over under the guard.
    await writeFile(lock, `1\n${hostname()}-other\nt\n`);
    await utimes(lock, old, old);
    // A guard left by a process that died holding it.
    await writeFile(guard, "left-behind");
    await utimes(guard, old, old);

    const actual = await vi.importActual<typeof import("node:fs/promises")>(
      "node:fs/promises"
    );
    let swapped = false;
    vi.mocked(fsPromises.rename).mockImplementationOnce(async (from, to) => {
      // Between the check and the removal, the left-behind guard goes and
      // another process takes the guard.
      await unlink(guard);
      await writeFile(guard, "theirs");
      swapped = true;
      return actual.rename(from, to);
    });

    const acquiring = acquireFolderLockFile(lock, { staleMs: 60_000, timeoutMs: 5_000 });
    await vi.waitFor(() => expect(swapped).toBe(true));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(await readFile(guard, "utf8")).toBe("theirs");

    // The other process is done with its guard.
    await unlink(guard);
    const held = await acquiring;
    await held.release();
  });

  it("removes a guard left behind when it is still the one found", async () => {
    await writeFile(lock, `1\n${hostname()}-other\nt\n`);
    await utimes(lock, old, old);
    await writeFile(guard, "left-behind");
    await utimes(guard, old, old);
    const held = await acquireFolderLockFile(lock, { staleMs: 60_000, timeoutMs: 2_000 });
    await held.release();
    await expect(readFile(guard, "utf8")).rejects.toThrow();
  });

  it("removes a guard directory left behind by an earlier version", async () => {
    await writeFile(lock, `1\n${hostname()}-other\nt\n`);
    await utimes(lock, old, old);
    await fsPromises.mkdir(guard);
    await utimes(guard, old, old);
    const held = await acquireFolderLockFile(lock, { staleMs: 60_000, timeoutMs: 2_000 });
    await held.release();
    await expect(fsPromises.stat(guard)).rejects.toThrow();
  });
});
