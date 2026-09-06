/**
 * Step 2, review half (criteria 4 and 5): the screenplay renders as text with
 * no render job started, an edit here is the value the next step reads, a
 * Re-direct keeps the ids and media of the shots the revision retains, and an
 * imported script reads back verbatim however the Director answered.
 */
import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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
import { useDirectScreenplay } from "../../../../hooks/storyboard/useDirectScreenplay";
import {
  clearSetupReports,
  keepPreviousScreenplay
} from "../setupChoices";
import { useStoryboardStore } from "../../../../stores/storyboard/StoryboardStore";
import {
  clearImport,
  setImportSource
} from "../../../../lib/storyboard/importSource";
import { parseFdx } from "../../../../lib/storyboard/parseFdx";

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

/**
 * The flow owns the Director call and hands the step its wait, its reason and
 * its rewrite (F2). This is that wiring, so the step is exercised the way the
 * flow drives it.
 */
const Harness: React.FC<{ usedFallback?: boolean }> = ({
  usedFallback = false
}) => {
  const { direct, directing, error, acceptFallback } = useDirectScreenplay();
  return (
    <ReviewStep
      boardId={BOARD}
      onRewrite={() => {
        void direct(
          BOARD,
          useStoryboardStore.getState().getBoard(BOARD)?.shots.length ?? 0
        );
      }}
      rewriting={directing}
      error={error}
      usedFallback={usedFallback}
      onKeepFallback={acceptFallback}
      model={{ id: "claude-sonnet-5", provider: "anthropic" }}
      maxOutputTokens={8192}
    />
  );
};

const renderStep = (props: { usedFallback?: boolean } = {}) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <Harness {...props} />
    </ThemeProvider>
  );

const board = () => useStoryboardStore.getState().getBoard(BOARD);

beforeEach(() => {
  rpcRequest.mockReset();
  clearImport(BOARD);
  clearSetupReports(BOARD);
  useStoryboardStore.setState({ boards: {} } as never);
  seed();
});

