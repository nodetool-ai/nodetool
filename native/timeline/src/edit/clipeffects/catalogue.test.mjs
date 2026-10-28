import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";

test("the add catalogue writes exactly the web makeEffect defaults", () => {
  const native = fs.readFileSync(new URL("./ClipEffectsCatalog.js",import.meta.url),"utf8").replace(/^\.pragma library\s*/,"");
  const context = vm.createContext({});
  vm.runInContext(native+"\nglobalThis.catalogue = {makeEffect, addableEffects};",context);
  const web = fs.readFileSync(new URL("../../../../../web/src/components/timeline/Inspector/ClipEffectsList.tsx",import.meta.url),"utf8");
  const functionSource = web.slice(web.indexOf("function makeEffect("),web.indexOf("const SCRUB_PX"));
  const defaults = [...web.matchAll(/^const DEFAULT_\w+ = [^;]+;/gm)].map(match => match[0]).join("\n");
  const oracle = vm.createContext({crypto});
  vm.runInContext(ts.transpileModule(defaults+"\n"+functionSource,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,oracle);
  const types = ["blur","glow","dropShadow","vignette","sharpen","chromaKey","curves","levels","liftGammaGain","grain"];
  assert.deepEqual(JSON.parse(JSON.stringify(context.catalogue.addableEffects)).map(item => item.value),types);
  for (const type of types) {
    const actual = JSON.parse(JSON.stringify(context.catalogue.makeEffect(type,"native-id")));
    const expected = JSON.parse(JSON.stringify(oracle.makeEffect(type)));
    assert.equal(actual.id,"native-id"); delete actual.id; delete expected.id;
    assert.deepEqual(actual,expected,type);
  }
});

test("reordering a large chain preserves the Color slot and opaque fields", () => {
  const source = fs.readFileSync(new URL("./ClipEffectsEdits.qml",import.meta.url),"utf8");
  const methods = ["move","drop"].map(name => {
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
