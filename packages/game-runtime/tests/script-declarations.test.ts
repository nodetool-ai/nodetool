import { describe, expect, it } from "vitest";
import { z } from "zod";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";
import { gameScriptSchemaDeclaration } from "../src/script-declarations.js";

describe("script schema recursive declarations", () => {
  it("preserves inline declaration output", () => {
    expect(gameScriptSchemaDeclaration("Command", z.strictObject({kind:z.literal("move"),x:z.number()})))
      .toBe('type Command = { kind: "move"; x: number };');
  });

  it("checks nested JSON values through finite local aliases", async () => {
    const declaration = gameScriptSchemaDeclaration("Command", z.strictObject({kind:z.literal("setProp"),value:z.json()}));
    expect(declaration).toContain("type CommandValue0 =");
    expect(declaration.length).toBeLessThan(1000);
    const directory = await mkdtemp(join(tmpdir(), "game-recursive-types-"));
    try {
      const file = join(directory,"fixture.ts");
      await writeFile(file,`${declaration}\nconst valid: Command = {kind:"setProp",value:{nested:[null,{value:1}]}};\nconst invalid: Command = {kind:"setProp",value:()=>1};`);
      const program = ts.createProgram([file],{noEmit:true,strict:true,skipLibCheck:true,target:ts.ScriptTarget.ES2020});
      const diagnostics = ts.getPreEmitDiagnostics(program).filter(diagnostic=>diagnostic.file?.fileName===file);
      expect(diagnostics).toHaveLength(1);
      expect(ts.flattenDiagnosticMessageText(diagnostics[0].messageText,"\n")).toContain("not assignable");
    } finally { await rm(directory,{recursive:true,force:true}); }
  });
});
