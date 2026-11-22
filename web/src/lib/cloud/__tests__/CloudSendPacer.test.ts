/**
 * When the cloud window sends a document's waiting changes: once stored and
 * online, one save at a time, backing off while saves leave edits unsent,
 * and at once after the computer comes back online.
 */
import { describe, expect, it } from "@jest/globals";

import { CloudSendPacer, SEND_DELAY_MS, SEND_MAX_DELAY_MS } from "../CloudSendPacer";

describe("CloudSendPacer", () => {
  it("is due only for stored edits while online and no save runs", () => {
    const pacer = new CloudSendPacer();
    expect(pacer.due(0, false, true)).toBe(false);
    expect(pacer.due(0, true, false)).toBe(false);
    expect(pacer.due(0, true, true)).toBe(true);
    pacer.started();
    expect(pacer.due(0, true, true)).toBe(false);
  });

  it("waits twice as long after each save that left edits unsent, up to the maximum", () => {
    const pacer = new CloudSendPacer();
    let now = 0;
    const waits: number[] = [];
    for (let i = 0; i < 7; i += 1) {
      pacer.started();
      pacer.finished(now, true);
      const from = now;
      while (!pacer.due(now, true, true)) {
        now += 1_000;
      }
      waits.push(now - from);
    }
    expect(waits).toEqual([2_000, 4_000, 8_000, 16_000, 32_000, 60_000, 60_000]);
    expect(SEND_MAX_DELAY_MS).toBe(60_000);
  });

  it("goes back to the short delay after a save that sent everything", () => {
    const pacer = new CloudSendPacer();
    pacer.started();
    pacer.finished(0, true);
    pacer.started();
    pacer.finished(2_000, true);
    pacer.started();
    pacer.finished(10_000, false);
    pacer.started();
    pacer.finished(20_000, true);
    expect(pacer.due(20_000 + SEND_DELAY_MS - 1, true, true)).toBe(false);
    expect(pacer.due(20_000 + SEND_DELAY_MS, true, true)).toBe(true);
  });

  it("is due at once after the computer comes back online", () => {
    const pacer = new CloudSendPacer();
    for (let i = 0; i < 4; i += 1) {
      pacer.started();
      pacer.finished(0, true);
    }
    expect(pacer.due(1_000, true, true)).toBe(false);
    pacer.reconnected();
    expect(pacer.due(1_000, true, true)).toBe(true);
  });
});
