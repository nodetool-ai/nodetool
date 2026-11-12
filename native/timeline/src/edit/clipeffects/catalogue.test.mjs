import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";

test("vignette radius uses the renderer default and the track control range", () => {
  const source = fs.readFileSync(new URL("./ClipEffectsCatalog.js", import.meta.url), "utf8").replace(/^\.pragma library\s*/, "");
  const context = vm.createContext({});
  vm.runInContext(source + "\nglobalThis.fields = fields;", context);
  const reference = JSON.parse(fs.readFileSync(new URL("../../wiring/w/TrackEffectsReference.json", import.meta.url), "utf8"));
  const radius = context.fields("vignette").find(field => field.key === "radius");
  assert.ok(radius, "Clip vignette needs a radius control");
  const trackRadius = reference.knobs.vignette.find(field => field.key === "radius");
  assert.equal(radius.min, trackRadius.min);
  assert.equal(radius.max, trackRadius.max);
  assert.equal(radius.step, trackRadius.step);
  assert.equal(radius.fallback, 0.9);
  assert.equal(radius.resetValue, 0.9);
  assert.equal(radius.unit, undefined, "Radius is normalized, not pixels");
});

test("every clip effect slider resets to an explicit in-range default", () => {
  const source = fs.readFileSync(new URL("./ClipEffectsCatalog.js", import.meta.url), "utf8").replace(/^\.pragma library\s*/, "");
  const context = vm.createContext({});
  vm.runInContext(source + "\nglobalThis.catalogue = {fields, effectLabels};", context);
  let checked = 0;
  for (const {value: type} of context.catalogue.effectLabels) {
    for (const field of context.catalogue.fields(type).filter(field => field.kind === "slider")) {
      assert.ok(Number.isFinite(field.resetValue), `${type}.${field.key} has a reset value`);
      assert.ok(field.resetValue >= field.min && field.resetValue <= field.max, `${type}.${field.key} resets within its range`);
      checked++;
    }
  }
  assert.ok(checked > 0);
  assert.equal(context.catalogue.fields("vignette").find(field => field.key === "amount").resetValue, 0);
  assert.equal(context.catalogue.fields("blur")[0].resetValue, 0);
  assert.equal(context.catalogue.fields("levels").find(field => field.key === "inWhite").resetValue, 1);
  const roundness = context.catalogue.fields("vignette").find(field => field.key === "roundness");
  assert.deepEqual([roundness.min, roundness.max, roundness.resetValue], [-1, 1, 0]);
  const blacks = context.catalogue.fields("exposure").find(field => field.key === "blacks");
  assert.deepEqual([blacks.min, blacks.max, blacks.resetValue], [-1, 1, 0]);
});

test("imported Color instances expose editable fields with neutral defaults", () => {
  const source = fs.readFileSync(new URL("./ClipEffectsCatalog.js", import.meta.url), "utf8").replace(/^\.pragma library\s*/, "");
  const context = vm.createContext({});
  vm.runInContext(source + "\nglobalThis.fields = fields;", context);
  const fields = context.fields("color");
  assert.equal(fields.length, 8);
  assert.ok(fields.every(field => field.kind === "slider" && Number.isFinite(field.fallback)));
  assert.equal(fields.find(field => field.key === "brightness").fallback, 0);
  assert.equal(fields.find(field => field.key === "contrast").fallback, 1);
});

test("imported effects have parameter fields or a specific read-only explanation", () => {
  const source = fs.readFileSync(new URL("./ClipEffectsCatalog.js", import.meta.url), "utf8").replace(/^\.pragma library\s*/, "");
  const context = vm.createContext({});
  vm.runInContext(source + "\nglobalThis.catalogue = {fields, readOnlyDescription};", context);
  for (const type of ["pixelate", "posterize", "directionalBlur", "lensDistortion"]) {
    assert.ok(context.catalogue.fields(type).length > 0, type);
  }
  for (const type of ["stylize", "generator", "lut"]) {
    const message = context.catalogue.readOnlyDescription(type);
    assert.ok(message.length > 0, type);
    assert.ok(!message.includes("Color section"));
  }
});

