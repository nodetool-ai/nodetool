/**
 * Every server read of a board goes through `toDocument`, so that is where a
 * shot-only entity joins the board's cast. Without it, an agent that sets
 * `entity_ids` on a shot leaves the board's cast — the list the prompt
 * seasoning and the editor's pickers read — without that entity.
 */

import { describe, it, expect } from "vitest";
import {
  Storyboard,
  emptyStoryboardDocument,
  type StoryboardDocument
} from "../src/storyboard.js";
import type { Shot } from "@nodetool-ai/protocol";

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

const board = (over: Partial<StoryboardDocument>): Storyboard =>
  new Storyboard({
    user_id: "u1",
    project_id: "p1",
    name: "board",
    document: JSON.stringify({ ...emptyStoryboardDocument(), ...over })
  });

describe("Storyboard.toDocument entity cast", () => {
  it("adds entities a shot names but the board was never cast with", () => {
    const doc = board({
      entityIds: ["e_style"],
      shots: [shot("s1", ["e_style", "e_hero"]), shot("s2", ["e_prop"])]
    }).toDocument();
    expect(doc.entityIds).toEqual(["e_style", "e_hero", "e_prop"]);
  });

  it("leaves an already-consistent cast alone", () => {
    const doc = board({
      entityIds: ["e_a", "e_b"],
      shots: [shot("s1", ["e_b"]), shot("s2")]
    }).toDocument();
    expect(doc.entityIds).toEqual(["e_a", "e_b"]);
  });

  it("still defaults a row persisted before entityIds existed", () => {
    const row = new Storyboard({
      user_id: "u1",
      project_id: "p1",
      name: "board",
      document: JSON.stringify({ shots: [shot("s1", ["e_hero"])] })
    });
    expect(row.toDocument().entityIds).toEqual(["e_hero"]);
  });
});