describe("ReviewStep", () => {
  it("keeps the scene slugline out of repeated shot metadata", () => {
    const store = useStoryboardStore.getState();
    store.updateShot(BOARD, "shot-0", {
      slug: "EXT. HEADLAND — DUSK",
      duration_seconds: 2
    });
    renderStep();
    expect(
      screen.queryByText("EXT. HEADLAND — DUSK")
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Slugline")).toHaveValue(
      "EXT. HEADLAND — DUSK"
    );
  });

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
    expect(board()?.shots.every((shot) => shot.status === "planned")).toBe(
      true
    );
  });

  // A screenplay is long, and the scroll says nothing about its size.
  it("says how big the piece is, above the text", () => {
    renderStep();

    expect(screen.getByText(/2 shots · 1 scene/)).toBeInTheDocument();
  });

  // The retry belongs where a creator looks after reading the first shots,
  // not below twelve fields.
  it("offers exactly one Re-direct control", () => {
    renderStep();

    expect(
      screen.getAllByRole("button", { name: "Rewrite from brief" })
    ).toHaveLength(1);
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

    expect(
      screen.queryByLabelText("Shot 2 · Dialogue")
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add dialogue" }));
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

    await user.click(
      screen.getByRole("button", { name: "Rewrite from brief" })
    );

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

  // F20: the step claims everything on it is editable, so the duration is a
  // field, not a number the review only reports.
  it("writes a duration edit through updateShot", async () => {
    const user = userEvent.setup();
    renderStep();

    await user.type(screen.getByLabelText("Shot 2 · Seconds"), "4");

    expect(board()?.shots[1].duration_seconds).toBe(4);
    expect(board()?.shots[1].duration_source).toBe("manual");
  });

  // F9: a locally built outline says so, and the creator decides.
  it("names a locally written outline and offers both ways out", async () => {
    const user = userEvent.setup();
    renderStep({ usedFallback: true });

    expect(
      screen.getByText(/Written here, not by your model/)
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Keep this outline" })
    );
    expect(rpcRequest).not.toHaveBeenCalled();
  });

  // F15: a rewrite is undoable for as long as the tab is open.
  it("restores the screenplay a rewrite replaced", async () => {
    const user = userEvent.setup();
    keepPreviousScreenplay(BOARD, screenplay());
    useStoryboardStore.getState().updateShot(BOARD, "shot-0", {
      action: "Something else entirely"
    });
    renderStep();

    await user.click(
      screen.getByRole("button", { name: "Restore the previous screenplay" })
    );

    expect(board()?.shots[0].action).toBe("The keeper climbs the stair");
  });

  it("shows a failed Re-direct instead of losing the screenplay", async () => {
    const user = userEvent.setup();
    rpcRequest.mockRejectedValue(new Error("model unavailable"));
    renderStep();

    await user.click(
      screen.getByRole("button", { name: "Rewrite from brief" })
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "model unavailable"
    );
    expect(board()?.shots).toHaveLength(2);
    expect(board()?.setupStage).toBe("review");
  });
});

/**
 * Criterion 5. The board is one an FDX import produced, so a Re-direct runs
 * the camera pass — and this Director answers it by rewriting a line and
 * reversing the order, which is exactly what the post-check exists for.
 */
describe("ReviewStep — an imported FDX", () => {
  const parsed = () =>
    parseFdx(
      readFileSync(
        join(
          __dirname,
          "..",
          "..",
          "..",
          "..",
          "lib",
          "storyboard",
          "__fixtures__",
          "two-scenes.fdx"
        ),
        "utf8"
      )
    );

  const seedImport = (): ReturnType<typeof parsed> => {
    const parse = parsed();
    const store = useStoryboardStore.getState();
    store.setScreenplay(BOARD, {
      type: "screenplay",
      id: "fdx-1",
      title: "",
      shots: parse.shots,
      scenes: parse.scenes
    });
    setImportSource(BOARD, {
      kind: "fdx",
      fileName: "two-scenes.fdx",
      importedAt: "2026-01-01T00:00:00.000Z",
      preserveWords: true
    });
    return parse;
  };

  it("shows every imported line verbatim and in order", () => {
    seedImport();
    renderStep();

    // Each scene numbers its own shots, so the label repeats per scene.
    expect(screen.getAllByLabelText("Shot 2 · Dialogue")[0]).toHaveValue(
      "SOPHIA\n(under her breath)\nNot today. Not again."
    );
    expect(
      screen.getAllByLabelText("Slugline").map((el) => el.getAttribute("value"))
    ).toEqual([
      "INT. SOPHIA'S FLAT - HALLWAY - EARLY MORNING",
      "EXT. CANAL PATH - MINUTES LATER"
    ]);
  });

  it("restores a Director answer that rewrote a line, and names the shot", async () => {
    const user = userEvent.setup();
    const parse = seedImport();
    rpcRequest.mockResolvedValue({
      text: "",
      data: {
        shots: [...parse.shots].reverse().map((shot) => {
          const answer: Record<string, unknown> = {
            id: shot.id,
            camera: { framing: "wide", angle: "eye level", movement: "static" },
            motion: "Steady.",
            duration_seconds: 4
          };
          if (shot.id === "fdx-shot-2") {
            answer.dialogue = "Never again, I swear it.";
          }
          return answer;
        })
      }
    });
    renderStep();

    await user.click(
      screen.getByRole("button", { name: "Rewrite from brief" })
    );

    await waitFor(() =>
      expect(
        screen.getByText(/Your script was kept as written/)
      ).toBeInTheDocument()
    );
    const shots = board()?.shots ?? [];
    expect(shots.map((shot) => shot.id)).toEqual([
      "fdx-shot-1",
      "fdx-shot-2",
      "fdx-shot-3",
      "fdx-shot-4"
    ]);
    expect(shots[1].dialogue).toBe(
      "SOPHIA\n(under her breath)\nNot today. Not again."
    );
    // The camera work the Director was asked for is kept.
    expect(shots[1].camera?.framing).toBe("wide");
    expect(screen.getByRole("alert").textContent).toContain("Scene 1 | Shot 2");

    // The ask offered no place to write the words.
    const [, request] = rpcRequest.mock.calls[0] as [
      string,
      Record<string, unknown>
    ];
    expect(JSON.stringify(request.schema)).not.toContain("dialogue");
    expect(String(request.system)).toContain("never rewrite");
  });
});
