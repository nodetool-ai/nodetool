/**
 * The bounded generator merge that backs task and fan-out dispatch.
 */
import { describe, it, expect } from "vitest";
import { mergeAsyncGenerators } from "../src/utils/merge-generators.js";

function tracked(id: string, items: number, state: { active: number; peak: number }) {
  return (async function* () {
    state.active++;
    state.peak = Math.max(state.peak, state.active);
    try {
      for (let i = 0; i < items; i++) {
        await new Promise((r) => setTimeout(r, 1));
        yield `${id}:${i}`;
      }
    } finally {
      state.active--;
    }
  })();
}

describe("mergeAsyncGenerators", () => {
  it("yields every item from every generator", async () => {
    const state = { active: 0, peak: 0 };
    const out: string[] = [];
    for await (const item of mergeAsyncGenerators([
      tracked("a", 2, state),
      tracked("b", 2, state)
    ])) {
      out.push(item);
    }
    expect(out.sort()).toEqual(["a:0", "a:1", "b:0", "b:1"]);
  });

  it("never runs more than `concurrency` generators at once", async () => {
    const state = { active: 0, peak: 0 };
    const generators = Array.from({ length: 10 }, (_, i) =>
      tracked(`g${i}`, 2, state)
    );

    const out: string[] = [];
    for await (const item of mergeAsyncGenerators(generators, {
      concurrency: 3
    })) {
      out.push(item);
    }

    expect(out).toHaveLength(20);
    expect(state.peak).toBeLessThanOrEqual(3);
  });

  it("leaves generators past the cap unstarted when the consumer stops early", async () => {
    const started: string[] = [];
    // Long-running: a slot only frees when the consumer drains, so nothing
    // past the cap should ever begin. A queued sub-agent has issued no
    // provider call, which is the point of the bound.
    const generators = Array.from({ length: 6 }, (_, i) =>
      (async function* () {
        started.push(`g${i}`);
        yield `g${i}`;
        await new Promise((r) => setTimeout(r, 50));
      })()
    );

    for await (const _item of mergeAsyncGenerators(generators, {
      concurrency: 2
    })) {
      break;
    }

    expect(started).toEqual(["g0", "g1"]);
  });

  it("rethrows the first error after draining", async () => {
    const failing = (async function* () {
      yield "one";
      throw new Error("boom");
    })();
    const fine = (async function* () {
      yield "two";
    })();

    const out: string[] = [];
    await expect(
      (async () => {
        for await (const item of mergeAsyncGenerators([failing, fine])) {
          out.push(item);
        }
      })()
    ).rejects.toThrow("boom");
    expect(out).toContain("one");
  });
});
