import type { Entity, Shot } from "@nodetool-ai/protocol";
import { entitiesForShot, injectShotEntities } from "../shotEntities";

const entity = (over: Partial<Entity> & Pick<Entity, "id" | "kind" | "name">): Entity => ({
  type: "entity",
  descriptor: "",
  ...over
});

const shot = (over: Partial<Shot>): Shot => ({
  type: "shot",
  id: "s1",
  index: 0,
  action: "",
  status: "planned",
  ...over
});

const marta = entity({
  id: "e1",
  kind: "character",
  name: "Marta",
  descriptor: "red-haired detective in a beige trench coat"
});
const harbor = entity({
  id: "e2",
  kind: "location",
  name: "Harbor",
  descriptor: "foggy industrial harbor at night"
});
const noir = entity({
  id: "e3",
  kind: "style",
  name: "Noir",
  descriptor: "high-contrast black and white, hard shadows"
});
const umbrella = entity({
  id: "e4",
  kind: "prop",
  name: "Red Umbrella",
  descriptor: "a battered red umbrella"
});

describe("entitiesForShot", () => {
  it("applies styles and locations to every shot", () => {
    const applied = entitiesForShot(shot({ action: "An empty street" }), [
      marta,
      harbor,
      noir
    ]);
    expect(applied.map((e) => e.id)).toEqual(["e2", "e3"]);
  });

  it("applies characters and props only when named in the shot text", () => {
    const applied = entitiesForShot(
      shot({ action: "Marta runs", motion: "she opens the red umbrella" }),
      [marta, umbrella, noir]
    );
    expect(applied.map((e) => e.id)).toEqual(["e1", "e4", "e3"]);
  });

  it("matches names case-insensitively", () => {
    const applied = entitiesForShot(shot({ action: "MARTA waits" }), [marta]);
    expect(applied.map((e) => e.id)).toEqual(["e1"]);
  });

  it("honors an explicit per-shot override, including empty", () => {
    const chosen = entitiesForShot(shot({ entity_ids: ["e3"] }), [
      marta,
      noir
    ]);
    expect(chosen.map((e) => e.id)).toEqual(["e3"]);
    expect(entitiesForShot(shot({ entity_ids: [] }), [marta, noir])).toEqual(
      []
    );
  });
});

describe("injectShotEntities", () => {
  it("appends a consistency block with each descriptor", () => {
    const out = injectShotEntities("a shot, noir style", [marta, noir]);
    expect(out).toBe(
      "a shot, noir style\n\nConsistency references:\n" +
        "- Marta: red-haired detective in a beige trench coat\n" +
        "- Noir: high-contrast black and white, hard shadows"
    );
  });

  it("returns the prompt unchanged with no descriptors to add", () => {
    expect(injectShotEntities("a shot", [])).toBe("a shot");
    expect(
      injectShotEntities("a shot", [entity({ id: "x", kind: "prop", name: "X" })])
    ).toBe("a shot");
  });
});