test("effects shared with the web retain the same creation defaults", () => {
  const native = fs.readFileSync(new URL("./ClipEffectsCatalog.js",import.meta.url),"utf8").replace(/^\.pragma library\s*/,"");
  const context = vm.createContext({});
  vm.runInContext(native+"\nglobalThis.catalogue = {makeEffect, addableEffects, effectLabels};",context);
  const web = fs.readFileSync(new URL("../../../../../web/src/components/timeline/Inspector/ClipEffectsList.tsx",import.meta.url),"utf8");
  const functionSource = web.slice(web.indexOf("function makeEffect("),web.indexOf("const SCRUB_PX"));
  const defaults = [...web.matchAll(/^const DEFAULT_\w+ = [^;]+;/gm)].map(match => match[0]).join("\n");
  const oracle = vm.createContext({crypto});
  vm.runInContext(ts.transpileModule(defaults+"\n"+functionSource,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,oracle);
  const types = ["blur","glow","dropShadow","vignette","sharpen","chromaKey","curves","levels","liftGammaGain","grain"];
  assert.deepEqual(JSON.parse(JSON.stringify(context.catalogue.effectLabels)).map(item => item.value),
    ["denoise", "stabilize", "deflicker", "deband", "secondaryColor", "exposure", "hueSatCurves", ...types, "pixelate", "posterize", "directionalBlur", "lensDistortion"]);
  // The Color panel creates these grades, so the add list leaves them out and keeps the rest.
  const grades = ["curves", "liftGammaGain", "vignette", "hueSatCurves"];
  assert.deepEqual(JSON.parse(JSON.stringify(context.catalogue.addableEffects)).map(item => item.value),
    JSON.parse(JSON.stringify(context.catalogue.effectLabels)).map(item => item.value).filter(type => !grades.includes(type)));
  for (const type of types) {
    const actual = JSON.parse(JSON.stringify(context.catalogue.makeEffect(type,"native-id")));
    const expected = JSON.parse(JSON.stringify(oracle.makeEffect(type)));
    assert.equal(actual.id,"native-id"); delete actual.id; delete expected.id;
    assert.deepEqual(actual,expected,type);
  }
});

test("reordering a large chain preserves the Color slot and opaque fields", () => {
  const source = fs.readFileSync(new URL("./ClipEffectsEdits.qml",import.meta.url),"utf8");
  const methods = ["processingStage","move","drop"].map(name => {
    const match = source.match(new RegExp(`    function ${name}\\([^]*?\\n    }`));
    assert.ok(match,`Missing ${name} method`);
    return match[0];
  }).join("\n");
  const count = 20000;
  const chain = Array.from({length:count},(_,i) => ({id:`e${i}`,type:"future",enabled:true,opaque:{value:i}}));
  chain[count/2] = {id:"inspector:color",type:"color",enabled:true,hue:12};
  let reads = 0, result;
  const effects = new Proxy(chain,{get(target,key) { if (/^\d+$/.test(String(key))) ++reads; return Reflect.get(target,key); }});
  const context = vm.createContext({effects,write:next => { result = next; }});
  vm.runInContext(methods,context);
  context.move("e0",1);
  assert.equal(result[0].id,"e1"); assert.equal(result[1].id,"e0");
  assert.equal(result[count/2],chain[count/2]); assert.equal(result[count-1],chain[count-1]);
  reads = 0;
  context.drop("e0",`e${count-1}`);
  assert.equal(result[0].id,"e1"); assert.equal(result[count-1].id,"e0");
  assert.equal(result[count/2],chain[count/2]); assert.equal(result[count-2].opaque.value,count-1);
  assert.ok(reads < count*10,`Unexpected repeated chain scans: ${reads}`);
  result = undefined; context.drop("missing","e1"); assert.equal(result,undefined);
});
