/**
 * The Game flow's build: one game, then one paid image per visual slot.
 *
 * What is asserted is what the build is allowed to spend and where it puts
 * it: the game id is recorded before the first generation, sounds are not
 * generated, every image prompt carries the reviewed subject, the style and
 * the slot's cast member, a slot that fails keeps its placeholder, and a
 * second start while one runs joins it instead of paying twice.
 */

const gameCreate = jest.fn();
const generateAsset = jest.fn();
jest.mock("../../../trpc/client", () => ({
  trpcClient: {
    games: {
      create: { mutate: (...args: unknown[]) => gameCreate(...args) },
      generateAsset: { mutate: (...args: unknown[]) => generateAsset(...args) }
    }
  }
}));

import {
  NATIVE_GAME_INSPIRATION_CHIPS,
  gameSlotSpec
} from "@nodetool-ai/protocol";
import {
  cancelGameBuild,
  gameImageSlots,
  isGameBuildLive,
  startGameBuild,
  type BuildGameInput
} from "../useBuildGame";

const design = NATIVE_GAME_INSPIRATION_CHIPS[0]!.design;

const input = (overrides: Partial<BuildGameInput> = {}): BuildGameInput => ({
  projectId: "p1",
  name: "Last Acorn",
  template: "topdown",
  design,
  style: { name: "8-bit", descriptor: "8-bit pixel art, three colours" },
  imageModel: { provider: "fal_ai", id: "fal-ai/flux/schnell" },
  setGame: jest.fn(async () => {}),
  ...overrides
});

beforeEach(() => {
  jest.clearAllMocks();
  gameCreate.mockResolvedValue({ game: { id: "game-1", name: "Last Acorn" } });
  generateAsset.mockResolvedValue({});
});

describe("startGameBuild", () => {
  it("creates the game, records it, then draws every visual slot", async () => {
    const order: string[] = [];
    const setGame = jest.fn(async (patch: Record<string, unknown>) => {
      order.push(`set:${Object.keys(patch).join(",")}`);
    });
    generateAsset.mockImplementation(async (args: { slot: string }) => {
      order.push(`draw:${args.slot}`);
      return {};
    });

    const result = await startGameBuild("w1", input({ setGame }));

    expect(gameCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "p1",
        name: "Last Acorn",
        dimension: "2d",
        document: expect.objectContaining({ schemaVersion: 1 })
      }),
      expect.anything()
    );
    expect(order).toEqual([
      "set:game_id,project_name",
      "draw:player",
      "draw:wall",
      "draw:gem",
      "set:stage"
    ]);
    expect(setGame).toHaveBeenLastCalledWith({ stage: "done" });
    expect(result).toEqual({
      gameId: "game-1",
      name: "Last Acorn",
      projectId: "p1",
      failures: []
    });
  });

  it("prompts each slot with its subject, the style and its own cast member", async () => {
    await startGameBuild("w1", input());

    const player = generateAsset.mock.calls.find(
      ([args]) => args.slot === "player"
    )![0];
    expect(player).toMatchObject({
      id: "game-1",
      kind: "image",
      provider: "fal_ai",
      model: "fal-ai/flux/schnell",
      preparation: { sheet: { cols: 4, rows: 2 } }
    });
    expect(player.prompt).toContain("8-bit pixel art, three colours");
    expect(player.prompt).toContain("rust-orange back");
    // The acorn's look belongs to the gem, not to the fox's sheet.
    expect(player.prompt).not.toContain("glossy chestnut");
    const wall = generateAsset.mock.calls.find(
      ([args]) => args.slot === "wall"
    )![0];
    expect(wall.preparation).toMatchObject({ cropPolicy: "cover" });
  });

  it("reuses the game an earlier build of this workflow made", async () => {
    await startGameBuild("w1", input({ gameId: "game-0" }));

    expect(gameCreate).not.toHaveBeenCalled();
    expect(generateAsset).toHaveBeenCalledWith(
      expect.objectContaining({ id: "game-0" }),
      expect.anything()
    );
  });

  it("keeps the placeholder for a slot that fails and reports it", async () => {
    generateAsset.mockImplementation(async (args: { slot: string }) => {
      if (args.slot === "wall") {
        throw new Error("Provider refused the prompt");
      }
      return {};
    });

    const result = await startGameBuild("w1", input());

    expect(result.failures).toEqual([
      { slot: "wall", reason: "Provider refused the prompt" }
    ]);
  });

  it("fails when no image was drawn, and leaves the stage where it was", async () => {
    generateAsset.mockRejectedValue(new Error("No key for fal_ai"));
    const setGame = jest.fn(async () => {});

    await expect(startGameBuild("w1", input({ setGame }))).rejects.toThrow(
      "No art was generated: No key for fal_ai"
    );
    expect(setGame).not.toHaveBeenCalledWith({ stage: "done" });
    expect(isGameBuildLive("w1")).toBe(false);
  });

  it("joins the build already running instead of starting a second", async () => {
    let release: () => void = () => undefined;
    generateAsset.mockImplementationOnce(
      () => new Promise<void>((resolve) => (release = resolve))
    );

    const first = startGameBuild("w1", input());
    const second = startGameBuild("w1", input());
    expect(second).toBe(first);
    expect(isGameBuildLive("w1")).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    release();
    await first;

    expect(gameCreate).toHaveBeenCalledTimes(1);
    expect(isGameBuildLive("w1")).toBe(false);
  });

  it("stops spending at the next slot once canceled", async () => {
    generateAsset.mockImplementationOnce(async () => {
      cancelGameBuild("w1");
      return {};
    });

    await expect(startGameBuild("w1", input())).rejects.toMatchObject({
      name: "AbortError"
    });
    expect(generateAsset).toHaveBeenCalledTimes(1);
  });
});

describe("gameImageSlots", () => {
  it("leaves sounds to the template", () => {
    expect(
      gameImageSlots(
        [
          { id: "gem", kind: "spritesheet", cell: [32, 32], animations: { idle: 1 } },
          { id: "sfx.collect", kind: "sfx", seconds: 0.4 }
        ].map((slot) => gameSlotSpec.parse(slot))
      ).map((slot) => slot.id)
    ).toEqual(["gem"]);
  });
});
