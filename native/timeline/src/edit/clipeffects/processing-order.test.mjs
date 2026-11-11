import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";

function editor() {
  const source = fs.readFileSync(new URL("ClipEffectsEdits.qml", import.meta.url), "utf8").replaceAll("\r\n", "\n");
  const state = vm.createContext({effects: [
    {id: "blur", type: "blur", radius: 8}, {id: "a", type: "vignette"},
    {id: "color", type: "color", brightness: 0.2}, {id: "b", type: "glow"},
    {id: "inspector:color", type: "color", contrast: 1.2}
  ]});
  state.write = effects => { state.effects = JSON.parse(JSON.stringify(effects)); };
  for (const name of ["processingStage", "orderedEffects", "move", "drop"]) {
    const method = source.match(new RegExp(`    function ${name}\\([^\\n]*\\) \\{(?:[^\\n]*\\}|\\n[\\s\\S]*?\\n    \\})`));
    assert.ok(method, `${name} exists`);
    vm.runInContext(method[0], state);
  }
  return state;
}

test("fixed color and blur stages follow the ordered clip effects", () => {
  const state = editor();
  const ids = JSON.parse(vm.runInContext("JSON.stringify(orderedEffects().map(effect => effect.id))", state));
  assert.deepEqual(ids, ["a", "b", "color", "inspector:color", "blur"]);
  assert.equal(state.effects[0].id, "blur", "Displaying stages does not rewrite the document");
});

test("source stabilization precedes ordered effects and cannot be dragged between them", () => {
  const state=editor(); state.effects.push({id:"stabilize",type:"stabilize"});
  assert.equal(vm.runInContext("orderedEffects()[0].id",state),"stabilize");
  const before=JSON.stringify(state.effects);
  vm.runInContext("move('stabilize',1); drop('stabilize','a'); drop('a','stabilize')",state);
  assert.equal(JSON.stringify(state.effects),before);
});

test("keyboard reorder skips fixed stages and retains their authored values", () => {
  const state = editor();
  vm.runInContext("move('a', 1)", state);
  assert.deepEqual(state.effects.map(effect => effect.id), ["blur", "b", "color", "a", "inspector:color"]);
  assert.equal(state.effects[0].radius, 8);
  assert.equal(state.effects[2].brightness, 0.2);
  const before = JSON.stringify(state.effects);
  vm.runInContext("move('blur', 1); move('color', -1)", state);
  assert.equal(JSON.stringify(state.effects), before);
});

test("drag reorder cannot move an effect into a fixed processing stage", () => {
  const state = editor();
  const before = JSON.stringify(state.effects);
  vm.runInContext("drop('a', 'blur'); drop('color', 'b')", state);
  assert.equal(JSON.stringify(state.effects), before);
  vm.runInContext("drop('a', 'b')", state);
  assert.deepEqual(state.effects.map(effect => effect.id), ["blur", "b", "color", "a", "inspector:color"]);
});

test("video track stages retain duplicate precedence while audio remains authored order", () => {
  const source = fs.readFileSync(new URL("../../../qml/wiring/w/TrackEffectsPanel.qml", import.meta.url), "utf8").replaceAll("\r\n", "\n");
  const method = source.match(/    function orderedEffects\(\) \{\n[\s\S]*?\n    \}/);
  assert.ok(method);
  const effects = [
    {id: "v1", type: "vignette"}, {id: "blur", type: "videoBlur"}, {id: "v2", type: "vignette"},
    {id: "key", type: "chromaKey"}, {id: "color", type: "colorCorrection"}, {id: "sharp", type: "sharpen"}
  ];
  const state = vm.createContext({isVideo: true, track: {effects}});
  vm.runInContext(method[0], state);
  assert.deepEqual(JSON.parse(vm.runInContext("JSON.stringify(orderedEffects().map(effect => effect.id))", state)),
    ["key", "color", "blur", "sharp", "v1", "v2"]);
  state.isVideo = false;
  assert.equal(vm.runInContext("orderedEffects()", state), effects);
});
