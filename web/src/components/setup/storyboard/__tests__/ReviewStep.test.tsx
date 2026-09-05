/**
 * Step 2, review half (criterion 4): the screenplay renders as text with no
 * render job started, an edit here is the value the next step reads, and a
 * Re-direct keeps the ids and media of the shots the revision retains.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

const rpcRequest = jest.fn();
jest.mock("../../../../lib/websocket/rpcRequest", () => ({
  rpcRequest: (...args: unknown[]) => rpcRequest(...(args as [])),
  randomRequestId: () => "req-test"
}));

jest.mock("../../../../serverState/useEntities", () => ({
  useEntities: () => ({ data: [] })
}));

import type { Screenplay } from "@nodetool-ai/protocol";

import mockTheme from "../../../../__mocks__/themeMock";
import { ReviewStep } from "../ReviewStep";
import { useStoryboardStore } from "../../../../stores/storyboard/StoryboardStore";

const BOARD = "board-review";

const screenplay = (): Screenplay => ({
  type: "screenplay",
  id: "screenplay-1",
  title: "Dark Water",
  aspect_ratio: "16:9",
  scenes: [
    {
      type: "scene",
      id: "scene-0",
      slugline: "EXT. HEADLAND — DUSK",
      lighting: "Last light, sodium from the lamp room"
    }
  ],
  shots: [
    {
      type: "shot",
      id: "shot-0",
      index: 0,
      scene_id: "scene-0",
      action: "The keeper climbs the stair",
      dialogue: "Not tonight.",
      status: "planned"
    },
    {
      type: "shot",
      id: "shot-1",
      index: 1,
      scene_id: "scene-0",
      action: "Waves break on rock",
      status: "planned"
    }
  ]
});

const seed = (): void => {
  const store = useStoryboardStore.getState();
  store.ensureBoard(BOARD);
  store.setBrief(BOARD, "A lighthouse keeper loses the light.");
  store.setSetup(BOARD, { genre: "Drama", stage: "review" });
  store.setDirectorModel(BOARD, {
    type: "language_model",
    provider: "anthropic",
    id: "claude-sonnet-5"
  } as never);
  store.setScreenplay(BOARD, screenplay());
};

const renderStep = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ReviewStep boardId={BOARD} />
    </ThemeProvider>
  );

const board = () => useStoryboardStore.getState().getBoard(BOARD);

beforeEach(() => {
  rpcRequest.mockReset();
  useStoryboardStore.setState({ boards: {} } as never);
  seed();
});

describe("ReviewStep", () => {
  it("renders the screenplay as text and starts no render job", () => {
    renderStep();

    expect(screen.getByLabelText("Slugline")).toHaveValue(
      "EXT. HEADLAND — DUSK"
    );
    expect(screen.getByLabelText("Lighting")).toHaveValue(
      "Last light, sodium from the lamp room"
    );
    expect(screen.getByLabelText("Shot 1 · Action")).toHaveValue(
      "The keeper climbs the stair"
    );
    expect(screen.getByLabelText("Shot 1 · Dialogue")).toHaveValue(
      "Not tonight."
    );
    expect(screen.getByLabelText("Shot 2 · Action")).toHaveValue(
      "Waves break on rock"
    );

    expect(rpcRequest).not.toHaveBeenCalled();
    expect(board()?.shots.every((shot) => shot.status === "planned")).toBe(true);
  });

  // Criterion 4: the shot edited here is the shot step 3 renders.
  it("writes an action edit through updateShot", async () => {
    const user = userEvent.setup();
    renderStep();

    const action = screen.getByLabelText("Shot 2 · Action");
    await user.clear(action);
    await user.type(action, "Spray over the rail");

    expect(board()?.shots[1].action).toBe("Spray over the rail");
    expect(rpcRequest).not.toHaveBeenCalled();
  });

  it("writes a dialogue edit through updateShot", async () => {
    const user = userEvent.setup();
    renderStep();

    await user.type(screen.getByLabelText("Shot 2 · Dialogue"), "Hold fast.");

    expect(board()?.shots[1].dialogue).toBe("Hold fast.");
  });

  it("writes slugline and lighting through updateScene", async () => {
    const user = userEvent.setup();
    renderStep();

    await user.clear(screen.getByLabelText("Slugline"));
    await user.type(screen.getByLabelText("Slugline"), "EXT. JETTY — NIGHT");
    await user.clear(screen.getByLabelText("Lighting"));
    await user.type(screen.getByLabelText("Lighting"), "Moon only");

    const scene = board()?.screenplay?.scenes?.[0];
    expect(scene?.slugline).toBe("EXT. JETTY — NIGHT");
    expect(scene?.lighting).toBe("Moon only");
  });

  it("writes the title through setTitle", async () => {
    const user = userEvent.setup();
    renderStep();

    await user.type(screen.getByLabelText("Title"), " II");

    expect(board()?.title).toBe("Dark Water II");
  });

  // Criterion 4: Re-direct keeps the ids and media of shots the revision
  // retains — `setScreenplay` merges by shot id.
  it("keeps ids and media of retained shots on Re-direct", async () => {
    const user = userEvent.setup();
    useStoryboardStore.getState().setShotKeyframe(BOARD, "shot-0", {
      type: "image",
      uri: "asset://still-0"
    } as never);
    rpcRequest.mockResolvedValue({
      text: "",
      data: {
        title: "Dark Water",
        scenes: [{ id: "s1", slugline: "EXT. HEADLAND — NIGHT" }],
        shots: [
          { action: "The keeper reaches the lamp", scene_id: "s1" },
          { action: "The beam swings out", scene_id: "s1" }
        ]
      }
    });
    renderStep();

    await user.click(screen.getByRole("button", { name: "Re-direct" }));

    await waitFor(() => {
      expect(board()?.shots[0].action).toBe("The keeper reaches the lamp");
    });
    const shots = board()?.shots ?? [];
    expect(shots.map((shot) => shot.id)).toEqual(["shot-0", "shot-1"]);
    expect(shots[0].keyframe?.uri).toBe("asset://still-0");
    // The revision asked for the count the board already had.
    const [, request] = rpcRequest.mock.calls[0] as [
      string,
      Record<string, unknown>
    ];
    expect(String(request.prompt)).toContain("exactly 2 shots");
  });

  it("shows a failed Re-direct instead of losing the screenplay", async () => {
    const user = userEvent.setup();
    rpcRequest.mockRejectedValue(new Error("model unavailable"));
    renderStep();

    await user.click(screen.getByRole("button", { name: "Re-direct" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "model unavailable"
    );
    expect(board()?.shots).toHaveLength(2);
    expect(board()?.setupStage).toBe("review");
  });
});
