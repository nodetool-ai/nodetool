import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { GAME_SCRIPT_TYPES, GAME_SCRIPT_WORLD_TYPES } from "../src/script-types.js";
import { GAME_SCRIPT_TYPES_3D, GAME_SCRIPT_WORLD_TYPES_3D } from "../src/script-types3d.js";

describe("additive game world declarations", () => {
  it.each([
    ["2d", GAME_SCRIPT_TYPES + GAME_SCRIPT_WORLD_TYPES, "entity.velocityX + entity.velocityY"],
    ["3d", GAME_SCRIPT_TYPES_3D + GAME_SCRIPT_WORLD_TYPES_3D, "entity.position.x + entity.velocity.z"]
  ])("checks %s world queries without changing legacy inputs", async (_dimension, declarations, coordinate) => {
    const directory = await mkdtemp(join(tmpdir(), "game-world-types-"));
    try {
      const types = join(directory, "game.d.ts");
      const valid = join(directory, "valid.ts");
      const invalid = join(directory, "invalid.ts");
      await writeFile(types, declarations);
      await writeFile(valid, `
        const ids: string[] = world.query({ source: "enemy", tag: "target", near: { x: 0, y: 0 }, radius: 3, limit: 8 });
        const entity = world.get(ids[0]);
        if (entity) {
          const speed: number = ${coordinate};
          const grounded: boolean = entity.grounded;
        }
        world.query();
      `);
      await writeFile(invalid, `
        world.query({ radius: "far" });
        world.get(42);
        world.get("missing").grounded;
        const records: { id: string }[] = world.query();
      `);
      const program = ts.createProgram([types, valid, invalid], {
        strict: true, noEmit: true, skipLibCheck: true, target: ts.ScriptTarget.ES2020
      });
      const diagnostics = ts.getPreEmitDiagnostics(program);
      expect(diagnostics.filter((diagnostic) => diagnostic.file?.fileName === valid)).toEqual([]);
      expect(diagnostics.filter((diagnostic) => diagnostic.file?.fileName === invalid)).toHaveLength(4);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
