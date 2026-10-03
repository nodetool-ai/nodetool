import { describe, expect, it } from "@jest/globals";
import type { GameEntity } from "@nodetool-ai/protocol/game.js";

import { pastedEntities } from "../gameClipboard";

const entity = (id: string, parentId?: string): GameEntity => ({
  id, name: id, templateOnly: false, behaviors: [], parentId,
  transform2d: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }
} as GameEntity);

describe("pastedEntities", () => {
  it("keeps a pasted child under its pasted parent", () => {
    let next = 0;
    const [parent, child] = pastedEntities([entity("parent"), entity("child", "parent")], ["parent", "child"], () => `copy${++next}`);
    expect(child.parentId).toBe(parent.id);
    expect(parent.parentId).toBeUndefined();
  });

  it("keeps an existing parent in the target scene and drops a missing one", () => {
    let next = 0;
    const [kept, dropped] = pastedEntities([entity("a", "root"), entity("b", "elsewhere")], ["root"], () => `copy${++next}`);
    expect(kept.parentId).toBe("root");
    expect(dropped.parentId).toBeUndefined();
  });
});
