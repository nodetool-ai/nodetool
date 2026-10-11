/**
 * The Game flow's designer writes text and nothing else.
 *
 * With a model it sends the template's manifest and stores what the schema
 * parser makes of the answer; with no model a shipped chip's brief falls back
 * to its pinned design. Either way the design lands on `settings.game` with
 * the stage moved to `review`, and an answer to a brief that changed
 * meanwhile is set aside.
 */
import { act, renderHook } from "@testing-library/react";

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

import {
  readGameSetup,
  writeGameSetup
} from "@nodetool-ai/protocol/api-schemas/workflows.js";
import { NATIVE_GAME_INSPIRATION_CHIPS } from "@nodetool-ai/protocol";
import { DESIGN_SET_ASIDE_REASON, useDesignGame } from "../useDesignGame";

const chip = NATIVE_GAME_INSPIRATION_CHIPS[1]!;

beforeEach(() => {
  jest.clearAllMocks();
  settings = writeGameSetup(
    {},
    { stage: "template", brief: chip.brief, template: "topdown" }
  );
});

describe("useDesignGame", () => {
  it("falls back to a shipped chip's pinned design with no model", async () => {
    const { result } = renderHook(() => useDesignGame("w1"));
    let refusal: string | null = "unset";
    await act(async () => {
      refusal = await result.current.designGame({
        brief: chip.brief,
        template: "topdown",
        model: null
      });
    });

    expect(refusal).toBeNull();
    expect(rpcRequest).not.toHaveBeenCalled();
    const game = readGameSetup(settings);
    expect(game?.stage).toBe("review");
    expect(game?.design?.title).toBe(chip.design.title);
    expect(game?.design_source).toBe(`topdown\n${chip.brief}`);
  });

  it("asks the model with the template's manifest and stores the parsed answer", async () => {
    rpcRequest.mockResolvedValue({
      data: { ...chip.design, title: "Deep Pearl", slot_prompts: [] }
    });
    const { result } = renderHook(() => useDesignGame("w1"));
    await act(async () => {
      await result.current.designGame({
        brief: chip.brief,
        template: "topdown",
        model: { provider: "openai", id: "gpt-5.4-mini" }
      });
    });

    const [command, request] = rpcRequest.mock.calls[0];
    expect(command).toBe("generate_text");
    expect(request).toMatchObject({
      provider: "openai",
      model: "gpt-5.4-mini",
      schema_name: "game_design"
    });
    expect(request.messages[1].content).toContain('"id": "sfx.collect"');
    const game = readGameSetup(settings);
    expect(game?.design?.title).toBe("Deep Pearl");
    // The slots the model skipped are filled from the template and reported.
    expect(result.current.filled).toEqual(
      expect.arrayContaining(["slot_prompts.player", "slot_prompts.wall"])
    );
  });

  it("sets an answer aside when the brief changed while it was written", async () => {
    rpcRequest.mockImplementation(async () => {
      settings = writeGameSetup(settings, { brief: "Something else" });
      return { data: chip.design };
    });
    const { result } = renderHook(() => useDesignGame("w1"));
    let refusal: string | null = null;
    await act(async () => {
      refusal = await result.current.designGame({
        brief: chip.brief,
        template: "topdown",
        model: { provider: "openai", id: "gpt-5.4-mini" }
      });
    });

    expect(refusal).toBe(DESIGN_SET_ASIDE_REASON);
    expect(readGameSetup(settings)?.design).toBeUndefined();
  });

  it("names what to do for a brief no chip carries and no model", async () => {
    settings = writeGameSetup(settings, { brief: "A brand new idea" });
    const { result } = renderHook(() => useDesignGame("w1"));
    let refusal: string | null = null;
    await act(async () => {
      refusal = await result.current.designGame({
        brief: "A brand new idea",
        template: "topdown",
        model: null
      });
    });

    expect(refusal).toMatch(/Pick a model/);
    expect(readGameSetup(settings)?.stage).toBe("template");
  });
});
