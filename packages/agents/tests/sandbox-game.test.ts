import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createSandboxModuleCatalog, discoverSandboxPack } from "@nodetool-ai/node-sdk";
import { applyGameOps, createTopDownRoomGame, gameDocumentOp } from "@nodetool-ai/game-runtime";
import { createChatCodeActSession, type ChatCodeActToolCall } from "../src/codeact/chat-codeact.js";
import { withGamePackage } from "../src/codeact/sandbox-packages.js";
import { createMockContext } from "./_helpers/mock-context.js";

const pack = "@nodetool-ai/sandbox-game";
const discovery = discoverSandboxPack(fileURLToPath(new URL("../../sandbox-packs/sandbox-game", import.meta.url)));
if (!discovery) { throw new Error("The shipped game pack was not discovered"); }
const catalog = createSandboxModuleCatalog([discovery]);
const id = "0123456789abcdef0123456789abcdef";
const tools = ["create_native_game", "edit_native_game"].map((name) => ({
  name, description: name, inputSchema: { type: "object", properties: {} }
}));

function fixture() {
  let document = createTopDownRoomGame(id);
  const calls: ChatCodeActToolCall[] = [];
  const session = createChatCodeActSession({
    tools,
    sandboxModuleCatalog: catalog,
    context: createMockContext(),
    executeTool: async (call) => {
      calls.push(call);
      if (call.name === "edit_native_game") {
        try {
          document = applyGameOps(document, gameDocumentOp.array().parse(call.args["ops"]));
        } catch (error) {
          return JSON.stringify({ error: error instanceof Error ? error.message : "Game edit rejected" });
        }
      }
      return JSON.stringify({ game: { id: document.id, revision: document.revision }, document, draft_updated_at: "saved" });
    }
  });
  return { session, calls, document: () => document };
}

describe("the shipped game builder", () => {
  it("admits the installed pack only when the session can author games", () => {
    expect(withGamePackage([], ["create_native_game", "edit_native_game"], catalog)).toEqual([pack]);
    expect(withGamePackage([], ["get_native_game"], catalog)).toEqual([]);
    expect(withGamePackage([], ["create_native_game", "edit_native_game"], undefined)).toEqual([]);
  });

  it("imports in QuickJS and saves a large level through one atomic edit", async () => {
    const f = fixture();
    const observation = JSON.parse(await f.session.executeAction({ code: `
      import { game, entity, script, registerAssets, fill, plank, arc, saveGame } from "${pack}";
      const document = game({ pixelsPerUnit: 48 });
      registerAssets(document, {
        stone: { assetId: "builtin:wall", digest: "builtin:wall-v1", width: 32, height: 32 },
        gem: { assetId: "builtin:gem", digest: "builtin:gem-v1", width: 32, height: 32 }
      });
      const tiles = [];
      fill(tiles, 0, -2, 86, 40);
      plank(tiles, 2, 5, 6, { oneWay: true });
      const entities = document.scenes[0].entities;
      entities.push(entity("terrain", 0, 0, { tilemap: { assetId: "stone", tiles, solid: true } }));
      for (const [i, p] of arc(10, 4, 3, 2, 73).entries()) {
        entities.push(entity("ember-" + i, p.x, p.y, {
          sprite: { assetId: "gem", width: 0.5, height: 0.5 },
          collider2d: { width: 0.5, height: 0.5, sensor: true },
          behaviors: [{ kind: "collectible", score: 1 }]
        }));
      }
      for (let i = 0; i < 43; i++) entities.push(entity("item-" + i, i, 0));
      entities[116].behaviors.push(script(() => ({ state: {}, commands: [] })));
      return await saveGame({ name: "Large level", document }, { games: nodetool.games, project_id: "project" });
    ` }));
    expect(observation.ok, JSON.stringify(observation)).toBe(true);
    expect(observation.result).toMatchObject({ game_id: id, draft_updated_at: "saved" });
    expect(f.calls.map((call) => call.name)).toEqual(["create_native_game", "edit_native_game"]);
    expect(f.calls[1].args["ops"]).toHaveLength(1);
    expect(f.document().scenes[0].entities).toHaveLength(117);
    expect(f.document().scenes[0].entities[0].tilemap?.tiles).toHaveLength(3446);
    expect(f.document().id).toBe(id);
  });

  it("throws on a refused replacement and retains the previous document", async () => {
    const f = fixture();
    const before = f.document();
    const observation = JSON.parse(await f.session.executeAction({ code: `
      import { game, entity, saveGame } from "${pack}";
      const document = game();
      document.scenes[0].entities.push(entity("sprite", 0, 0, {
        sprite: { assetId: "missing", width: 1, height: 1 }
      }));
      return await saveGame({ document }, { games: nodetool.games, game_id: "${id}", base_updated_at: "before" });
    ` }));
    expect(observation.ok).toBe(false);
    expect(observation.error).toContain("edit_native_game");
    expect(f.document()).toEqual(before);
    expect(f.calls[0].args["base_updated_at"]).toBe("before");
  });

  it("handles empty grids and a one-point arc and rejects invalid geometry", async () => {
    const f = fixture();
    const observation = JSON.parse(await f.session.executeAction({ code: `
      import { fill, arc } from "${pack}";
      const tiles = [];
      fill(tiles, 0, 0, 0, 2);
      const errors = [];
      for (const make of [() => fill(tiles, 0, 0, -1, 2), () => fill(tiles, 0, 0, 1, 1, { size: 0 })]) {
        try { make(); } catch (error) { errors.push(error.message); }
      }
      return { tiles, point: arc(2, 3, 4, 5, 1), errors };
    ` }));
    expect(observation.ok).toBe(true);
    expect(observation.result).toMatchObject({ tiles: [], point: [{ x: 6, y: 3 }], errors: expect.any(Array) });
    expect(observation.result.errors).toHaveLength(2);
  });
});
