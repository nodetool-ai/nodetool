/**
 * A shot's entity selection is read against the board's cast, so an id cast on
 * a shot but missing from the board resolves to nothing. Agents write shots
 * without touching the board, so the two have to be reconciled on read.
 */

import { describe, expect, it } from "vitest";
import { boardEntityIdsWithShots, entitiesForShot } from "../src/creative.js";
import type { Entity, Shot } from "../src/creative.js";

const shot = (id: string, entityIds?: string[]): Shot => {
  const s: Shot = {
    type: "shot",
    id,
    index: 0,
    action: `${id} action`,
    status: "planned"
  };
  if (entityIds) {
    s.entity_ids = entityIds;
  }
  return s;
};

const entity = (id: string): Entity => ({
  type: "entity",
  id,
  name: id,
  kind: "character",
  descriptor: `${id} descriptor`
});

describe("boardEntityIdsWithShots", () => {
  it("appends shot entity ids the board is missing, in shot order", () => {
    expect(
      boardEntityIdsWithShots(
        ["a"],
        [shot("s1", ["a", "b"]), shot("s2", ["c", "b"])]
      )
    ).toEqual(["a", "b", "c"]);
  });

  it("returns the same array when every shot id is already cast", () => {
    const cast = ["a", "b"];
    expect(boardEntityIdsWithShots(cast, [shot("s1", ["b"])])).toBe(cast);
  });

  it("ignores shots with no explicit selection", () => {
    const cast = ["a"];
    expect(boardEntityIdsWithShots(cast, [shot("s1")])).toBe(cast);
  });

  it("is what makes a shot-only entity reach the shot's prompt", () => {
    const s = shot("s1", ["a", "b"]);
    const library = [entity("a"), entity("b")];
    const boardOnly = library.filter((e) => ["a"].includes(e.id));
    expect(entitiesForShot(s, boardOnly).map((e) => e.id)).toEqual(["a"]);

    const widened = boardEntityIdsWithShots(["a"], [s]);
    const cast = library.filter((e) => widened.includes(e.id));
    expect(entitiesForShot(s, cast).map((e) => e.id)).toEqual(["a", "b"]);
  });
});
