import assert from "node:assert/strict";
import { test } from "node:test";
import { quantumTiming } from "./timing.mjs";

test("counts only complete quantum events and includes the first quantum", () => {
  const events = [100, 2, 3].map(dur => ({ name: "quantum", ph: "X", dur }));
  events.push({ name: "quantum", ph: "B" }, { name: "other", ph: "X", dur: 9000 });
  const result = quantumTiming(events, "quantum", 3);
  assert.equal(result.count, 3);
  assert.equal(result.meanUs, 35);
  assert.equal(result.worstUs, 100);
  assert.equal(result.p999Us, 100);
});

test("rejects absent, partial, negative and nonfinite measurements", () => {
  assert.throws(() => quantumTiming([], "quantum", 0));
  assert.throws(() => quantumTiming([], "quantum", 512));
  assert.throws(() => quantumTiming([{ name: "quantum", ph: "X", dur: 1 }], "quantum", 512));
  for (const dur of [undefined, -1, NaN, Infinity]) {
    assert.throws(() => quantumTiming([{ name: "quantum", ph: "X", dur }], "quantum", 1));
  }
});
