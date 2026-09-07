/**
 * The designer (game-prd § 5.2, criterion 3).
 *
 * What is asserted: the call goes out against the chosen template's schema, the
 * answer is written with the stage and the source key and **no node is
 * placed**, a chip's brief falls back to its pinned design with no provider at
 * all, and a refusal comes back as a reason rather than as an exception.
 */
import { act, renderHook } from "@testing-library/react";
import {
  GAME_INSPIRATION_CHIPS,
  type GameAssetManifest
} from "@nodetool-ai/protocol";

const rpcRequest = jest.fn();
jest.mock("../../../lib/websocket/rpcRequest", () => ({
  rpcRequest: (...args: unknown[]) => rpcRequest(...args)
}));

let settings: Record<string, unknown> = {};
const managerState = {
  getWorkflow: () => ({ id: "w1", name: "W", settings, graph: null }),
  getNodeStore: () => undefined,
  updateWorkflow: jest.fn((workflow: { settings: unknown }) => {
    settings = workflow.settings as Record<string, unknown>;
  }),
  saveWorkflow: jest.fn(async () => {})
};
jest.mock("../../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: (selector: (state: unknown) => unknown) =>
    selector(managerState),
  useWorkflowManagerStore: () => ({ getState: () => managerState })
}));

import { readGameSetup } from "@nodetool-ai/protocol/api-schemas/workflows.js";
import { hasPinnedDesign, useDesignGame } from "../useDesignGame";

const CHIP = GAME_INSPIRATION_CHIPS[0];

const MANIFEST: GameAssetManifest = {
  version: 1,
  template: CHIP.template,
  godot: "4.3",
  slots: [
    {
      id: "player",
      kind: "spritesheet",
      cell: [32, 32],
      animations: { idle: 2 },
      fps: 8
    },
    { id: "sfx.jump", kind: "sfx", seconds: 0.4 }
  ],
  hooks: []
};

const design = (title: string) => ({
  title,
  premise: "p",
  core_loop: "c",
  player_verbs: ["run"],
  enemies: [],
  level: "l",
  win: "w",
  lose: "x",
  cast: [{ slot_id: "player", name: "Ember", descriptor: "a fox" }],
  slot_prompts: [
    { slot_id: "player", prompt: "a fox running" },
    { slot_id: "sfx.jump", prompt: "a hop" }
  ]
});

beforeEach(() => {
  jest.clearAllMocks();
  settings = { game: { stage: "template", brief: CHIP.brief } };
  rpcRequest.mockReset();
});

describe("useDesignGame", () => {
  it("writes the design, the source key and the review stage, placing nothing", async () => {
    rpcRequest.mockResolvedValue({ data: design("Ember Run") });
    const { result } = renderHook(() => useDesignGame("w1"));
    let refusal: string | null = "unset";
    await act(async () => {
      refusal = await result.current.designGame({
        brief: CHIP.brief,
        manifest: MANIFEST,
        model: { provider: "openai", id: "gpt-5" }
      });
    });
    expect(refusal).toBeNull();
    const game = readGameSetup(settings);
    expect(game?.stage).toBe("review");
    expect(game?.design?.title).toBe("Ember Run");
    expect(game?.design_source).toBe(`${CHIP.template}\n${CHIP.brief}`);
    // One call, and it is the text call — nothing placed a node.
    expect(rpcRequest).toHaveBeenCalledTimes(1);
    expect(rpcRequest.mock.calls[0][0]).toBe("generate_text");
  });

  it("pins the template's slot ids into the schema it asks for", async () => {
    rpcRequest.mockResolvedValue({ data: design("Ember Run") });
    const { result } = renderHook(() => useDesignGame("w1"));
    await act(async () => {
      await result.current.designGame({
        brief: CHIP.brief,
        manifest: MANIFEST,
        model: { provider: "openai", id: "gpt-5" }
      });
    });
    const schema = rpcRequest.mock.calls[0][1].schema as {
      properties: { slot_prompts: { items: { properties: { slot_id: { enum: string[] } } } } };
    };
    expect(schema.properties.slot_prompts.items.properties.slot_id.enum).toEqual(
      ["player", "sfx.jump"]
    );
  });

  it("falls back to a chip's pinned design when no provider is connected", async () => {
    const { result } = renderHook(() => useDesignGame("w1"));
    await act(async () => {
      await result.current.designGame({
        brief: CHIP.brief,
        manifest: { ...MANIFEST, slots: [] },
        model: null
      });
    });
    expect(rpcRequest).not.toHaveBeenCalled();
    expect(readGameSetup(settings)?.design?.title).toBe(CHIP.design.title);
    expect(readGameSetup(settings)?.stage).toBe("review");
  });

  it("hands back the provider's own words when the call is refused", async () => {
    rpcRequest.mockRejectedValue(new Error("429 rate limited"));
    settings = { game: { stage: "template", brief: "something of my own" } };
    const { result } = renderHook(() => useDesignGame("w1"));
    let refusal: string | null = null;
    await act(async () => {
      refusal = await result.current.designGame({
        brief: "something of my own",
        manifest: MANIFEST,
        model: { provider: "openai", id: "gpt-5" }
      });
    });
    expect(refusal).toBe("429 rate limited");
    expect(readGameSetup(settings)?.stage).toBe("template");
  });

  it("refuses an empty brief before it calls anything", async () => {
    const { result } = renderHook(() => useDesignGame("w1"));
    let refusal: string | null = null;
    await act(async () => {
      refusal = await result.current.designGame({
        brief: "   ",
        manifest: MANIFEST,
        model: { provider: "openai", id: "gpt-5" }
      });
    });
    expect(refusal).toBe("Describe your game before designing it.");
    expect(rpcRequest).not.toHaveBeenCalled();
  });
});

describe("hasPinnedDesign", () => {
  it("matches a chip's brief on its own template only", () => {
    expect(hasPinnedDesign(CHIP.brief, CHIP.template)).toBe(true);
    expect(hasPinnedDesign(CHIP.brief, "not-a-template")).toBe(false);
    expect(hasPinnedDesign("a game about nothing", CHIP.template)).toBe(false);
  });
});
