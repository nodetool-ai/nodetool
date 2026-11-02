import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { test } from "node:test";

const source = fs.readFileSync(new URL("../../qml/color/ColorWheelMath.js", import.meta.url), "utf8").replace(/^\.pragma library\s*/, "");
const context = vm.createContext({});
vm.runInContext(`${source}\nglobalThis.math = {wheel, channels, clampToDisc, insertionIndex, identity, ringColor};`, context);
const { wheel, channels, clampToDisc, insertionIndex, identity, ringColor } = context.math;
const near = (a, b, tolerance = 1e-3) => assert.ok(Math.abs(a - b) <= tolerance, `${a} is not near ${b}`);

test("an untouched wheel is the identity for every field", () => {
  assert.deepEqual([...channels("lift", 0, 0, 0)], [0, 0, 0]);
  assert.deepEqual([...channels("gamma", 0, 0, 0)], [1, 1, 1]);
  assert.deepEqual([...channels("gain", 0, 0, 0)], [1, 1, 1]);
  for (const [kind, values] of [["lift", [0, 0, 0]], ["gamma", [1, 1, 1]], ["gain", [1, 1, 1]], ["gain", undefined]]) {
    const { x, y, lightness } = wheel(kind, values);
    assert.deepEqual([x, y, lightness], [0, 0, 0]);
  }
});

test("any channel values survive a round trip through the wheel", () => {
  for (const [kind, values] of [["lift", [0.05, -0.02, 0.08]], ["gamma", [1.3, 0.8, 1.8]], ["gain", [0.8, 1.2, 1.1]], ["lift", [-0.1, 0.08, 0.03]]]) {
    const { x, y, lightness } = wheel(kind, values);
    const back = channels(kind, x, y, lightness);
    values.forEach((value, c) => near(back[c], value));
  }
});

test("the puck pushes toward the hue drawn at that angle", () => {
  // Red is at 103 degrees, as a Rec. 709 vectorscope has it.
  const angle = 103 * Math.PI / 180;
  const [r, g, b] = channels("gain", Math.cos(angle), Math.sin(angle), 0);
  assert.ok(r > 1 && g < 1 && b < 1, `${r} ${g} ${b}`);
  const lifted = channels("lift", 0, 0, 1);
  assert.deepEqual([...lifted], [0.25, 0.25, 0.25]);
});

test("the puck stays on the disc", () => {
  const { x, y } = clampToDisc(3, 4);
  near(Math.hypot(x, y), 1);
  assert.deepEqual({ ...clampToDisc(0.2, 0.1) }, { x: 0.2, y: 0.1 });
});

test("a new effect takes the panel's place in the chain and changes nothing", () => {
  const chain = [{ type: "blur" }, { type: "curves" }, { type: "vignette" }];
  assert.equal(insertionIndex(chain, "liftGammaGain"), 1);
  assert.equal(insertionIndex(chain, "curves"), 2);
  assert.equal(insertionIndex(chain, "vignette"), 3);
  assert.equal(insertionIndex([], "curves"), 0);
  assert.equal(identity("vignette", "a").amount, 0);
  assert.deepEqual([...identity("liftGammaGain", "a").gamma], [1, 1, 1]);
  assert.equal(identity("blur", "a"), null);
});

test("the ring is drawn in plain hex, with each hue where the vectorscope has it", () => {
  // Qt's canvas draws an hsl() string it cannot parse as black.
  const rgb = deg => { const c = ringColor(deg); assert.match(c, /^#[0-9a-f]{6}$/); return [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)); };
  const [redR, redG, redB] = rgb(103);
  assert.ok(redR > 200 && redG < 60 && redB < 60, `${redR} ${redG} ${redB}`);
  const [greenR, greenG, greenB] = rgb(223);
  assert.ok(greenG > 200 && greenR < 60 && greenB < 60, `${greenR} ${greenG} ${greenB}`);
  const [blueR, blueG, blueB] = rgb(343);
  assert.ok(blueB > 200 && blueR < 60 && blueG < 60, `${blueR} ${blueG} ${blueB}`);
});
