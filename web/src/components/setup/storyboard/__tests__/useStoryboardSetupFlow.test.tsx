/**
 * The storyboard flow config: three stepper entries for four stages, and a
 * last step that writes the terminal stage itself (PRD § 6.2, § 7.3).
 */
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import mockTheme from "../../../../__mocks__/themeMock";

jest.mock("../../../../hooks/storyboard/useStoryboards", () => ({
  useExampleStoryboards: () => ({ data: [], isLoading: false })
}));
jest.mock("../../../../hooks/useResolvedMediaUri");
jest.mock("../../../../serverState/useEntities", () => ({
  useEntities: () => ({ data: [], isLoading: false }),
  useSaveEntity: () => ({ mutateAsync: jest.fn() })
}));
jest.mock("../../../entities/EntityAssetPickerDialog", () => () => null);
jest.mock("../../../entities/EntityEditorDialog", () => () => null);
// The Director is the one model call in this flow. Its result decides whether
// the genre step advances, so the suite drives it directly; the hook also
// reaches the entity library through TanStack Query, which this suite does not
// stand up.
const direct = jest.fn(async () => true);
let directError: string | null = null;
const acceptFallback = jest.fn();
jest.mock("../../../../hooks/storyboard/useDirectScreenplay", () => ({
  useDirectScreenplay: () => ({
    direct,
    directing: false,
    usedFallback: false,
    acceptFallback,
    get error() {
      return directError;
    },
    // The flow reads the reason from the ref, which the real hook writes
    // before `direct` resolves.
    get errorRef() {
      return { current: directError };
    }
  })
}));

// The genre step's model picker reads the language-model catalog through
// TanStack Query. The picker itself is pinned by `GenreStep.test.tsx`; here it
// only has to render.
jest.mock("../../../../hooks/useModelsByProvider", () => ({
  __esModule: true,
  useLanguageModelsByProvider: () => ({
    models: [{ id: "catalog-model", provider: "openai", name: "Catalog" }],
    isLoading: false
  }),
  useImageModelsByProvider: () => ({
    models: [],
    isLoading: false
  })
}));

// The look step reaches the entity library, the style presets and the render
// cost estimate, all TanStack Query and tRPC, which this suite does not stand
// up. What it writes — stage `done` before the first job is enqueued — is
// pinned by `LookStep.test.tsx`; here the flow's job is to call it and then
// tell the host.
const generate = jest.fn(async () => {});
let renderPrice: string | undefined;
jest.mock("../LookStep", () => ({
  LookStep: () => null,
  useLookStep: () => ({
    canAdvance: true,
    primaryDetail: renderPrice,
    generate
  })
}));

import { useStoryboardStore } from "../../../../stores/storyboard/StoryboardStore";
import { clearSetupReports, directionFingerprint } from "../setupChoices";
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

const ReviewHarness = ({ onReviewed }: { onReviewed: () => Promise<void> }) => {
  const config = useStoryboardSetupFlow({ boardId: BOARD_ID, onReviewed });
  return <SetupFlow config={config} />;
};

// The genre step's model picker is a real component with its own queries.
const renderFlow = (onFinish?: () => void) =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false } }
        })
      }
    >
      <ThemeProvider theme={mockTheme}>
        <Harness onFinish={onFinish} />
      </ThemeProvider>
    </QueryClientProvider>
  );

const stageOf = () => useStoryboardStore.getState().boards[BOARD_ID].setupStage;

beforeEach(() => {
  generate.mockClear();
  renderPrice = undefined;
  useStoryboardStore.setState({ boards: {} });
  useStoryboardStore.getState().ensureBoard(BOARD_ID);
  direct.mockReset();
  direct.mockResolvedValue(true);
  directError = null;
  clearSetupReports(BOARD_ID);
});

/** Fill in what a step writes, so its primary button is pressable. */
const seedStepValues = () =>
  useStoryboardStore
    .getState()
    .setSetup(BOARD_ID, { brief: "a lamp at night", genre: "Drama" });

/**
 * What a Director run leaves behind. The review step will not advance to the
 * spending step over an empty screenplay (F20), and the run itself is mocked
 * out here, so a suite that starts at `review` seeds one.
 */
