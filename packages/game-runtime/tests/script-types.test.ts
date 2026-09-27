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
