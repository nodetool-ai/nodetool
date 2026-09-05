/**
 * The storyboard flow config: three stepper entries for four stages, and a
 * last step that writes the terminal stage itself (PRD § 6.2, § 7.3).
 */
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../../__mocks__/themeMock";

jest.mock("../../../../hooks/storyboard/useStoryboards", () => ({
  useExampleStoryboards: () => ({ data: [], isLoading: false })
}));
jest.mock("../../../../hooks/useResolvedMediaUri");
// The Director is the one model call in this flow. Its result decides whether
// the genre step advances, so the suite drives it directly; the hook also
// reaches the entity library through TanStack Query, which this suite does not
// stand up.
const direct = jest.fn(async () => true);
let directError: string | null = null;
jest.mock("../../../../hooks/storyboard/useDirectScreenplay", () => ({
  useDirectScreenplay: () => ({
    direct,
    directing: false,
    get error() {
      return directError;
    }
  })
}));

// The look step reaches the entity library, the style presets and the render
// cost estimate, all TanStack Query and tRPC, which this suite does not stand
// up. What it writes — stage `done` before the first job is enqueued — is
// pinned by `LookStep.test.tsx`; here the flow's job is to call it and then
// tell the host.
const generate = jest.fn(async () => {});
jest.mock("../LookStep", () => ({
  LookStep: () => null,
  useLookStep: () => ({
    canAdvance: true,
    primaryDetail: undefined,
    generate
  })
}));

import { useStoryboardStore } from "../../../../stores/storyboard/StoryboardStore";
import { SetupFlow } from "../../SetupFlow";
import {
  newStoryboardSetupDocument,
  useStoryboardSetupFlow
} from "../useStoryboardSetupFlow";

const BOARD_ID = "b1";

const Harness = ({ onFinish }: { onFinish?: () => void }) => {
  const config = useStoryboardSetupFlow({ boardId: BOARD_ID, onFinish });
  return <SetupFlow config={config} />;
};

const renderFlow = (onFinish?: () => void) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <Harness onFinish={onFinish} />
    </ThemeProvider>
  );

const stageOf = () => useStoryboardStore.getState().boards[BOARD_ID].setupStage;

beforeEach(() => {
  generate.mockClear();
  useStoryboardStore.setState({ boards: {} });
  useStoryboardStore.getState().ensureBoard(BOARD_ID);
  direct.mockReset();
  direct.mockResolvedValue(true);
  directError = null;
});

/** Fill in what a step writes, so its primary button is pressable. */
const seedStepValues = () =>
  useStoryboardStore
    .getState()
    .setSetup(BOARD_ID, { brief: "a lamp at night", genre: "Drama" });

describe("useStoryboardSetupFlow", () => {
  it("collapses genre and review into one stepper entry", () => {
    useStoryboardStore.getState().setSetup(BOARD_ID, { stage: "idea" });
    renderFlow();

    const steps = screen.getByRole("navigation", { name: "Setup steps" });
    expect(
      Array.from(steps.querySelectorAll("li")).map((item) => item.textContent)
    ).toEqual(["1. Idea", "2. Story", "3. Storyboard"]);
  });

  it("walks idea to look, one stage per primary press", async () => {
    const user = userEvent.setup();
    seedStepValues();
    useStoryboardStore.getState().setSetup(BOARD_ID, { stage: "idea" });
    renderFlow();

    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(stageOf()).toBe("genre");

    await user.click(
      screen.getByRole("button", { name: "Review your screenplay" })
    );
    expect(direct).toHaveBeenCalledWith(BOARD_ID, 6);
    expect(stageOf()).toBe("review");

    await user.click(
      screen.getByRole("button", { name: "Continue to storyboard" })
    );
    expect(stageOf()).toBe("look");
  });

  it("writes done on the last step and tells the host", async () => {
    const user = userEvent.setup();
    const onFinish = jest.fn();
    useStoryboardStore.getState().setSetup(BOARD_ID, { stage: "look" });
    renderFlow(onFinish);

    await user.click(
      screen.getByRole("button", { name: "Generate your storyboard" })
    );

    // The stage write belongs to `useLookStep` (and its own suite proves it
    // lands before the first job is enqueued); the flow's part is to run it
    // and then hand the host its cue.
    expect(generate).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it("seeds a new board with the typed prompt and stage idea", () => {
    expect(newStoryboardSetupDocument("a lamp at night")).toMatchObject({
      brief: "a lamp at night",
      setupStage: "idea",
      shots: [],
      screenplay: null
    });
  });

  // Criterion 3's negative half: a refused Director run leaves the creator on
  // genre with the reason, rather than on an empty review step.
  it("stays on genre when the Director refuses", async () => {
    const user = userEvent.setup();
    seedStepValues();
    direct.mockResolvedValue(false);
    directError = "Pick a model before directing.";
    useStoryboardStore.getState().setSetup(BOARD_ID, { stage: "genre" });
    renderFlow();

    await user.click(
      screen.getByRole("button", { name: "Review your screenplay" })
    );

    expect(stageOf()).toBe("genre");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Pick a model before directing."
    );
  });

  it("holds each step's button until that step's value is written", async () => {
    const user = userEvent.setup();
    useStoryboardStore.getState().setSetup(BOARD_ID, { stage: "idea" });
    renderFlow();

    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    act(() =>
      useStoryboardStore
        .getState()
        .setSetup(BOARD_ID, { brief: "a lamp at night" })
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled()
    );

    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      screen.getByRole("button", { name: "Review your screenplay" })
    ).toBeDisabled();
    expect(direct).not.toHaveBeenCalled();

    act(() => useStoryboardStore.getState().setSetup(BOARD_ID, { genre: "Drama" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Review your screenplay" })
      ).toBeEnabled()
    );
  });
});
