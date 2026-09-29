import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { createSandboxModuleCatalog, discoverSandboxPack } from "@nodetool-ai/node-sdk";
import { ProcessingContext } from "@nodetool-ai/runtime";
import { bakeGameCode, reproducibleGameBake } from "../src/game-code-bake.js";
import { runInSandbox } from "../src/js-sandbox.js";
import { createNative3DGame } from "@nodetool-ai/game-runtime";

const discovery = discoverSandboxPack(fileURLToPath(new URL("../../sandbox-packs/sandbox-game", import.meta.url)));
if (!discovery) { throw new Error("Game pack is missing"); }
const context = () => new ProcessingContext({ jobId: "game-bake", userId: "game-bake", sandboxModuleCatalog: createSandboxModuleCatalog([discovery]) });
const source = `const d = builder.game();
  builder.prefab("marker", builder.entity("template", 0, 0));
  for (const key of inputs.keys) builder.instance(d.scenes[0], key, "marker", {
    transform2d: {x: builder.parameter("x-" + key, {type:"number", default:2}), y:0, rotation:0, scaleX:1, scaleY:1}
  });
  return d;`;

describe("retained game construction", () => {
  it("retains prefab relationships and preserves keyed identities across insertion and reordering", async () => {
    const first = await reproducibleGameBake(context(), { source, inputs: { keys: ["left", "right"] }, seed: 7 });
    const next = await bakeGameCode(context(), { source, inputs: { keys: ["right", "new", "left"] }, seed: 7 });
    expect(first.ok, JSON.stringify(first)).toBe(true);
    expect(next.ok, JSON.stringify(next)).toBe(true);
    if (!first.ok || !next.ok) { return; }
    expect(first.instances).toEqual([{sceneId:"level",entityId:"left",prefabId:"marker"},{sceneId:"level",entityId:"right",prefabId:"marker"}]);
    expect(next.document.scenes[0].entities.filter((entity) => entity.id !== "new").sort((a,b) => a.id.localeCompare(b.id)))
      .toEqual(first.document.scenes[0].entities.sort((a,b) => a.id.localeCompare(b.id)));
  });

  it.each([
    ["network", 'fetch("https://example.com");'],
    ["workspace", 'workspace.read("secret.txt");'],
    ["tools", 'nodetool.games.create("spend", {});'],
    ["secrets", 'getSecret("OPENAI_API_KEY");'],
    ["clock", 'Date.now();'],
    ["random", 'Math.random();']
  ])("refuses %s during rebake", async (_name, forbidden) => {
    const result = await bakeGameCode(context(), { source: `${forbidden} return builder.game();`, inputs: {}, seed: 7 });
    expect(result.ok).toBe(false);
  });

  it("rejects duplicate keys and out-of-range parameter values", async () => {
    const duplicate = await bakeGameCode(context(), { source, inputs: { keys: ["same", "same"] }, seed: 7 });
    expect(duplicate.ok).toBe(false);
    const invalid = await bakeGameCode(context(), { source:'builder.parameter("speed",{type:"number",default:4,min:1,max:8}); return builder.game();', inputs: {speed:10}, seed:7 });
    expect(invalid.ok).toBe(false);
  });

  it("refuses closures from preparation and validates native references", async () => {
    const closure = await bakeGameCode(context(), { source:'return preparedDocument;', inputs:{}, seed:7 });
    expect(closure.ok).toBe(false);
    if (!closure.ok) { expect(closure.error).toContain("preparedDocument"); }
    const reference = await bakeGameCode(context(), { source:'const d = builder.game(); d.scenes[0].entities.push(builder.entity("follow",0,0,{behaviors:[{kind:"follow",targetId:"missing",speed:1}]})); return d;', inputs:{}, seed:7 });
    expect(reference.ok).toBe(false);
  });

  it("handles large keyed constructions without changing IDs", async () => {
    const keys = Array.from({length:4000}, (_, i) => `marker-${i}`);
    const result = await bakeGameCode(context(), { source, inputs: {keys}, seed:7 });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (result.ok) { expect(result.document.scenes[0].entities).toHaveLength(4000); }
  });

  it("retains enum and dimension parameter contracts and rejects non-JSON preparation values", async () => {
    const result = await bakeGameCode(context(), { source:`
      builder.parameter("mode",{type:"enum",default:"easy",values:["easy","hard"]});
      builder.parameter("position",{type:"vector3",default:[1,2,3]});
      return builder.game();`, inputs:{}, seed:7 });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (result.ok) { expect(result.parameters["position"]).toEqual({type:"vector3",default:[1,2,3]}); }
    const invalid = await bakeGameCode(context(), {source:"return builder.game();",inputs:{hidden:()=>4},seed:7});
    expect(invalid.ok).toBe(false);
  });

  it("inherits component fields when an instance overrides a single property", async () => {
    const result = await bakeGameCode(context(), {source:`
      const d=builder.game();
      builder.prefab("marker",builder.entity("definition",0,8,{transform2d:{scaleX:2,scaleY:3}}));
      builder.instance(d.scenes[0],"instance","marker",{transform2d:{x:4}});
      return d;`,inputs:{},seed:7});
    expect(result.ok,JSON.stringify(result)).toBe(true);
    if (result.ok && result.document.schemaVersion !== 3) {
      expect(result.document.scenes[0].entities[0].transform2d).toEqual({x:4,y:8,rotation:0,scaleX:2,scaleY:3});
    }
    const unsafe = await bakeGameCode(context(), {source:`
      const d=builder.game(); builder.prefab("marker",builder.entity("definition"));
      builder.instance(d.scenes[0],"instance","marker",JSON.parse('{"transform2d":{"__proto__":{"polluted":true}}}')); return d;`,inputs:{},seed:7});
    expect(unsafe.ok).toBe(false);
  });

  it("inherits nested 3D positions and scales with atomic rotation arrays", async () => {
    const result = await bakeGameCode(context(), {source:`
      const d=inputs.template;
      builder.prefab("marker",{id:"definition",transform3d:{position:{x:1,y:2,z:3},rotation:[0,0,0,1],scale:{x:2,y:3,z:4}},behaviors:[]});
      builder.instance(d.scenes[0],"instance","marker",{transform3d:{position:{x:7},rotation:[0,1,0,0]}});
      return d;`,inputs:{template:createNative3DGame("inheritance-3d")},seed:7});
    expect(result.ok,JSON.stringify(result)).toBe(true);
    if (result.ok && result.document.schemaVersion === 3) {
      expect(result.document.scenes[0].entities.find((entity)=>entity.id==="instance")?.transform3d)
        .toEqual({position:{x:7,y:2,z:3},rotation:[0,1,0,0],scale:{x:2,y:3,z:4}});
    }
  });

  it.each(["worker", "inproc"])("denies media host dispatch before storage and URL resolution on %s", async (mode) => {
    vi.stubEnv("NODETOOL_SANDBOX_INPROC", mode === "inproc" ? "1" : "0");
    vi.stubEnv("NODETOOL_SANDBOX_WORKER", mode === "worker" ? "require" : "");
    const writes = vi.fn();
    const reads = vi.fn();
    const promote = vi.fn();
    const resolve = vi.fn();
    const ctx = context();
    Object.defineProperty(ctx, "storage", {value:{store:writes,get:reads}});
    Object.defineProperty(ctx, "hasModelInterface", {value:()=>true});
    Object.defineProperty(ctx, "createAsset", {value:writes});
    const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network must not run"));
    try {
      for (const body of [
        'await media.toImage(new Uint8Array([1,2,3]));',
        'await media.bytes({type:"image",uri:"https://example.com/adversarial.png"});',
        'await image.bytes({type:"image",uri:"https://example.com/adversarial.png"});'
      ]) {
        const result = await runInSandbox({hermetic:true,context:ctx,resolveMediaRef:resolve,promoteMedia:promote,code:body});
        expect(result.success).toBe(false);
        expect(result.error).toContain("unavailable during hermetic construction");
      }
      expect(writes).not.toHaveBeenCalled();
      expect(reads).not.toHaveBeenCalled();
      expect(network).not.toHaveBeenCalled();
      expect(resolve).not.toHaveBeenCalled();
      expect(promote).not.toHaveBeenCalled();
    } finally { network.mockRestore(); vi.unstubAllEnvs(); }
  });
});
