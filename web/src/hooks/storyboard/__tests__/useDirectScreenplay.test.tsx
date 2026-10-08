/**
 * @jest-environment jsdom
 *
 * Pins the Director's direct `generate_text` request: no workflow, no job row,
 * and the screenplay schema forced as structured output. The board's cast rides
 * in the brief so the model names entities exactly, which is what activates
 * them per shot.
 */
import { renderHook, act } from "@testing-library/react";
import { productionRequirement } from "@nodetool-ai/protocol";

const rpcRequest = jest.fn();
jest.mock("../../../lib/websocket/rpcRequest", () => ({
  rpcRequest: (...args: unknown[]) => rpcRequest(...(args as [])),
  randomRequestId: () => "req-test"
}));

const mockEntities: unknown[] = [];
jest.mock("../../../serverState/useEntities", () => ({
  useEntities: () => ({ data: mockEntities })
}));

import { useDirectScreenplay } from "../useDirectScreenplay";
import { boardDirectionFingerprint } from "../directionFingerprint";
import { useStoryboardStore } from "../../../stores/storyboard/StoryboardStore";

const BOARD = "board-direct";

const seedBoard = (): void => {
  const store = useStoryboardStore.getState();
  store.ensureBoard(BOARD);
  store.setBrief(BOARD, "A lighthouse keeper loses the light.");
  store.setStyle(BOARD, "grainy 16mm, cold blues");
  store.setAspectRatio(BOARD, "9:16");
  store.setDirectorModel(BOARD, {
    type: "language_model",
    provider: "anthropic",
    id: "claude-sonnet-5"
  } as never);
  store.setSetup(BOARD, { genre: "Science Fiction", stage: "genre" });
};

beforeEach(() => {
  rpcRequest.mockReset();
  mockEntities.length = 0;
  useStoryboardStore.setState({ boards: {} } as never);
  seedBoard();
});

const answer = (shots: number) => ({
  text: "",
  data: {
    title: "Dark Water",
    style_bible: "grainy 16mm",
    shots: Array.from({ length: shots }, (_, i) => ({
      slug: `Shot ${i + 1}`,
      action: `beat ${i + 1}`,
      camera: { framing: "wide" }
    }))
  }
});

