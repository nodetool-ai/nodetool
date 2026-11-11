import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { test } from "node:test";

test("track parameter previews reach the model before release", () => {
  const source = fs.readFileSync(new URL("../../../qml/wiring/w/EffectCard.qml", import.meta.url), "utf8").replaceAll("\r\n", "\n");
  const method = source.match(/    function preview\(patch\) \{(?:[^\n]*\}|\n[\s\S]*?\n    \})/);
  assert.ok(method, "Effect card preview entry point exists");
  const previews = [], starts = [];
  const context = vm.createContext({
    draft: {},
    payload: patch => ({trackId: "video", effectId: "vignette", patch}),
    edits: {
      beginGesture: (action, payload) => starts.push({action, payload}),
      preview: payload => previews.push(JSON.parse(JSON.stringify(payload)))
    }
  });
  vm.runInContext(method[0], context);
  vm.runInContext("preview({intensity: 0.6}); preview({radius: 1.2});", context);
  assert.equal(starts.length, 1);
  assert.deepEqual(previews, [
    {trackId: "video", effectId: "vignette", patch: {intensity: 0.6}},
    {trackId: "video", effectId: "vignette", patch: {intensity: 0.6, radius: 1.2}}
  ]);
});
