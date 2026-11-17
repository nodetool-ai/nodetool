/**
 * Pause points and their harness (WP2.6): in-process holds in a chosen order,
 * shuffled repeats, and a process killed at a named step.
 */
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { pausePoint } from "../src/pause-points.js";
import {
  PauseGate,
  repeatUnordered,
  startPausableProcess
} from "../src/testing/pause-harness.js";

const here = dirname(fileURLToPath(import.meta.url));
const CHILD = join(here, "fixtures", "pause-child.ts");
const REPO = resolve(here, "../../..");

function runChild(dir: string, pauseAt?: string) {
  return startPausableProcess({
    command: process.execPath,
    args: ["--conditions=nodetool-dev", "--import", "tsx", CHILD, dir],
    cwd: REPO,
    pauseAt
  });
}

describe("pause points", () => {
  let gate: PauseGate | null = null;
  const savedEnv = { ...process.env };
  afterEach(() => {
    gate?.uninstall();
    gate = null;
    process.env = { ...savedEnv };
  });

  it("returns at once when nothing holds the step", async () => {
    delete process.env["NODETOOL_PAUSE_AT"];
    await expect(pausePoint("anything")).resolves.toBeUndefined();
  });

  it("ignores NODETOOL_PAUSE_AT on a production server", async () => {
    process.env["NODETOOL_PAUSE_AT"] = "step";
    process.env["NODE_ENV"] = "production";
    await expect(pausePoint("step")).resolves.toBeUndefined();
  });

  it("holds callers at a step and releases them in the order the test picks", async () => {
    gate = new PauseGate(["write"]).install();
    const finished: string[] = [];
    const flow = async (label: string) => {
      await pausePoint("other");
      await pausePoint("write");
      finished.push(label);
    };
    const a = flow("a");
    const b = flow("b");
    await gate.waitFor("write", 2);
    expect(finished).toEqual([]);
    // The second arrival goes first.
    gate.release("write", 1);
    await b;
    expect(finished).toEqual(["b"]);
    gate.release("write");
    await a;
    expect(finished).toEqual(["b", "a"]);
    expect(() => gate?.release("write")).toThrow(/No caller/);
  });

  it("starts tasks in a shuffled order on each run", async () => {
    const orders: string[] = [];
    let seed = 1;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    await repeatUnordered(
      6,
      ["a", "b", "c"].map((label) => async () => {
        orders.push(label);
        return label;
      }),
      (results) => {
        expect(results.map((r) => (r.status === "fulfilled" ? r.value : null))).toEqual(["a", "b", "c"]);
      },
      random
    );
    const rounds = [0, 1, 2, 3, 4, 5].map((i) => orders.slice(i * 3, i * 3 + 3).join(""));
    expect(new Set(rounds).size).toBeGreaterThan(1);
  });

  it("kills a process at a named step so the step after it never runs", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pause-"));
    try {
      const paused = runChild(dir, "between");
      expect(await paused.paused).toBe("between");
      await paused.kill();
      expect((await paused.exited).signal).toBe("SIGKILL");
      expect(existsSync(join(dir, "first"))).toBe(true);
      expect(existsSync(join(dir, "second"))).toBe(false);

      // A new process on the same files runs to the end.
      const rerun = runChild(dir);
      expect((await rerun.exited).code).toBe(0);
      expect(existsSync(join(dir, "second"))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
