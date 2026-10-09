import { describe, expect, it } from "vitest";
import { GAME_2D_ENGINE_BY_SCHEMA, gameDocument, gameSnapshot, parseGameDocument } from "../src/index.js";

const document = (schemaVersion: number, engineVersion: string) => ({ schemaVersion, engineVersion, id: "two", revision: "draft",
  entrySceneId: "scene", tickRate: 60, pixelsPerUnit: 32, inputActions: [], assets: {}, scenes: [{ id: "scene", name: "Scene", entities: [] }] });

describe("2D schema and engine versions", () => {
  it("pairs every 2D schema with exactly one engine", () => {
    expect(GAME_2D_ENGINE_BY_SCHEMA).toEqual({ 1: "1", 2: "1", 4: "3", 5: "4" });
  });

  it("parses schema 5 on engine 4 as a 2D document", () => {
    expect(parseGameDocument(document(5, "4"))).toEqual({ ok: true, document: gameDocument.parse(document(5, "4")) });
    expect(gameSnapshot.shape.engineVersion.safeParse("4").success).toBe(true);
  });

  it("rejects a schema paired with another schema's engine", () => {
    expect(parseGameDocument(document(5, "3"))).toMatchObject({ ok: false,
      diagnostics: [{ code: "unsupported_engine_version", path: ["engineVersion"], message: "Schema 5 requires engine version 4" }] });
    expect(parseGameDocument(document(4, "4"))).toMatchObject({ ok: false,
      diagnostics: [{ code: "unsupported_engine_version", path: ["engineVersion"] }] });
    expect(parseGameDocument(document(2, "4"))).toMatchObject({ ok: false,
      diagnostics: [{ code: "unsupported_engine_version", path: ["engineVersion"] }] });
  });

  it("keeps legacy pairs parsing unchanged", () => {
    for (const [schema, engine] of [[1, "1"], [2, "1"], [4, "3"]] as const) {
      expect(parseGameDocument(document(schema, engine))).toEqual({ ok: true, document: gameDocument.parse(document(schema, engine)) });
    }
  });
});