const seedScreenplay = () =>
  useStoryboardStore.getState().setScreenplay(BOARD_ID, {
    type: "screenplay",
    id: "sp1",
    title: "",
    shots: [
      { type: "shot", id: "s1", index: 0, action: "a lamp", status: "planned" }
    ]
  });

describe("useStoryboardSetupFlow", () => {
  // F23: the price is beside the button, not inside its name.
  it("puts the measured render price beside the spending button", () => {
    renderPrice = "6 stills · about $0.018";
    useStoryboardStore.getState().setSetup(BOARD_ID, { stage: "look" });
    renderFlow();
    expect(
      screen.getByRole("button", { name: "Generate your storyboard" })
    ).toBeEnabled();
    expect(
      screen.getByText("6 stills · about $0.018")
    ).toBeInTheDocument();
    expect(generate).not.toHaveBeenCalled();
  });

  // F23: the same summary every other flow shows before its planning call.
  it("names the model and the cost before the Director runs", async () => {
    seedStepValues();
    useStoryboardStore.getState().setDirectorModel(BOARD_ID, {
      type: "language_model",
      id: "gpt-5-mini",
      provider: "openai",
      name: "GPT-5 mini"
    });
    useStoryboardStore.getState().setSetup(BOARD_ID, { stage: "genre" });
    renderFlow();

    const summary = await screen.findByRole("region", {
      name: "Before you generate"
    });
    expect(summary).toHaveTextContent("GPT-5 mini");
    expect(summary).toHaveTextContent("Write a 6-shot screenplay");
    expect(summary).toHaveTextContent("No stills are rendered");
    expect(
      screen.getByRole("button", { name: "Generate screenplay" })
    ).toBeEnabled();
    expect(direct).not.toHaveBeenCalled();
  });

  // F15: back to genre, nothing changed — the button continues to the
  // screenplay the board already holds rather than paying for it twice.
  it("continues to an up-to-date screenplay instead of re-directing", async () => {
    const user = userEvent.setup();
    seedStepValues();
    const store = useStoryboardStore.getState();
    store.setDirectorModel(BOARD_ID, {
      type: "language_model",
      id: "catalog-model",
      provider: "openai",
      name: "Catalog"
    });
    store.setScreenplay(BOARD_ID, {
      type: "screenplay",
      id: "sp1",
      title: "",
      shots: [
        { type: "shot", id: "s1", index: 0, action: "a lamp", status: "planned" }
      ]
    });
    // What a Director run over these inputs would have recorded. The run
    // itself writes it; here the run is mocked out.
    store.setSetup(BOARD_ID, {
      directedFrom: directionFingerprint({
        brief: "a lamp at night",
        genre: "Drama",
        shotCount: 6,
        modelId: "catalog-model",
        importKind: "none"
      }),
      stage: "genre"
    });
    renderFlow();

    await user.click(
      screen.getByRole("button", { name: "Continue to your screenplay" })
    );

    expect(direct).not.toHaveBeenCalled();
    expect(stageOf()).toBe("review");
  });

  // F15's other half: a screenplay whose record does not answer the current
  // inputs offers the rewrite explicitly. Loading one clears that record, so
  // this is also what a board directed on another machine looks like.
  it("offers a re-direct when the record does not answer the inputs", async () => {
    const user = userEvent.setup();
    seedStepValues();
    act(() =>
      useStoryboardStore.getState().setScreenplay(BOARD_ID, {
        type: "screenplay",
        id: "sp1",
        title: "",
        shots: [
          {
            type: "shot",
            id: "s1",
            index: 0,
            action: "a lamp",
            status: "planned"
          }
        ]
      })
    );
    expect(
      useStoryboardStore.getState().getBoard(BOARD_ID)?.setupDirectedFrom
    ).toBeNull();
    useStoryboardStore.getState().setSetup(BOARD_ID, { stage: "genre" });
    renderFlow();

    await user.click(
      screen.getByRole("button", { name: "Re-direct your screenplay" })
    );
    expect(direct).toHaveBeenCalledTimes(1);
  });

  // F17: the count decides what the run writes and what it costs, so it
  // outlives the remount a stage change causes.
  it("keeps the requested shot count across a remount", async () => {
    const user = userEvent.setup();
    seedStepValues();
    useStoryboardStore.getState().setSetup(BOARD_ID, { stage: "genre" });
    const first = renderFlow();

    await user.click(screen.getByRole("combobox", { name: "Shots" }));
    await user.click(screen.getByRole("option", { name: "10 shots" }));
    first.unmount();

    renderFlow();
    await user.click(
      screen.getByRole("button", { name: "Generate screenplay" })
    );
    expect(direct).toHaveBeenCalledWith(BOARD_ID, 10);
  });

  it("shows entities as an optional step", () => {
    useStoryboardStore.getState().setSetup(BOARD_ID, { stage: "idea" });
    renderFlow();

    const steps = screen.getByRole("navigation", { name: "Setup steps" });
    expect(
      Array.from(steps.querySelectorAll("li")).map((item) => item.textContent)
    ).toEqual(["1. Idea", "2. Story", "3. Entities", "4. Look"]);
  });

  it("walks idea through entities to look", async () => {
    const user = userEvent.setup();
    seedStepValues();
    useStoryboardStore.getState().setSetup(BOARD_ID, { stage: "idea" });
    renderFlow();

    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(stageOf()).toBe("genre");

    await user.click(
      screen.getByRole("button", { name: "Generate screenplay" })
    );
    expect(direct).toHaveBeenCalledWith(BOARD_ID, 6);
    expect(stageOf()).toBe("review");

    // The mocked run writes no shots; the real one always does, and the review
    // step will not spend over an empty screenplay.
    act(() => seedScreenplay());
    await user.click(screen.getByRole("button", { name: "Set up entities" }));
    expect(stageOf()).toBe("entities");

    act(() => useStoryboardStore.getState().setEntityIds(BOARD_ID, ["mara"]));
    await user.click(screen.getByRole("button", { name: "Choose the look" }));
    expect(stageOf()).toBe("look");
  });

  it("lets the creator skip entities", async () => {
    const user = userEvent.setup();
    seedScreenplay();
    useStoryboardStore.getState().setSetup(BOARD_ID, { stage: "entities" });
    renderFlow();

    expect(screen.getByText("Keep people and places consistent")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose the look" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Skip entities" }));

    expect(stageOf()).toBe("look");
  });

  // PRD D9 / criterion 6: Studio's script comes from the screenplay the creator
  // reviewed. Extracting at the prompt would have used the Director's first
  // draft, so the call belongs to this step and nowhere earlier.
  it("extracts once, on leaving review, from the reviewed screenplay", async () => {
    const user = userEvent.setup();
    const onReviewed = jest.fn(async () => {});
    seedScreenplay();
    useStoryboardStore.getState().setSetup(BOARD_ID, { stage: "review" });
    render(
      <ThemeProvider theme={mockTheme}>
        <ReviewHarness onReviewed={onReviewed} />
      </ThemeProvider>
    );

    expect(onReviewed).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Set up entities" }));

    await waitFor(() => expect(onReviewed).toHaveBeenCalledTimes(1));
    expect(stageOf()).toBe("entities");
  });

  it("does not extract for a host that has no linked script", async () => {
    const user = userEvent.setup();
    seedScreenplay();
    useStoryboardStore.getState().setSetup(BOARD_ID, { stage: "review" });
    renderFlow();

    await user.click(screen.getByRole("button", { name: "Set up entities" }));
    await waitFor(() => expect(stageOf()).toBe("entities"));
  });

  it("writes done on the last step and tells the host", async () => {
    const user = userEvent.setup();
    const onFinish = jest.fn();
    useStoryboardStore.getState().setSetup(BOARD_ID, { stage: "look" });
    renderFlow(onFinish);

    await user.click(
      screen.getByRole("button", { name: /Generate your storyboard/ })
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
      screen.getByRole("button", { name: "Generate screenplay" })
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
      screen.getByRole("button", { name: "Generate screenplay" })
    ).toBeDisabled();
    expect(direct).not.toHaveBeenCalled();

    act(() =>
      useStoryboardStore.getState().setSetup(BOARD_ID, { genre: "Drama" })
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Generate screenplay" })
      ).toBeEnabled()
    );
  });
});
