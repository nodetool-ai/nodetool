/**
 * A chat turn can end while a background generation it started still runs.
 * The turn's job listeners must stay attached until that generation settles,
 * or its completed message reaches nobody and its row stays "running".
 */
import { describe, expect, it } from "vitest";
import { ProcessingContext } from "@nodetool-ai/runtime";
import {
  startBackgroundGeneration,
  whenBackgroundGenerationsSettle
} from "../src/capabilities/background-generation.js";

function deferred(): { promise: Promise<void>; resolve: () => void; reject: (e: Error) => void } {
  let resolve!: () => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("whenBackgroundGenerationsSettle", () => {
  it("resolves at once when no background generation is open", async () => {
    const context = new ProcessingContext({ jobId: "j", userId: "1" });
    await expect(whenBackgroundGenerationsSettle(context)).resolves.toBeUndefined();
  });

  it("waits for every open background generation, failed ones included", async () => {
    const context = new ProcessingContext({ jobId: "j", userId: "1" });
    const first = deferred();
    const second = deferred();
    expect(startBackgroundGeneration(context, () => first.promise)).toBe(true);
    expect(startBackgroundGeneration(context, () => second.promise)).toBe(true);

    let settled = false;
    const waiting = whenBackgroundGenerationsSettle(context).then(() => {
      settled = true;
    });

    first.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(settled).toBe(false);

    second.reject(new Error("provider failed"));
    await waiting;
    expect(settled).toBe(true);
  });

  it("waits for a generation started after the wait began", async () => {
    const context = new ProcessingContext({ jobId: "j", userId: "1" });
    const first = deferred();
    const late = deferred();
    startBackgroundGeneration(context, () => first.promise);

    let settled = false;
    const waiting = whenBackgroundGenerationsSettle(context).then(() => {
      settled = true;
    });
    startBackgroundGeneration(context, () => late.promise);

    first.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(settled).toBe(false);

    late.resolve();
    await waiting;
    expect(settled).toBe(true);
  });
});
