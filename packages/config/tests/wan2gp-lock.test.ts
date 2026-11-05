import { mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { withWan2GPLock } from "../src/wan2gp-lock.js";

let root: string;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "wan2gp-lock-")); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

describe("Wan2GP lifecycle lock", () => {
  it("stays outside the install and releases after an action fails", async () => {
    const target = join(root, "wan2gp");
    await mkdir(target);
    await expect(withWan2GPLock(target, async () => {
      await rm(target, { recursive: true });
      expect((await stat(`${target}.nodetool-lock`)).isDirectory()).toBe(true);
      throw new Error("operation failed");
    })).rejects.toThrow("operation failed");
    await expect(stat(`${target}.nodetool-lock`)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await withWan2GPLock(target, async () => "retried")).toBe("retried");
  });

  it("cancels a waiter without removing the owner's lock", async () => {
    const target = join(root, "wan2gp");
    const controller = new AbortController();
    await withWan2GPLock(target, async () => {
      await expect(withWan2GPLock(target, async () => "unexpected", {
        signal: controller.signal,
        onWait: () => controller.abort(new Error("cancelled lock wait"))
      })).rejects.toMatchObject({ name: "AbortError" });
      expect((await stat(`${target}.nodetool-lock`)).isDirectory()).toBe(true);
    });
  });

  it("times out without stealing an existing lock", async () => {
    const target = join(root, "wan2gp");
    await mkdir(`${target}.nodetool-lock`);
    await expect(withWan2GPLock(target, async () => "unexpected", { timeoutMs: 0 })).rejects.toThrow("If its owner stopped");
    expect((await stat(`${target}.nodetool-lock`)).isDirectory()).toBe(true);
  });
});
