import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";
import { GAME_SCRIPT_TYPES } from "../src/script-types.js";
import { gameScriptCommand } from "../src/scripts.js";

describe("game script editor types", () => {
  it("declares every runtime command kind", () => {
    const runtime = gameScriptCommand.options.map((option) => option.shape.kind.value).sort();
    const declared = [...GAME_SCRIPT_TYPES.matchAll(/kind: "([A-Za-z]+)"/g)].map((match) => match[1]).sort();
    expect(declared).toEqual(runtime);
  });

  it("rejects an unknown command kind in a checked function expression", async () => {
    const directory = await mkdtemp(join(tmpdir(), "game-script-types-"));
    try {
      const types = join(directory, "game.d.ts");
      const script = join(directory, "script.js");
      await writeFile(types, GAME_SCRIPT_TYPES);
      await writeFile(script, '/** @type {GameScript} */\n((input) => ({ state: input.state, commands: [{ kind: "notACommand" }] }))');
      const program = ts.createProgram([types, script], { allowJs: true, checkJs: true, noEmit: true, skipLibCheck: true, target: ts.ScriptTarget.ES2020 });
      expect(ts.getPreEmitDiagnostics(program).filter((diagnostic) => diagnostic.file?.fileName === script).length).toBeGreaterThan(0);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe("schema-derived 3D script declarations", () => {
  it("includes every 3D command kind and checks shape command fields", async () => {
    const { gameScriptCommand3D } = await import("@nodetool-ai/protocol");
    const { GAME_SCRIPT_TYPES_3D } = await import("../src/script-types3d.js");
    const runtime = gameScriptCommand3D.options.map((option) => option.shape.kind.value).sort();
    const declared = [...GAME_SCRIPT_TYPES_3D.matchAll(/kind: "([A-Za-z]+)"/g)].map((match) => match[1]).filter((kind) => !["box", "sphere", "capsule"].includes(kind)).sort();
    expect(declared).toEqual(runtime);
    const directory = await mkdtemp(join(tmpdir(), "game-script-types3d-"));
    try {
      const types = join(directory, "game.d.ts");
      const valid = join(directory, "valid.js");
      const invalid = join(directory, "invalid.js");
      await writeFile(types, GAME_SCRIPT_TYPES_3D);
      await writeFile(valid, '/** @type {GameScript3D} */\n((input) => ({state:input.state,commands:[{kind:"shapeQuery",queryId:"area",shape:{kind:"sphere",radius:1},position:{x:0,y:0,z:0}}]}))');
      await writeFile(invalid, '/** @type {GameScript3D} */\n((input) => ({state:input.state,commands:[{kind:"shapeQuery",queryId:"area",shape:{kind:"sphere",halfExtents:{x:1,y:1,z:1}},position:{x:0,y:0,z:0}}]}))');
      const program = ts.createProgram([types, valid, invalid], { allowJs: true, checkJs: true, noEmit: true, skipLibCheck: true, target: ts.ScriptTarget.ES2020 });
      const diagnostics = ts.getPreEmitDiagnostics(program);
      expect(diagnostics.filter((diagnostic) => diagnostic.file?.fileName === valid)).toEqual([]);
      expect(diagnostics.some((diagnostic) => diagnostic.file?.fileName === invalid)).toBe(true);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});

it("requires setProp values in both dimension editor contracts", async () => {
  const {GAME_SCRIPT_TYPES_3D} = await import("../src/script-types3d.js");
  const directory = await mkdtemp(join(tmpdir(),"game-property-editor-types-"));
  try {
    for (const [index,types,contract] of [[0,GAME_SCRIPT_TYPES,"GameScript"],[1,GAME_SCRIPT_TYPES_3D,"GameScript3D"]] as const) {
      const declaration = join(directory,`types${index}.d.ts`);
      const valid = join(directory,`valid${index}.js`);
      const invalid = join(directory,`invalid${index}.js`);
      await writeFile(declaration,types);
      await writeFile(valid,`/** @type {${contract}} */\n(input)=>({state:input.state,commands:[{kind:"setProp",key:"a",value:{nested:[null,1]}}]})`);
      await writeFile(invalid,`/** @type {${contract}} */\n(input)=>({state:input.state,commands:[{kind:"setProp",key:"a"}]})`);
      const program = ts.createProgram([declaration,valid,invalid],{allowJs:true,checkJs:true,noEmit:true,skipLibCheck:true,target:ts.ScriptTarget.ES2020});
      const diagnostics = ts.getPreEmitDiagnostics(program);
      expect(diagnostics.filter(diagnostic=>diagnostic.file?.fileName===valid)).toEqual([]);
      expect(diagnostics.some(diagnostic=>diagnostic.file?.fileName===invalid)).toBe(true);
    }
  } finally { await rm(directory,{recursive:true,force:true}); }
});
