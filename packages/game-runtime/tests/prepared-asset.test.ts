import { describe, expect, it } from "vitest";
import { createTopDownRoomGame } from "../src/sample.js";
import { createScriptedGameSession } from "../src/session.js";
import { validateGame } from "../src/validate.js";

describe("prepared game assets", () => {
  it("keeps the authored anchor after alpha trim and custom pivot", async () => {
    const game = createTopDownRoomGame("trimmed-game");
    game.schemaVersion = 2;
    const binding = game.assets.player;
    if (!binding) throw new Error("Sample game has no player asset");
    binding.width = 1;
    binding.height = 1;
    binding.trim = { sourceWidth: 4, sourceHeight: 4, x: 2, y: 1 };
    binding.originalDimensions = { width: 4, height: 4 };
    binding.pivot = { x: 0.25, y: 0.75 };
    expect(validateGame(game).valid).toBe(true);
    const session = await createScriptedGameSession(game, 1);
    try {
      const sprite = session.frame().sprites.find((item) => item.entityId === "player");
      expect(sprite).toBeDefined();
      expect(sprite?.x).toBeCloseTo(0.3);
      expect(sprite?.y).toBeCloseTo(0.3);
      expect(sprite?.width).toBeCloseTo(0.2);
      expect(sprite?.height).toBeCloseTo(0.2);
      expect(sprite?.previousX).toBeCloseTo(sprite?.x ?? 0);
    } finally {
      session.dispose();
    }
  });

  it("preserves version one behavior and rejects new preparation metadata", () => {
    const game = createTopDownRoomGame("legacy-game");
    const binding = game.assets.player;
    if (!binding) throw new Error("Sample game has no player asset");
    binding.pivot = { x: 0.25, y: 0.75 };
    expect(validateGame(game).valid).toBe(true);
    binding.trim = { sourceWidth: 4, sourceHeight: 4, x: 2, y: 1 };
    binding.width = 1;
    binding.height = 1;
    expect(validateGame(game).errors.join(" ")).toContain("schema version 2");
  });
});
