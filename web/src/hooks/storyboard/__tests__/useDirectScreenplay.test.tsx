/**
 * @jest-environment jsdom
 *
 * Pins the Director's direct `generate_text` request: no workflow, no job row,
 * and the screenplay schema forced as structured output. The board's cast rides
 * in the brief so the model names entities exactly, which is what activates
 * them per shot.
 */
import { renderHook, act } from "@testing-library/react";

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
