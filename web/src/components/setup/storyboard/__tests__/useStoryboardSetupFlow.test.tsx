/**
 * The storyboard flow config: four stepper entries for five stages, and a
 * last step that writes the terminal stage itself (PRD § 6.2, § 7.3).
 */
import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { productionRequirement, type Entity } from "@nodetool-ai/protocol";
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
let directing = false;
const acceptFallback = jest.fn();
jest.mock("../../../../hooks/storyboard/useDirectScreenplay", () => ({
  useDirectScreenplay: () => ({
    direct,
    get directing() {
      return directing;
    },
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
  LookStep: ({ blockedReason }: { blockedReason?: string }) =>
    blockedReason ? (
      <div data-testid="look-blocker">{blockedReason}</div>
    ) : null,
  LookFooterControls: () => null,
  useLookStep: () => ({
    canAdvance: true,
    primaryDetail: renderPrice,
    generate
  })
}));

import { useStoryboardStore } from "../../../../stores/storyboard/StoryboardStore";
import {
  clearSetupReports,
  directionFingerprint,
  getPreviousScreenplay
} from "../setupChoices";
import { SetupFlow } from "../../SetupFlow";
import {
  newStoryboardSetupDocument,
  useStoryboardSetupFlow
} from "../useStoryboardSetupFlow";
import { productionReviewFingerprint } from "../../video/productionAuthoring";
import { setImportSource } from "../../../../lib/storyboard/importSource";

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
  directing = false;
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
  it("passes the reason for a disabled Look action into the step body", () => {
    seedScreenplay();
    useStoryboardStore.getState().setSetup(BOARD_ID, {
      stage: "look",
      creative_context: { schema_version: 1, tone: "Direct" }
    });

    renderFlow();

    expect(
      screen.getByRole("button", { name: "Generate your storyboard" })
    ).toBeDisabled();
    expect(screen.getByTestId("look-blocker")).toHaveTextContent(
      "Production context changed"
    );
  });

  it("does not block still generation for a legacy on-camera requirement", () => {
    seedScreenplay();
    const shot = useStoryboardStore.getState().getBoard(BOARD_ID)?.shots[0];
    if (!shot) {
      throw new Error("Expected a seeded shot.");
    }
    useStoryboardStore.getState().updateShot(BOARD_ID, shot.id, {
      production: productionRequirement.parse({
        speech_mode: "on_camera",
        speech_binding: { text: "Hello" }
      })
    });
    const board = useStoryboardStore.getState().getBoard(BOARD_ID);
    useStoryboardStore.getState().setSetup(BOARD_ID, {
      stage: "look",
      production_review_fingerprint: productionReviewFingerprint({
        brief: board?.brief ?? "",
        genre: board?.genre ?? "",
        creativeContext: board?.creativeContext,
        shots: board?.shots ?? []
      })
    });

    const { result } = renderHook(() =>
      useStoryboardSetupFlow({ boardId: BOARD_ID })
    );

    expect(result.current.steps[4].canAdvance).toBe(true);
    expect(result.current.steps[4].blockedReason).toBeUndefined();
  });

  it("persists production review and requires another review after context changes", async () => {
    seedStepValues();
    seedScreenplay();
    useStoryboardStore.getState().setSetup(BOARD_ID, {
      creative_context: { schema_version: 1, tone: "Direct" }
    });
    const hook = renderHook(() =>
      useStoryboardSetupFlow({ boardId: BOARD_ID })
    );
    expect(hook.result.current.steps[4].blockedReason).toContain(
      "Production context changed"
    );
    await act(async () => hook.result.current.steps[2].onAdvance?.());
    expect(hook.result.current.steps[4].canAdvance).toBe(true);
    hook.unmount();
    const resumed = renderHook(() =>
      useStoryboardSetupFlow({ boardId: BOARD_ID })
    );
    expect(resumed.result.current.steps[4].canAdvance).toBe(true);
    act(() =>
      useStoryboardStore.getState().setSetup(BOARD_ID, {
        creative_context: { schema_version: 1, tone: "Playful" }
      })
    );
    expect(resumed.result.current.steps[4].blockedReason).toContain(
      "Production context changed"
    );
    await expect(resumed.result.current.steps[4].onAdvance?.()).rejects.toThrow(
      "Production context changed"
    );
    expect(generate).not.toHaveBeenCalled();
  });
  it("keeps a reviewed plan reviewed when entities and a style are picked", async () => {
    seedStepValues();
    seedScreenplay();
    useStoryboardStore.getState().setSetup(BOARD_ID, {
      creative_context: { schema_version: 1, tone: "Direct" }
    });
    const hook = renderHook(() =>
      useStoryboardSetupFlow({ boardId: BOARD_ID })
    );
    await act(async () => hook.result.current.steps[2].onAdvance?.());
    expect(hook.result.current.steps[4].canAdvance).toBe(true);

    const style: Entity = {
      type: "entity",
      id: "e-noir",
      kind: "style",
      name: "Noir",
      descriptor: "high-contrast noir"
    };
    act(() => {
      const store = useStoryboardStore.getState();
      // What the entities step writes for one pick, and the look step for a
      // style tile.
      store.setEntityIds(BOARD_ID, ["e-marta"]);
      store.updateShot(BOARD_ID, "s1", { entity_ids: ["e-marta"] });
      store.setStylePreset(BOARD_ID, "e-noir", [style]);
    });

    expect(
      useStoryboardStore.getState().getBoard(BOARD_ID)?.shots[0].entity_ids
    ).toEqual(["e-marta", "e-noir"]);
    expect(hook.result.current.steps[4].canAdvance).toBe(true);
    expect(hook.result.current.steps[4].blockedReason).toBeUndefined();
  });

  // F23: the price is beside the button, not inside its name.
  it("puts the measured render price beside the spending button", () => {
    renderPrice = "6 stills · about $0.018";
    useStoryboardStore.getState().setSetup(BOARD_ID, { stage: "look" });
    renderFlow();
    expect(
      screen.getByRole("button", { name: "Generate your storyboard" })
    ).toBeEnabled();
    expect(screen.getByText("6 stills · about $0.018")).toBeInTheDocument();
    expect(generate).not.toHaveBeenCalled();
  });

  // F23: the model and the cost sit beside the button before the Director runs.
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

    const summary = await screen.findByRole("group", {
      name: "Before you generate"
    });
    expect(summary).toHaveTextContent(/\$.*30–60s/);
    expect(summary).toHaveAttribute(
      "title",
      expect.stringContaining("Write a 6-shot screenplay")
    );
    const settings = screen.getByRole("group", {
      name: "Generation settings"
    });
    expect(settings).toHaveTextContent(/gpt-5-mini|GPT-5 mini/);
    expect(
      within(settings).getByRole("combobox", { name: "Shots" })
    ).toHaveTextContent("6 shots");
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
        {
          type: "shot",
          id: "s1",
          index: 0,
          action: "a lamp",
          status: "planned"
        }
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
    expect(direct).toHaveBeenCalledWith(BOARD_ID, 10, expect.any(AbortSignal));
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
    expect(direct).toHaveBeenCalledWith(BOARD_ID, 6, expect.any(AbortSignal));
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

    expect(
      screen.getByText("Keep people and places consistent")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Choose the look" })
    ).toBeDisabled();
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

  // The host's extraction writes a linked script, so the shell must neither
  // offer a Cancel that claims the draft is unchanged nor call the wait a
  // rewrite.
  it("names the extraction wait and offers no Cancel during it", async () => {
    const user = userEvent.setup();
    let release: () => void = () => undefined;
    const onReviewed = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        })
    );
    seedScreenplay();
    useStoryboardStore.getState().setSetup(BOARD_ID, { stage: "review" });
    render(
      <ThemeProvider theme={mockTheme}>
        <ReviewHarness onReviewed={onReviewed} />
      </ThemeProvider>
    );

    await user.click(screen.getByRole("button", { name: "Set up entities" }));
    await waitFor(() => expect(onReviewed).toHaveBeenCalledTimes(1));

    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
    expect(screen.queryByText(/Rewriting/)).toBeNull();
    expect(
      screen.getAllByText("Saving your screenplay").length
    ).toBeGreaterThan(0);

    await act(async () => release());
    await waitFor(() => expect(stageOf()).toBe("entities"));
  });

  it("shows the review step only the failure of its own rewrite", async () => {
    seedScreenplay();
    const { result } = renderHook(() =>
      useStoryboardSetupFlow({ boardId: BOARD_ID })
    );
    const reviewBody = () =>
      result.current.steps
        .find((step) => step.stage === "review")
        ?.render() as {
        props: { error: string | null; onRewrite: () => void };
      };

    // A re-direct refused on the genre step, then stepped past.
    directError = "Your provider is out of credits.";
    direct.mockResolvedValue(false);
    const genre = result.current.steps.find((step) => step.stage === "genre");
    await act(async () => {
      await Promise.resolve(
        genre?.onAdvance?.({ signal: new AbortController().signal })
      ).catch(() => undefined);
    });
    expect(reviewBody().props.error).toBeNull();

    // The review step's own rewrite fails: that one is shown.
    await act(async () => reviewBody().props.onRewrite());
    expect(reviewBody().props.error).toBe("Your provider is out of credits.");
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

  // F16: `Rewrite from brief` runs outside the shell's button, so the review
  // step's Cancel has to reach it.
  it("cancels a rewrite from the review step", () => {
    directing = true;
    const { result } = renderHook(() =>
      useStoryboardSetupFlow({ boardId: BOARD_ID })
    );
    const review = result.current.steps.find((step) => step.stage === "review");
    const body = review?.render() as {
      props: { onRewrite: () => void };
    };
    act(() => {
      body.props.onRewrite();
    });
    const signal = (direct.mock.calls[0] as unknown[])[2] as
      | AbortSignal
      | undefined;
    expect(signal?.aborted).toBe(false);
    act(() => {
      void review?.onCancel?.();
    });
    expect(signal?.aborted).toBe(true);
  });

  it("asks for and names the board's own length when rewriting", () => {
    seedScreenplay();
    directing = true;
    const { result } = renderHook(() =>
      useStoryboardSetupFlow({ boardId: BOARD_ID })
    );
    const review = result.current.steps.find((step) => step.stage === "review");
    const body = review?.render() as {
      props: { onRewrite: () => void };
    };
    act(() => {
      body.props.onRewrite();
    });

    expect(direct).toHaveBeenCalledWith(BOARD_ID, 1, expect.any(AbortSignal));
    expect(review?.pendingLabel).toBe("Rewriting 1 shot");
  });

  // F15: the undo belongs to a rewrite that replaced something. A failed or
  // canceled run replaced nothing, so the earlier undo stays as it was.
  it("keeps the undo snapshot only when a rewrite lands", async () => {
    seedScreenplay();
    const { result } = renderHook(() =>
      useStoryboardSetupFlow({ boardId: BOARD_ID })
    );
    const rewrite = (): void => {
      const review = result.current.steps.find(
        (step) => step.stage === "review"
      );
      const body = review?.render() as {
        props: { onRewrite: () => void };
      };
      body.props.onRewrite();
    };

    direct.mockResolvedValue(false);
    await act(async () => rewrite());
    expect(getPreviousScreenplay(BOARD_ID)).toBeUndefined();

    direct.mockResolvedValue(true);
    await act(async () => rewrite());
    expect(getPreviousScreenplay(BOARD_ID)?.shots[0].action).toBe("a lamp");
  });

  // F9: a creation started on the entities step holds the step until it
  // lands, and the step's Cancel aborts it.
  it("holds the entities step while an entity is created", () => {
    const { result } = renderHook(() =>
      useStoryboardSetupFlow({ boardId: BOARD_ID })
    );
    const entitiesStep = () =>
      result.current.steps.find((step) => step.stage === "entities");
    expect(entitiesStep()?.pending).toBe(false);
    const body = entitiesStep()?.render() as {
      props: {
        onCreationStart: () => { signal: AbortSignal; done: () => void };
      };
    };
    let creation: { signal: AbortSignal; done: () => void } | undefined;
    act(() => {
      creation = body.props.onCreationStart();
    });
    expect(entitiesStep()?.pending).toBe(true);
    act(() => {
      void entitiesStep()?.onCancel?.();
    });
    expect(creation?.signal.aborted).toBe(true);
    act(() => {
      creation?.done();
    });
    expect(entitiesStep()?.pending).toBe(false);
  });
  // F9: Continue waits for a file being read, which would otherwise land on
  // a step that had moved on and be dropped.
  it("holds the idea step while a file is read", () => {
    seedStepValues();
    const { result } = renderHook(() =>
      useStoryboardSetupFlow({ boardId: BOARD_ID })
    );
    const idea = () =>
      result.current.steps.find((step) => step.stage === "idea");
    expect(idea()?.canAdvance).toBe(true);
    const body = idea()?.render() as {
      props: { onImportingChange: (importing: boolean) => void };
    };

    act(() => body.props.onImportingChange(true));
    expect(idea()?.canAdvance).toBe(false);
    expect(idea()?.blockedReason).toBe("Reading your file");

    act(() => body.props.onImportingChange(false));
    expect(idea()?.canAdvance).toBe(true);
  });

  // F12: a shotlist is the plan the creator wrote. Creative context typed
  // before the import must not hold Look behind a review nobody can reach.
  it("lands a shotlist import on Look without asking for a review", async () => {
    const user = userEvent.setup();
    useStoryboardStore.getState().setSetup(BOARD_ID, {
      stage: "idea",
      creative_context: { schema_version: 1, tone: "Direct" }
    });
    renderFlow();
    const csv = "scene,description\nINT. HALL,A door opens\n";
    const file = new File([csv], "clean.csv", { type: "text/csv" });
    Object.defineProperty(file, "text", { value: () => Promise.resolve(csv) });

    await user.upload(screen.getByLabelText("Import your shotlist"), file);

    await waitFor(() => expect(stageOf()).toBe("look"));
    expect(screen.queryByTestId("look-blocker")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Generate your storyboard" })
    ).toBeEnabled();
  });

  // F13: a script kept as written gets a camera pass over its own shots,
  // which asks for less and has no length to pick.
  it("names and prices the camera pass over a kept script", () => {
    seedStepValues();
    useStoryboardStore.getState().setScreenplay(BOARD_ID, {
      type: "screenplay",
      id: `fdx-${BOARD_ID}`,
      title: "",
      shots: [0, 1, 2].map((index) => ({
        type: "shot" as const,
        id: `fdx-shot-${index}`,
        index,
        action: `beat ${index}`,
        status: "planned" as const
      }))
    });
    setImportSource(BOARD_ID, {
      kind: "fdx",
      fileName: "script.fdx",
      importedAt: "2026-01-01T00:00:00.000Z",
      preserveWords: true
    });
    const { result } = renderHook(() =>
      useStoryboardSetupFlow({ boardId: BOARD_ID })
    );
    const genre = result.current.steps.find((step) => step.stage === "genre");

    expect(genre?.pendingLabel).toBe("Directing 3 shots");
    expect(genre?.generation?.result).toBe(
      "Add camera direction to your 3-shot script"
    );
    expect(genre?.generation?.maxOutputTokens).toBe(4096);
    const footer = genre?.footerControls?.({ readOnly: false }) as {
      props: { hideShotCount?: boolean };
    };
    expect(footer.props.hideShotCount).toBe(true);
    const genreBody = genre?.render() as { props: { cameraPass?: boolean } };
    expect(genreBody.props.cameraPass).toBe(true);
    // The review step's re-run is the same camera pass, priced the same way.
    const review = result.current.steps.find((step) => step.stage === "review");
    const reviewBody = review?.render() as {
      props: { maxOutputTokens: number };
    };
    expect(reviewBody.props.maxOutputTokens).toBe(4096);
  });

  // The camera pass directs every imported shot, past the 20 a rewrite may
  // ask for, so its wait names the script's own count.
  it("names the camera pass's wait by every shot it directs", () => {
    seedStepValues();
    useStoryboardStore.getState().setScreenplay(BOARD_ID, {
      type: "screenplay",
      id: `fdx-${BOARD_ID}`,
      title: "",
      shots: Array.from({ length: 25 }, (_, index) => ({
        type: "shot" as const,
        id: `fdx-shot-${index}`,
        index,
        action: `beat ${index}`,
        status: "planned" as const
      }))
    });
    setImportSource(BOARD_ID, {
      kind: "fdx",
      fileName: "script.fdx",
      importedAt: "2026-01-01T00:00:00.000Z",
      preserveWords: true
    });
    directing = true;
    const { result } = renderHook(() =>
      useStoryboardSetupFlow({ boardId: BOARD_ID })
    );
    const label = (stage: string) =>
      result.current.steps.find((step) => step.stage === stage)?.pendingLabel;

    expect(label("genre")).toBe("Directing 25 shots");
    expect(label("review")).toBe("Directing 25 shots");
  });

  // F16: the shell no longer disables the step body in view mode, so each
  // step holds its own fields.
  it("hands view mode to the idea and review bodies", () => {
    seedScreenplay();
    const { result } = renderHook(() =>
      useStoryboardSetupFlow({ boardId: BOARD_ID })
    );
    for (const stage of ["idea", "genre", "review", "entities", "look"]) {
      const step = result.current.steps.find((item) => item.stage === stage);
      const body = step?.render({ readOnly: true }) as {
        props: { readOnly?: boolean };
      };
      expect([stage, body.props.readOnly]).toEqual([stage, true]);
    }
  });
});
