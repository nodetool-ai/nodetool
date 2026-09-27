import { describe, expect, it } from "@jest/globals";
import { createTopDownRoomGame } from "@nodetool-ai/game-runtime";

import { gameInputFrame, pressGameKey } from "../gameInputFrame";

describe("editor game input", () => {
  it("matches the exported player for Space and custom letter actions", () => {
    const document = createTopDownRoomGame("input-game");
    document.inputActions = ["space", "e"];
    const keys = new Map<string, string>();
    const newlyPressed = new Set<string>();
    expect(pressGameKey(keys, newlyPressed, "Space", " ", document.inputActions)).toBe(true);
    expect(pressGameKey(keys, newlyPressed, "KeyE", "e", document.inputActions)).toBe(true);
    expect(gameInputFrame(keys, newlyPressed, document)).toEqual({ pressed: ["space", "e"], justPressed: ["space", "e"] });
    newlyPressed.clear();
    expect(gameInputFrame(keys, newlyPressed, document).justPressed).toEqual([]);
  });
});
