/**
 * Before the cloud window closes, every open document's flush runs, and the
 * close waits for all of them, also when one fails.
 */
import { describe, expect, it } from "@jest/globals";

import { flushCloudWindow, registerCloudWindowFlush } from "../cloudWindowClosing";

describe("flushCloudWindow", () => {
  it("runs every registered flush and settles after all of them", async () => {
    const done: string[] = [];
    let release: () => void = () => undefined;
    const slow = new Promise<void>((resolve) => {
      release = resolve;
    });
    const removeA = registerCloudWindowFlush(async () => {
      await slow;
      done.push("a");
    });
    const removeB = registerCloudWindowFlush(async () => {
      throw new Error("the local server did not answer");
    });
    const removed = registerCloudWindowFlush(async () => {
      done.push("closed");
    });
    removed();

    let settled = false;
    const flushing = flushCloudWindow().then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    release();
    await flushing;
    expect(done).toEqual(["a"]);
    removeA();
    removeB();
  });
});
