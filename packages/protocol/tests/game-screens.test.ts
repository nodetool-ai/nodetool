import { describe, expect, it } from "vitest";
import { gameScreens, gameScreenIssues } from "../src/game-screens.js";

const title = { id: "title", kind: "title", ui: { nodes: [
  { kind: "button", id: "start", action: "start", width: 100, height: 40 }
] } };
const configuration = { initial: "title", items: [title, { id: "settings", kind: "settings" }], transitions: [
  { from: "title", on: { kind: "action", action: "start" }, to: null },
  { from: null, on: { kind: "action", action: "pause" }, to: "settings" }
] };

describe("game screens", () => {
  it("parses immediate title, pause, settings, game-over and custom screens built from HUD nodes", () => {
    const parsed = gameScreens.parse({ ...configuration, items: [title,
      { id: "pause", kind: "pause", ui: { nodes: [] } },
      { id: "settings", kind: "settings" },
      { id: "over", kind: "gameOver", ui: { nodes: [] } },
      { id: "custom", kind: "custom", pauseSimulation: false, ui: { nodes: [] } }
    ] });
    expect(parsed.initial).toBe("title");
    expect(parsed.items.map((screen) => screen.kind)).toEqual(["title", "pause", "settings", "gameOver", "custom"]);
    expect(parsed.items[2]).toEqual({ id: "settings", kind: "settings" });
    expect(parsed.items[4].pauseSimulation).toBe(false);
    expect(parsed.transitions).toEqual(configuration.transitions);
  });

  it("allows generated UI only for settings and rejects unknown fields", () => {
    for (const kind of ["title", "pause", "gameOver", "custom"]) {
      expect(gameScreens.safeParse({ items: [{ id: "screen", kind }], transitions: [] }).success).toBe(false);
    }
    expect(gameScreens.safeParse({ ...configuration, qualityTier: "high" }).success).toBe(false);
  });

  it.each([
    { ...configuration, initial: "missing" },
    { ...configuration, items: [title, title] },
    { ...configuration, transitions: [{ from: "missing", on: { kind: "win" }, to: null }] },
    { ...configuration, transitions: [{ from: null, on: { kind: "win" }, to: "missing" }] },
    { ...configuration, transitions: [{ from: "title", on: { kind: "win" }, to: "title" }] },
    { ...configuration, transitions: [configuration.transitions[0], { ...configuration.transitions[0], to: "settings" }] },
    { ...configuration, transitions: [{ from: null, on: { kind: "action", action: "settings:volume:up" }, to: "settings" }] }
  ])("rejects missing or duplicate references and ambiguous transition selectors", (value) => {
    expect(gameScreens.safeParse(value).success).toBe(false);
  });

  it("bounds screens, transitions and ids without changing HUD bounds", () => {
    const items = Array.from({ length: 32 }, (_, index) => ({ id: `screen-${index}`, kind: "settings" }));
    const transitions = Array.from({ length: 128 }, (_, index) => ({ from: null, on: { kind: "trigger", event: `event-${index}` }, to: "screen-0" }));
    expect(gameScreens.safeParse({ items, transitions }).success).toBe(true);
    expect(gameScreens.safeParse({ items: [...items, { id: "extra", kind: "settings" }], transitions }).success).toBe(false);
    expect(gameScreens.safeParse({ items, transitions: [...transitions, { from: null, on: { kind: "win" }, to: "screen-0" }] }).success).toBe(false);
    expect(gameScreens.safeParse({ items: [{ id: "x".repeat(65), kind: "settings" }], transitions: [] }).success).toBe(false);
    const nodes = Array.from({ length: 256 }, (_, index) => ({ kind: "text", id: `text-${index}`, text: "Menu" }));
    expect(gameScreens.safeParse({ items: [{ id: "screen", kind: "title", ui: { nodes } }], transitions: [] }).success).toBe(true);
    expect(gameScreens.safeParse({ items: [{ id: "screen", kind: "title", ui: { nodes: [...nodes, { kind: "text", id: "extra", text: "Menu" }] } }], transitions: [] }).success).toBe(false);
  });

  it("checks authored actions and screen HUD references with screen-specific issue paths", () => {
    const screens = gameScreens.parse(configuration);
    const source = { screens, inputActions: ["start", "pause"], assets: {}, scenes: [] };
    expect(gameScreenIssues(source)).toEqual([]);
    const issues = gameScreenIssues({ ...source, inputActions: [] });
    expect(issues.map((issue) => issue.path)).toEqual([
      ["screens", "transitions", 0, "on", "action"],
      ["screens", "transitions", 1, "on", "action"],
      ["screens", "items", 0, "ui", "nodes", 0, "action"]
    ]);
    expect(gameScreenIssues({ inputActions: [], assets: {}, scenes: [] })).toEqual([]);
  });

  it("validates each screen tree independently of other screens and gameplay HUD ids", () => {
    const screens = gameScreens.parse({ items: [title, { ...title, id: "other" }], transitions: [] });
    expect(gameScreenIssues({ screens, inputActions: ["start"], assets: {}, scenes: [
      { id: "room", entities: [], ui: title.ui }
    ] })).toEqual([]);
  });

  it("keeps HUD reference checks and reserved-control checks reachable through screen validation", () => {
    const screens = gameScreens.parse({ items: [{ id: "menu", kind: "title", ui: { nodes: [
      { kind: "image", id: "logo", assetId: "missing", width: 20, height: 20 },
      { kind: "text", id: "heading", text: "Menu", fontId: "missing" },
      { kind: "bar", id: "health", source: { kind: "health", entityId: "missing" }, width: 100, height: 20 },
      { kind: "button", id: "reserved", action: "settings:volume:up", width: 100, height: 20 }
    ] } }], transitions: [] });
    const issues = gameScreenIssues({ screens, inputActions: ["settings:volume:up"], assets: {}, scenes: [{ id: "room", entities: [] }] });
    expect(issues.map((issue) => issue.path)).toEqual([
      ["screens", "items", 0, "ui", "nodes", 0, "assetId"],
      ["screens", "items", 0, "ui", "nodes", 1, "fontId"],
      ["screens", "items", 0, "ui", "nodes", 2, "source", "entityId"],
      ["screens", "items", 0, "ui", "nodes", 3, "action"]
    ]);
  });
});
