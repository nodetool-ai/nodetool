import { describe, expect, it } from "vitest";
import { gameDocument, gameDocument3D, gameScreens, type GameScreens } from "../src/index.js";
import { gameScreens as legacyPathScreens } from "../src/game.js";

const two = { schemaVersion: 2, engineVersion: "1", id: "two", revision: "draft", entrySceneId: "room", tickRate: 60,
  pixelsPerUnit: 32, inputActions: ["start"], assets: {}, scenes: [{ id: "room", name: "Room", entities: [] }] };
const three = { schemaVersion: 3, engineVersion: "2", dimension: "3d", id: "three", revision: "draft", entrySceneId: "room",
  tickRate: 60, presentation: { aspectRatio: 16 / 9, hudWidth: 1280, hudHeight: 720 }, inputActions: ["start"],
  assets: {}, scenes: [{ id: "room", name: "Room", activeCameraId: "camera", entities: [
    { id: "camera", transform3d: {}, camera3d: { projection: { kind: "perspective" } } }
  ] }] };

describe("screen document registration", () => {
  it("exports the screen contract through both existing public game paths", () => {
    expect(legacyPathScreens).toBe(gameScreens);
    const screens: GameScreens = { initial: "title", items: [{ id: "title", kind: "title", ui: { nodes: [] } }],
      transitions: [{ from: "title", on: { kind: "action", action: "start" }, to: null }] };
    expect(gameScreens.parse(screens)).toEqual(screens);
  });

  it("keeps existing 2D and 3D documents free of default menu state", () => {
    expect(gameDocument.parse(two)).not.toHaveProperty("screens");
    expect(gameDocument3D.parse(three)).not.toHaveProperty("screens");
  });

  it("parses authored screens and generated settings through both document schemas", () => {
    const screens: GameScreens = { items: [{ id: "settings", kind: "settings" }], transitions: [] };
    expect(gameDocument.parse({ ...two, screens }).screens).toEqual(screens);
    expect(gameDocument3D.parse({ ...three, screens }).screens).toEqual(screens);
  });

  it.each([gameDocument, gameDocument3D])("enforces initial references and bounds at the document field", (schema) => {
    const document = schema === gameDocument ? two : three;
    expect(schema.safeParse({ ...document, screens: { initial: "missing", items: [{ id: "settings", kind: "settings" }], transitions: [] } }).success).toBe(false);
    expect(schema.safeParse({ ...document, screens: { items: Array.from({ length: 33 }, (_, index) => ({ id: `screen-${index}`, kind: "settings" })), transitions: [] } }).success).toBe(false);
  });
});
