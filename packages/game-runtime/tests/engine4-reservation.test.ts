import { describe, expect, it } from "vitest";
import { gameDocument } from "@nodetool-ai/protocol";
import { createScriptedGameSession, createTopDownRoomGame, validateGame } from "../src/index.js";
import { openGameSession } from "../src/open-session.js";
import { validateAnyGame } from "../src/validate3d.js";

function room(schemaVersion: 1 | 2 | 4 | 5, engineVersion: "1" | "3" | "4", tagged = false) {
  const base = createTopDownRoomGame("engine-versions");
  return gameDocument.parse({ ...base, schemaVersion, engineVersion,
    scenes: base.scenes.map((scene) => ({ ...scene, entities: scene.entities.map((entity, index) =>
      tagged && index === 0 ? { ...entity, tags: ["first"], props: { hp: 3 } } : entity) })) });
}

const unavailable = "engine version 4 (Rapier 2D physics) is not available in this runtime";

describe("2D engine 4 reservation", () => {
  it("requires schema 5 and engine 4 to appear together", () => {
    expect(validateGame(room(5, "3")).errors).toContain("engineVersion: schema version 5 requires engine version 4");
    expect(validateGame(room(4, "4")).errors).toContain("engineVersion: schema version 4 requires engine version 3");
    expect(validateGame(room(2, "4")).errors).toContain("engineVersion: schema version 2 requires engine version 1");
  });

  it("refuses to validate or simulate engine 4 until its physics exists", async () => {
    const document = room(5, "4", true);
    const result = validateGame(document);
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual([{ path: ["engineVersion"], message: unavailable }]);
    expect(validateAnyGame(document)).toEqual({ valid: false,
      diagnostics: [{ code: "engine_unavailable", path: ["engineVersion"], message: unavailable }] });
    await expect(openGameSession(document, { seed: 1 })).resolves.toEqual({ ok: false,
      diagnostics: [{ code: "engine_unavailable", path: ["engineVersion"], message: unavailable }] });
    await expect(createScriptedGameSession(document, 1)).rejects.toThrow(unavailable);
  });

  it("keeps schemas 1, 2 and 4 opening on their engines", async () => {
    for (const document of [room(1, "1"), room(2, "1"), room(4, "3", true)]) {
      expect(validateGame(document).errors).toEqual([]);
      const opened = await openGameSession(document, { seed: 1 });
      if (!opened.ok) { throw new Error(JSON.stringify(opened.diagnostics)); }
      try {
        expect(opened.opened.dimension).toBe("2d");
        if (opened.opened.dimension === "2d") {
          expect(opened.opened.session.snapshot().engineVersion).toBe(document.engineVersion);
        }
      } finally { opened.opened.session.dispose(); }
    }
  });
});
