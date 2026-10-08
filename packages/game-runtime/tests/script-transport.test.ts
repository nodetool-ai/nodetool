import { expect, it } from "vitest";
import { newQuickJSWASMModuleFromVariant } from "quickjs-emscripten-core";
import variant from "@jitl/quickjs-ng-wasmfile-release-sync";
import { gameScriptValue, scriptHandleResult } from "../src/script-transport.js";

it("transfers mutable own JSON properties without changing their prototype", async () => {
  const module = await newQuickJSWASMModuleFromVariant(variant);
  const context = module.newContext();
  const defineData = scriptHandleResult(context, context.evalCode(`(object, key, value) => {
    Object.defineProperty(object, key, { value, writable: true, configurable: true, enumerable: true });
  }`));
  const value = JSON.parse('{"__proto__":{"marker":7},"nested":[{"x":1}],"unicode":"🔥"}');
  const handle = gameScriptValue(context, value, defineData, true);
  try {
    context.setProp(context.global, "input", handle);
    const result = scriptHandleResult(context, context.evalCode(`JSON.stringify({
      own: Object.hasOwn(input, "__proto__"), ordinary: Object.getPrototypeOf(input) === Object.prototype,
      writable: Object.getOwnPropertyDescriptor(input, "__proto__").writable,
      marker: input.marker ?? null,
      changed: (input.nested[0].x = 99),
      added: input.nested.push({x: 2}), unicode: input.unicode
    })`));
    try {
      expect(JSON.parse(context.getString(result))).toEqual({ own: true, ordinary: true, writable: true, marker: null, changed: 99, added: 2, unicode: "🔥" });
    } finally { result.dispose(); }
  } finally { handle.dispose(); defineData.dispose(); context.dispose(); }
});
