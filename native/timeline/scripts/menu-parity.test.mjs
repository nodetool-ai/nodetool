// node --test native/timeline/scripts/menu-parity.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

import { compareMenus, flattenMenus, formatReport, parseReference } from "./menu-parity.mjs";

const ours = flattenMenus([
  { label: "Edit", items: [{ label: "Undo", action: "undo" }, { label: "Paste Attributes…", action: "pasteAttributes" }] },
  { label: "Clip", items: [{ label: "Video Options", items: [{ label: "Fit to Frame", action: "fitToFrame" }] }] },
  { label: "View", items: [{ label: "Zoom In", action: "zoomIn" }, { label: "Only Ours", action: "ours" }] },
]);

test("the reference reads paths and our own name for an item", () => {
  assert.deepEqual(parseReference("# note\n\nEdit > Undo\nClip > Video Options > Scale = Fit\n"), [
    { path: ["Edit", "Undo"], ours: "Undo" },
    { path: ["Clip", "Video Options", "Scale"], ours: "Fit" },
  ]);
  assert.throws(() => parseReference("Undo"), /needs its menu/);
});

test("items count as the same place, elsewhere or missing", () => {
  const report = compareMenus(parseReference(`
Edit > Undo
Edit > Paste Attributes
Clip > Video Options > Scale to Frame Size = Fit to Frame
Sequence > Zoom In
File > Save
`), ours);
  assert.deepEqual(report.samePlace.map((item) => item.name), [
    "Edit > Undo", "Edit > Paste Attributes", "Clip > Video Options > Scale to Frame Size"]);
  assert.deepEqual(report.elsewhere, [{ name: "Sequence > Zoom In", ours: "View > Zoom In" }]);
  assert.deepEqual(report.missing, [{ name: "File > Save" }]);
  assert.deepEqual(report.extra, ["View > Only Ours"]);
});

test("the report makes the gaps visible", () => {
  const text = formatReport(compareMenus(parseReference("File > Save\n"), ours));
  assert.match(text, /1 reference items: 0 in the same place, 0 elsewhere, 1 missing/);
  assert.match(text, /## Missing\n\n- File > Save/);
});
