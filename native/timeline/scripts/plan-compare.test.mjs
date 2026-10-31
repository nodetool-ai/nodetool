// node --test native/timeline/scripts/plan-compare.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

import { diffNumber, exclusionsFrom, near, orZero } from "./plan-compare.mjs";

// Codex review F7 (M5b): a null or a non-number never counts as a match.
test("near needs two finite numbers", () => {
  assert.equal(near(0.5, 0.5 + 1e-7), true);
  assert.equal(near(null, 0), false);
  assert.equal(near(0, null), false);
  assert.equal(near(undefined, undefined), false);
  assert.equal(near(Number.NaN, Number.NaN), false);
  assert.equal(near("0", 0), false);
});

test("an optional number: absent is 0, null and garbage fail", () => {
  assert.equal(diffNumber("x", orZero(undefined), orZero(0)), null);
  assert.notEqual(diffNumber("x", orZero(null), orZero(0)), null);
  assert.notEqual(diffNumber("x", orZero("1"), orZero(1)), null);
  assert.notEqual(diffNumber("x", orZero(Number.NaN), orZero(0)), null);
  assert.equal(diffNumber("x", undefined, undefined), null);
  assert.notEqual(diffNumber("x", 1, undefined), null);
});

// Codex review F6 (M5b): exclusions come from validated reasons, and both
// native lists must name the same clips.
test("exclusions are the clips with a validated reason", () => {
  const ok = exclusionsFrom({ planUnsupported: ["a"], planUnsupportedFields: { a: ["flexLayout"] } });
  assert.deepEqual([...ok.excluded], ["a"]);
  assert.deepEqual(ok.errors, []);
  // A clip in planUnsupported with no reason is not excluded, and is reported.
  const extra = exclusionsFrom({ planUnsupported: ["a", "b"], planUnsupportedFields: { a: ["flexLayout"] } });
  assert.deepEqual([...extra.excluded], ["a"]);
  assert.ok(extra.errors.some((e) => e.includes("b")));
  // An empty or malformed reason is an error and excludes nothing.
  const empty = exclusionsFrom({ planUnsupported: ["c"], planUnsupportedFields: { c: [] } });
  assert.deepEqual([...empty.excluded], []);
  assert.ok(empty.errors.length > 0);
  const garbage = exclusionsFrom({ planUnsupported: ["d"], planUnsupportedFields: { d: [""] } });
  assert.deepEqual([...garbage.excluded], []);
  const missing = exclusionsFrom({ planUnsupported: [], planUnsupportedFields: { e: ["flexLayout"] } });
  assert.ok(missing.errors.some((m) => m.includes("e")));
});

import { auditExclusions, checkFlexReasons } from "./plan-compare.mjs";

test("checkFlexReasons fails on any flex exclusion", () => {
  assert.deepEqual(checkFlexReasons({ a: ["animationLinks"] }), []);
  assert.equal(checkFlexReasons({ t: ["flexLayout"] }).length, 1);
  assert.equal(checkFlexReasons({ t: ["flexAnimatedText", "parent.g"] }).length, 1);
});

// Codex review F5 (flex): every excluded id is audited, a group by its
// descendants' layers, and an id with no evidence is reported, not skipped.
test("the exclusion audit covers every id, with its descendants", () => {
  const clips = [{ id: "g" }, { id: "c", parentId: "g" }, { id: "d", parentId: "c" }, { id: "x" }, { id: "y" }, { id: "z" }];
  const tally = new Map([["d", { compared: 3, mismatched: 0 }], ["y", { compared: 2, mismatched: 1 }], ["z", { compared: 4, mismatched: 0 }]]);
  const fields = { g: ["animationLinks"], c: ["parent.g"], d: ["parent.g"], x: ["timeRemap"], y: ["timeRemap"], z: ["animations.stagger.unit=line"] };
  const audit = auditExclusions(clips, Object.keys(fields), tally, fields, (r) => r !== "animations.stagger.unit=line");
  // g, c and d match through d's layers; x drew nothing; y mismatches; z is waived.
  assert.deepEqual(audit.stale.map((s) => s.split(" ")[2]).sort(), ["c", "d", "g"]);
  assert.deepEqual(audit.uncovered, ["x"]);
  assert.equal(audit.audited, 5);
});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { newestBinary, staleSources } from "./plan-compare.mjs";

// The trap the flex review hit: the default `build/` binary was older than
// the sources and gave 166 mismatches.
test("the default binary is the newest build, and a stale one is named", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "plan-bin-"));
  try {
    const touch = (rel, sec) => {
      const p = path.join(root, rel);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, "x");
      fs.utimesSync(p, sec, sec);
      return p;
    };
    touch("build/nodetool-timeline", 1000);
    const m5 = touch("build-m5/nodetool-timeline", 3000);
    touch("build-old/other", 5000);
    assert.equal(newestBinary(root), m5);
    touch("src/scene/FlexLayout.cpp", 2000);
    assert.deepEqual(staleSources(root, m5), []);
    touch("src/preview/SceneEval.cpp", 4000);
    assert.deepEqual(staleSources(root, m5).map((p) => path.relative(root, p)), ["src/preview/SceneEval.cpp"]);
    assert.equal(newestBinary(path.join(root, "nothing")), null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
