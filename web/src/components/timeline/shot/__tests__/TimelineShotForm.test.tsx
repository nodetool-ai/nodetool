/**
 * The Shot tab's form, against the real storyboard store: Save writes only the
 * fields changed here, in one undo step, and leaves a field someone else
 * changed meanwhile alone.
 */
import React from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import type { Shot } from "@nodetool-ai/protocol";
import mockTheme from "../../../../__mocks__/themeMock";

import { useStoryboardStore } from "../../../../stores/storyboard/StoryboardStore";
import TimelineShotForm from "../TimelineShotForm";

const BOARD = "board-shot-form";

const SHOT: Shot = {
  type: "shot",
  id: "shot-1",
  index: 0,
  slug: "Lighthouse",
  action: "A lighthouse at dusk",
  dialogue: "Hold the light.",
  status: "rendered"
};

const loadBoard = (): void => {
  const store = useStoryboardStore.getState();
  store.ensureBoard(BOARD);
  store.loadBoard(BOARD, {
    screenplay: null,
    shots: [SHOT],
    title: "Board",
    brief: "",
    style: "",
    entityIds: [],
    aspectRatio: "16:9",
    setupStage: "done",
    genre: "",
    directorModel: null,
    imageModel: null,
    videoModel: null,
    activeShotId: null,
    timelineId: null
  });
};

const storedShot = (): Shot | undefined =>
  useStoryboardStore
    .getState()
    .boards[BOARD]?.shots.find((shot) => shot.id === SHOT.id);

const renderForm = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <TimelineShotForm boardId={BOARD} shot={storedShot() ?? SHOT} />
    </ThemeProvider>
  );

describe("TimelineShotForm", () => {
  beforeEach(loadBoard);
  afterEach(() => useStoryboardStore.getState().removeBoard(BOARD));

  it("saves the changed fields as one undo step", async () => {
    const user = userEvent.setup();
    renderForm();
    const save = screen.getByTestId("timeline-shot-form-save");
    expect(save).toBeDisabled();

    const description = screen.getByLabelText("Description");
    await user.clear(description);
    await user.type(description, "A lighthouse in a storm");
    await user.type(screen.getByLabelText("Length (s)"), "4");
    await user.click(save);

    expect(storedShot()?.action).toBe("A lighthouse in a storm");
    expect(storedShot()?.duration_seconds).toBe(4);
    expect(storedShot()?.duration_source).toBe("manual");
    expect(save).toBeDisabled();

    act(() => useStoryboardStore.getState().undo(BOARD));
    expect(storedShot()?.action).toBe("A lighthouse at dusk");
    expect(storedShot()?.duration_seconds).toBeUndefined();
  });

  it("keeps a field changed elsewhere that was not edited here", async () => {
    const user = userEvent.setup();
    renderForm();
    act(() =>
      useStoryboardStore
        .getState()
        .updateShot(BOARD, SHOT.id, { dialogue: "Changed on the board." })
    );

    const description = screen.getByLabelText("Description");
    await user.type(description, ", rain");
    await user.click(screen.getByTestId("timeline-shot-form-save"));

    expect(storedShot()?.action).toBe("A lighthouse at dusk, rain");
    expect(storedShot()?.dialogue).toBe("Changed on the board.");
  });
});
