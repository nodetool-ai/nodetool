/**
 * resolveEntities — the rule that an entity value's `id` is its identity and
 * every other field is a cache. Both branches: filled from the library, and
 * passed through when the value already carries a descriptor or the library is
 * not wired at all.
 */

import { describe, expect, it, vi } from "vitest";
import type { Entity } from "@nodetool-ai/protocol";
import { resolveEntities, type EntityLibraryContext } from "../src/entities.js";

const stored: Entity = {
  type: "entity",
  id: "e1",
  kind: "character",
  name: "Nova",
  descriptor: "a tall courier in a red jacket"
};

function libraryContext(entities: Record<string, Entity>, wired = true) {
  const getEntity = vi.fn(async (id: string): Promise<Entity | null> =>
    entities[id] ?? null
  );
  const context: EntityLibraryContext = {
    hasModelInterface: () => wired,
    getEntity
  };
  return { ...context, getEntity };
}

describe("resolveEntities", () => {
  it("fills a bare pointer from the library", async () => {
    const context = libraryContext({ e1: stored });
    const resolved = await resolveEntities(
      [{ type: "entity", id: "e1", kind: "character", name: "", descriptor: "" }],
      context
    );
    expect(resolved).toEqual([stored]);
    expect(context.getEntity).toHaveBeenCalledWith("e1");
  });

  it("passes a value with its own descriptor through untouched", async () => {
    const context = libraryContext({ e1: stored });
    const inline: Entity = {
      type: "entity",
      id: "e1",
      kind: "character",
      name: "Novak",
      descriptor: "a short courier in a blue jacket"
    };
    const resolved = await resolveEntities([inline], context);
    // The same object, not a copy: nothing was read and nothing was rewritten.
    expect(resolved[0]).toBe(inline);
    expect(context.getEntity).not.toHaveBeenCalled();
  });

  it("passes a bare pointer through when no library is wired", async () => {
    const inline = {
      type: "entity" as const,
      id: "e1",
      kind: "character" as const,
      name: "Nova",
      descriptor: ""
    };
    expect(await resolveEntities([inline])).toEqual([inline]);
    expect(await resolveEntities([inline], null)).toEqual([inline]);

    const unwired = libraryContext({ e1: stored }, false);
    expect(await resolveEntities([inline], unwired)).toEqual([inline]);
    expect(unwired.getEntity).not.toHaveBeenCalled();
  });

  it("keeps the value when the row is gone, and ignores an id-less value", async () => {
    const context = libraryContext({});
    const missing = {
      type: "entity" as const,
      id: "gone",
      kind: "prop" as const,
      name: "Kettle",
      descriptor: ""
    };
    const idless = { type: "entity", kind: "prop", name: "Kettle", descriptor: "" };
    const resolved = await resolveEntities([missing, idless], context);
    expect(resolved).toEqual([missing, idless]);
    expect(context.getEntity).toHaveBeenCalledTimes(1);
  });

  it("drops non-object values and answers [] for nothing", async () => {
    expect(await resolveEntities(null)).toEqual([]);
    expect(await resolveEntities([])).toEqual([]);
    expect(await resolveEntities(["e1", 3, null], libraryContext({ e1: stored }))).toEqual(
      []
    );
  });
});
