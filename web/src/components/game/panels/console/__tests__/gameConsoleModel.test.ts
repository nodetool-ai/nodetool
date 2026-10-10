import {
  appendGameConsoleEntry, countGameConsoleLevels, filterGameConsoleGroups, gameConsoleEntityScene, gameValidationConsoleEntries,
  GAME_CONSOLE_LEVELS, type GameConsoleEntry, type GameConsoleGroup
} from "../gameConsoleModel";
import { gameConsolePrompt } from "../../../gameAssistantPrompt";

function append(entries: readonly GameConsoleEntry[], limit?: number): readonly GameConsoleGroup[] {
  return entries.reduce<readonly GameConsoleGroup[]>((groups, entry, index) => appendGameConsoleEntry(groups, entry, index + 1, limit), []);
}

const hit: GameConsoleEntry = { level: "log", source: "script", message: "hit", entityId: "player" };

describe("appendGameConsoleEntry", () => {
  it("collapses consecutive identical lines into one group that keeps the first and latest tick", () => {
    const groups = append([{ ...hit, tick: 3 }, { ...hit, tick: 4 }, { ...hit, tick: 9 }]);
    expect(groups).toEqual([{ ...hit, id: 1, count: 3, firstTick: 3, tick: 9 }]);
  });

  it("starts a new group when level, message, source, scene or entity differ, or a different line intervenes", () => {
    const groups = append([
      { ...hit, tick: 1 },
      { ...hit, tick: 2, entityId: "enemy" },
      { ...hit, tick: 3, level: "warning" },
      { ...hit, tick: 4, source: "runtime" },
      { ...hit, tick: 5, sceneId: "level-2" },
      { ...hit, tick: 6, message: "miss" },
      { ...hit, tick: 7 }
    ]);
    expect(groups.map((group) => group.count)).toEqual([1, 1, 1, 1, 1, 1, 1]);
    expect(groups.map((group) => group.id)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("drops the oldest groups past the limit and stays linear on long streams", () => {
    const lines = Array.from({ length: 5_000 }, (_, index): GameConsoleEntry => ({ level: "log", source: "script", message: `line ${index}`, tick: index }));
    const groups = append(lines, 100);
    expect(groups).toHaveLength(100);
    expect(groups[0].message).toBe("line 4900");
    expect(groups.at(-1)?.message).toBe("line 4999");
  });

  it("does not mutate the previous list", () => {
    const first = append([{ ...hit, tick: 1 }]);
    const frozen = structuredClone(first);
    appendGameConsoleEntry(first, { ...hit, tick: 2 }, 2);
    expect(first).toEqual(frozen);
  });
});

describe("filterGameConsoleGroups", () => {
  const groups = append([
    { level: "error", source: "script", message: "TypeError: x is undefined", entityId: "player", tick: 1 },
    { level: "warning", source: "validation", message: "scenes.0: missing camera" },
    { level: "log", source: "script", message: "jumped", entityId: "enemy-1", tick: 2 }
  ]);
  const all = new Set(GAME_CONSOLE_LEVELS);

  it("keeps only enabled levels", () => {
    expect(filterGameConsoleGroups(groups, { levels: new Set(["error", "log"]), query: "" }).map((group) => group.level)).toEqual(["error", "log"]);
    expect(filterGameConsoleGroups(groups, { levels: new Set(), query: "" })).toEqual([]);
  });

  it("matches the query against message, entity id and entity name without case", () => {
    expect(filterGameConsoleGroups(groups, { levels: all, query: "typeerror" }).map((group) => group.id)).toEqual([1]);
    expect(filterGameConsoleGroups(groups, { levels: all, query: "ENEMY" }).map((group) => group.id)).toEqual([3]);
    const names = (group: GameConsoleGroup) => group.entityId === "player" ? "Hero" : undefined;
    expect(filterGameConsoleGroups(groups, { levels: all, query: " hero " }, names).map((group) => group.id)).toEqual([1]);
  });

  it("counts repeats in the level totals", () => {
    const repeated = appendGameConsoleEntry(groups, { level: "log", source: "script", message: "jumped", entityId: "enemy-1", tick: 3 }, 4);
    expect(countGameConsoleLevels(repeated)).toEqual({ error: 1, warning: 1, log: 2 });
  });
});

describe("entity links", () => {
  const document = { scenes: [
    { id: "intro", entities: [{ id: "player" }] },
    { id: "level-1", entities: [{ id: "player" }, { id: "door" }] }
  ] };

  it("logs validation issues as errors linked to the entity at their path", () => {
    expect(gameValidationConsoleEntries([
      { path: ["scenes", 1, "entities", 1, "collider2d"], message: "Collider is empty" },
      { path: ["scenes", 0, "camera"], message: "Missing camera" },
      { path: [], message: "Document is invalid" }
    ], document)).toEqual([
      { level: "error", source: "validation", message: "scenes.1.entities.1.collider2d: Collider is empty", sceneId: "level-1", entityId: "door" },
      { level: "error", source: "validation", message: "scenes.0.camera: Missing camera", sceneId: "intro" },
      { level: "error", source: "validation", message: "Document is invalid" }
    ]);
  });

  it("resolves the line's own scene first, then any scene holding the entity, and nothing for a deleted entity", () => {
    expect(gameConsoleEntityScene(document, "player", "level-1")).toBe("level-1");
    expect(gameConsoleEntityScene(document, "player")).toBe("intro");
    expect(gameConsoleEntityScene(document, "door", "intro")).toBe("level-1");
    expect(gameConsoleEntityScene(document, "ghost")).toBeUndefined();
  });
});

it("describes a collapsed line for the assistant", () => {
  const [group] = append([{ ...hit, tick: 3, sceneId: "level-1" }, { ...hit, tick: 8, sceneId: "level-1" }]);
  expect(gameConsolePrompt(group, "Hero")).toBe(
    "Help with this game console log. Scene: level-1. Entity: Hero (player). Ticks: 3 to 8. Repeated 2 times. Message: hit");
});
