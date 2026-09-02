/**
 * The bounded generator merge that backs task and fan-out dispatch.
 */
import { describe, it, expect } from "vitest";
import { createSemaphore } from "@nodetool-ai/runtime";
import { createDynamicMerge } from "../src/utils/merge-generators.js";

function tracked(
  id: string,
  items: number,
  state: { active: number; peak: number }
) {
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

describe("createDynamicMerge", () => {
  it("consumes a generator added while the stream is running", async () => {
    const merge = createDynamicMerge<string>({});
    merge.add(
      (async function* () {
        yield "first";
      })()
    );

    const out: string[] = [];
    const consumed = (async () => {
      for await (const item of merge.stream()) {
        out.push(item);
        if (item === "first") {
          merge.add(
            (async function* () {
              yield "second";
            })()
          );
          merge.close();
        }
      }
    })();

    await consumed;
    expect(out).toEqual(["first", "second"]);
  });

  it("keeps the stream open until it is closed", async () => {
    const merge = createDynamicMerge<string>({});
    const out: string[] = [];
    const consumed = (async () => {
      for await (const item of merge.stream()) out.push(item);
    })();

    // Nothing has been added and nothing is running: an open merge waits
    // rather than deciding it is done, which is what lets the DAG scheduler
    // add the next node after the current one settles.
    let ended = false;
    consumed.then(() => {
      ended = true;
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(ended).toBe(false);

    merge.add(
      (async function* () {
        yield "late";
      })()
    );
    merge.close();
    await consumed;
    expect(out).toEqual(["late"]);
  });
});