describe("useDirectScreenplay", () => {
  it("asks generate_text for structured output against the screenplay schema", async () => {
    rpcRequest.mockResolvedValue(answer(3));
    const { result } = renderHook(() => useDirectScreenplay());

    await act(async () => {
      await result.current.direct(BOARD, 3);
    });

    expect(rpcRequest).toHaveBeenCalledTimes(1);
    const [command, data] = rpcRequest.mock.calls[0] as [
      string,
      Record<string, unknown>
    ];
    expect(command).toBe("generate_text");
    expect(data.provider).toBe("anthropic");
    expect(data.model).toBe("claude-sonnet-5");
    expect(data.schema_name).toBe("screenplay");
    expect(String(data.system)).toContain("film director");
    expect(String(data.prompt)).toContain("exactly 3 shots for a 9:16 piece");
    expect(String(data.prompt)).toContain("grainy 16mm, cold blues");
    // The schema pins the shot count on both ends, so the model cannot
    // return four shots for a three-shot board.
    const schema = data.schema as {
      properties: { shots: { minItems: number; maxItems: number } };
    };
    expect(schema.properties.shots.minItems).toBe(3);
    expect(schema.properties.shots.maxItems).toBe(3);
  });

  // Criterion 3: the genre picked in step 2 is what makes the Director shoot
  // one way rather than another, so it has to be in the prompt.
  it("names the board's genre in the Director prompt", async () => {
    rpcRequest.mockResolvedValue(answer(2));
    const { result } = renderHook(() => useDirectScreenplay());

    await act(async () => {
      await result.current.direct(BOARD, 2);
    });

    const [, request] = rpcRequest.mock.calls[0] as [
      string,
      Record<string, unknown>
    ];
    expect(String(request.prompt)).toContain("Genre:\nScience Fiction");
    expect(useStoryboardStore.getState().getBoard(BOARD)?.screenplay?.genre).toBe(
      "Science Fiction"
    );
  });

  it("omits the genre line when none is picked", async () => {
    useStoryboardStore.getState().setSetup(BOARD, { genre: "" });
    rpcRequest.mockResolvedValue(answer(2));
    const { result } = renderHook(() => useDirectScreenplay());

    await act(async () => {
      await result.current.direct(BOARD, 2);
    });

    const [, request] = rpcRequest.mock.calls[0] as [
      string,
      Record<string, unknown>
    ];
    expect(String(request.prompt)).not.toContain("Genre:");
  });

  it("leaves the board and the stage alone when the run is canceled", async () => {
    const controller = new AbortController();
    rpcRequest.mockImplementation(
      (_command: string, _data: unknown, _timeout: unknown, signal: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () =>
            reject(new DOMException("The request was aborted.", "AbortError"))
          );
        })
    );
    const { result } = renderHook(() => useDirectScreenplay());

    let applied: boolean | undefined;
    await act(async () => {
      const run = result.current.direct(BOARD, 2, controller.signal);
      controller.abort();
      applied = await run;
    });

    expect(applied).toBe(false);
    expect(result.current.error).toBeNull();
    const board = useStoryboardStore.getState().getBoard(BOARD);
    expect(board?.screenplay).toBeNull();
    expect(board?.setupStage).toBe("genre");
  });

  // PRD § 7.2: the setup flow moves to the review only once a screenplay is
  // actually on the board.
  it("moves the setup stage to review on success", async () => {
    rpcRequest.mockResolvedValue(answer(2));
    const { result } = renderHook(() => useDirectScreenplay());

    let applied = false;
    await act(async () => {
      applied = await result.current.direct(BOARD, 2);
    });

    expect(applied).toBe(true);
    expect(useStoryboardStore.getState().getBoard(BOARD)?.setupStage).toBe(
      "review"
    );
  });

  it("leaves the stage at genre when the call is rejected", async () => {
    rpcRequest.mockRejectedValue(new Error("model unavailable"));
    const { result } = renderHook(() => useDirectScreenplay());

    let applied = true;
    await act(async () => {
      applied = await result.current.direct(BOARD, 2);
    });

    expect(applied).toBe(false);
    expect(useStoryboardStore.getState().getBoard(BOARD)?.setupStage).toBe(
      "genre"
    );
  });

  it("leaves the stage at genre when no model is picked", async () => {
    useStoryboardStore.getState().setDirectorModel(BOARD, null);
    const { result } = renderHook(() => useDirectScreenplay());

    let applied = true;
    await act(async () => {
      applied = await result.current.direct(BOARD, 2);
    });

    expect(applied).toBe(false);
    expect(useStoryboardStore.getState().getBoard(BOARD)?.setupStage).toBe(
      "genre"
    );
  });

  // The same hook drives the board's own Direct button. A finished board is
  // not thrown back into setup by re-directing it.
  it("does not move a finished board's stage", async () => {
    useStoryboardStore.getState().setSetup(BOARD, { stage: "done" });
    rpcRequest.mockResolvedValue(answer(2));
    const { result } = renderHook(() => useDirectScreenplay());

    await act(async () => {
      await result.current.direct(BOARD, 2);
    });

    expect(useStoryboardStore.getState().getBoard(BOARD)?.setupStage).toBe(
      "done"
    );
  });

  it("preserves approved graphics, production, media and motion design on retained shots", async () => {
    const graphics = { mode: "graphics_first" as const, elements: [{ id: "price", kind: "text" as const, text: " €29 " }] };
    const production = productionRequirement.parse({ media_strategy: "still_motion_graphics", protected_inputs: [{ id: "price", kind: "exact_text", value: " €29 ", allowed_transformations: [] }] });
    const store = useStoryboardStore.getState();
    store.setScreenplay(BOARD, { type: "screenplay", id: "old", title: "Ad", motion_design: { direction: "Retain rhythm" }, shots: [{ type: "shot", id: "shot-0", index: 0, action: "Old", status: "rendered", graphics, production, keyframe: { type: "image", asset_id: "original" } }] });
    rpcRequest.mockResolvedValue(answer(1));
    const { result } = renderHook(() => useDirectScreenplay());
    await act(async () => { await result.current.direct(BOARD, 1); });
    const board = useStoryboardStore.getState().getBoard(BOARD);
    expect(board?.shots[0].graphics).toEqual(graphics);
    expect(board?.shots[0].production).toEqual(production);
    expect(board?.shots[0].keyframe?.asset_id).toBe("original");
    expect(board?.screenplay?.motion_design).toEqual({ direction: "Retain rhythm" });
  });

  it("clears stored graphics with the explicit undefined patch used by the browser bridge", () => {
    const store = useStoryboardStore.getState();
    store.setScreenplay(BOARD, { type: "screenplay", id: "old", title: "Ad", shots: [{ type: "shot", id: "shot-0", index: 0, action: "Price", status: "planned", graphics: { mode: "graphics_first" } }] });
    store.updateShot(BOARD, "shot-0", { graphics: undefined });
    expect(useStoryboardStore.getState().getBoard(BOARD)?.shots[0].graphics).toBeUndefined();
  });

  it("writes the parsed screenplay onto the board", async () => {
    rpcRequest.mockResolvedValue(answer(2));
    const { result } = renderHook(() => useDirectScreenplay());

    await act(async () => {
      await result.current.direct(BOARD, 2);
    });

    const board = useStoryboardStore.getState().getBoard(BOARD);
    expect(board?.shots).toHaveLength(2);
    expect(board?.shots[0].action).toBe("beat 1");
    expect(board?.shots[0].status).toBe("planned");
    expect(board?.shots[1].index).toBe(1);
    expect(result.current.error).toBeNull();
  });

  // F15: the record is what the genre step computes from the board the run
  // left. The answer's style bible replaces the board's style, so a record
  // read off the board before the answer landed would never match.
  it("records the direction the genre step reads off the resulting board", async () => {
    rpcRequest.mockResolvedValue(answer(2));
    const { result } = renderHook(() => useDirectScreenplay());

    await act(async () => {
      await result.current.direct(BOARD, 2);
    });

    const board = useStoryboardStore.getState().getBoard(BOARD);
    if (!board) {
      throw new Error("Expected the board.");
    }
    expect(board.style).toBe("grainy 16mm");
    // The review step's rewrite asks for the board's own length, which then
    // is the length the genre step fingerprints.
    expect(board.setupShotCount).toBe(2);
    expect(board.setupDirectedFrom).toBe(
      boardDirectionFingerprint(board, "none")
    );
  });

  it("names the board's cast in the brief so shots reference them exactly", async () => {
    mockEntities.push({
      type: "entity",
      id: "e-1",
      kind: "character",
      name: "Marta",
      descriptor: "red-haired keeper in an oilskin"
    });
    useStoryboardStore.getState().setEntityIds(BOARD, ["e-1"]);
    rpcRequest.mockResolvedValue(answer(1));
    const { result } = renderHook(() => useDirectScreenplay());

    await act(async () => {
      await result.current.direct(BOARD, 1);
    });

    const prompt = String(
      (rpcRequest.mock.calls[0] as [string, Record<string, unknown>])[1].prompt
    );
    expect(prompt).toContain("Marta (character): red-haired keeper in an oilskin");
  });

  it("falls back to placeholder shots when the model returns no structure", async () => {
    // A provider without tool support answers prose; the board still fills in
    // with beats derived from the brief, as the Director node does.
    rpcRequest.mockResolvedValue({ text: "sorry", data: null });
    const { result } = renderHook(() => useDirectScreenplay());

    await act(async () => {
      await result.current.direct(BOARD, 3);
    });

    expect(result.current.error).toBeNull();
    const board = useStoryboardStore.getState().getBoard(BOARD);
    expect(board?.shots).toHaveLength(3);
    expect(board?.shots[0].action).toContain(
      "A lighthouse keeper loses the light."
    );
    // The cast block is prompt material, not shot text.
    expect(board?.shots[0].action).not.toContain("Cast & ingredients");
  });

  it("falls back when the answer parses to zero shots", async () => {
    rpcRequest.mockResolvedValue({ text: "", data: { title: "Empty", shots: [] } });
    const { result } = renderHook(() => useDirectScreenplay());

    await act(async () => {
      await result.current.direct(BOARD, 2);
    });

    expect(result.current.error).toBeNull();
    expect(useStoryboardStore.getState().getBoard(BOARD)?.shots).toHaveLength(2);
  });

  it("reports a provider error instead of inventing shots", async () => {
    rpcRequest.mockRejectedValue(new Error("model unavailable"));
    const { result } = renderHook(() => useDirectScreenplay());

    await act(async () => {
      await result.current.direct(BOARD, 3);
    });

    expect(result.current.error).toBe("model unavailable");
    expect(useStoryboardStore.getState().getBoard(BOARD)?.shots ?? []).toHaveLength(
      0
    );
  });

  it("refuses to spend when no model is picked", async () => {
    useStoryboardStore.getState().setDirectorModel(BOARD, null);
    const { result } = renderHook(() => useDirectScreenplay());

    await act(async () => {
      await result.current.direct(BOARD, 3);
    });

    expect(rpcRequest).not.toHaveBeenCalled();
    expect(result.current.error).toContain("Pick a model");
  });
});
