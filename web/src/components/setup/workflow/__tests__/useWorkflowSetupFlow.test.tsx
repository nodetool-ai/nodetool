/**
 * The Workflow flow config: three stepper entries for four stages, resume by
 * stage, and the one gate this phase turns on — `Continue to setup` is disabled
 * while any step names a node type the registry does not have or needs a model
 * role no provider covers (PRD § 11.7 criteria 2, 3 and 4; D23).
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@mui/material/styles";
import type { WorkflowSetupPlan } from "@nodetool-ai/protocol/api-schemas/workflows.js";

import mockTheme from "../../../../__mocks__/themeMock";

// The planner is the one model call in this flow. The suite drives it directly:
// what it writes is pinned by `usePlanWorkflow.test.tsx`.
// Resolves null on success, the refusal's reason otherwise.
const planWorkflow = jest.fn(async (): Promise<string | null> => null);
let planError: string | null = null;
jest.mock("../../../../hooks/workflow/usePlanWorkflow", () => ({
  usePlanWorkflow: () => ({
    planWorkflow,
    planning: false,
    get error() {
      return planError;
    }
  })
}));

// The plan step's planner-model picker, reduced to one selectable model.
jest.mock("../../../model_menu/LanguageModelMenuDialog", () => ({
  __esModule: true,
  default: ({
    open,
    onModelChange
  }: {
    open: boolean;
    onModelChange?: (model: unknown) => void;
  }) =>
    open ? (
      <button
        type="button"
        onClick={() =>
          onModelChange?.({
            id: "gemini-3.6-flash",
            provider: "gemini",
            name: "Gemini 3.6 Flash"
          })
        }
      >
        pick gemini
      </button>
    ) : null
}));

// Typed with the real input, so `mock.calls[0][0]` is the argument the flow
// passed rather than an empty tuple.
const buildFromPlan = jest.fn(async (_input: BuildFromPlanInput) => ({
  nodeCount: 3,
  issues: [] as string[],
  validationErrors: [] as string[],
  testRun: { started: true, error: null as string | null }
}));
jest.mock("../../../../hooks/workflow/useBuildFromPlan", () => ({
  useBuildFromPlan: () => ({ buildFromPlan, building: false, result: null })
}));

// The document lives on the workflow row; the suite stands in for the manager
// store so the flow reads and writes the same `settings.setup` a server round
// trip would have left there.
let settings: Record<string, unknown> = {};
const saveWorkflow = jest.fn(async () => {});
const updateWorkflow = jest.fn((workflow: { settings: unknown }) => {
  settings = workflow.settings as Record<string, unknown>;
});
// Step 1's inline examples browser reads the same ["templates"] query the
// dashboard browser uses, so the flow needs the loader here too.
const loadTemplates = jest.fn(async () => ({
  workflows: [
    {
      id: "summarize.json",
      name: "Summarize a PDF",
      description: "Read a PDF and write a summary",
      tags: ["example"]
    },
    {
      id: "batch.json",
      name: "Batch product shots",
      description: "Render one image per CSV row",
      tags: ["example"]
    }
  ],
  next: null
}));
const managerState = {
  getWorkflow: () => ({ id: "w1", name: "W", settings, graph: null }),
  getNodeStore: () => undefined,
  updateWorkflow,
  saveWorkflow,
  loadTemplates
};
jest.mock("../../../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: (selector: (state: unknown) => unknown) =>
    selector(managerState),
  useWorkflowManagerStore: () => ({ getState: () => managerState })
}));

const metadata: Record<string, unknown> = {
  "nodetool.text.Template": { node_type: "nodetool.text.Template" }
};
jest.mock("../../../../stores/MetadataStore", () => ({
  __esModule: true,
  default: Object.assign(
    (selector: (state: unknown) => unknown) => selector({ metadata }),
    { getState: () => ({ metadata }) }
  )
}));

import {
  readWorkflowSetup,
  writeWorkflowSetup
} from "@nodetool-ai/protocol/api-schemas/workflows.js";
import { SetupFlow } from "../../SetupFlow";
import { useWorkflowSetupFlow } from "../useWorkflowSetupFlow";
import type { ModelRoleAvailability } from "../SetupStep";
import type { BuildFromPlanInput } from "../../../../hooks/workflow/useBuildFromPlan";
import type { Workflow } from "../../../../stores/ApiTypes";
import { WORKFLOW_CATEGORIES } from "../categories";

const PLAN: WorkflowSetupPlan = {
  inputs: [{ name: "text", type: "string", sample: "hello" }],
  steps: [
    {
      id: "s1",
      title: "Compose",
      summary: "lay it into the template",
      node_type: "nodetool.text.Template"
    }
  ],
  outputs: [{ name: "post", type: "string" }]
};

const roleChoices = (role: string): ModelRoleAvailability => ({
  role,
  tiles: [
    { id: "p:m", title: "m", description: "p" },
    { id: "p:other", title: "other", description: "p" }
  ],
  status: "ready",
  errorMessage: null,
  onRetry: jest.fn()
});

/** A plan whose one step needs a language model, so step 3 shows a tile row. */
const PLAN_WITH_ROLE: WorkflowSetupPlan = {
  ...PLAN,
  steps: [{ ...PLAN.steps[0], model_role: "language" }]
};

/** Every `(role, tileId)` the flow resolved a model for. */
const chosenModelCalls: [string, string | null][] = [];

/** Stands in for the host's copy: resolves where the example landed. */
const startFromExample = jest.fn(
  async (_example: Workflow): Promise<string | null> => "w1"
);

const Harness = ({
  providerConfigured = () => true,
  onFinish
}: {
  providerConfigured?: (role: string) => boolean;
  onFinish?: () => void;
}) => {
  const config = useWorkflowSetupFlow({
    workflowId: "w1",
    defaultPlannerModel: { provider: "p", id: "m" },
    providerConfigured,
    modelChoices: roleChoices,
    chosenModel: (role: string, tileId: string | null) => {
      chosenModelCalls.push([role, tileId]);
      return { type: "language_model", id: tileId };
    },
    onStartFromExample: startFromExample,
    onImport: jest.fn(async () => {}),
    onFinish
  });
  return <SetupFlow config={config} />;
};

// The plan step's planner-model picker reads the configured providers through
// TanStack Query, so the flow needs a client. The queries resolve to nothing
// here; the picker then shows its placeholder, which is what a machine with no
// provider sees.
const renderFlow = (props: Parameters<typeof Harness>[0] = {}) =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ThemeProvider theme={mockTheme}>
        <Harness {...props} />
      </ThemeProvider>
    </QueryClientProvider>
  );

beforeEach(() => {
  jest.clearAllMocks();
  planError = null;
  chosenModelCalls.length = 0;
  startFromExample.mockResolvedValue("w1");
  settings = {};
});

describe("useWorkflowSetupFlow", () => {
  it("names the plan being reviewed before Build, without running the planner", async () => {
    settings = writeWorkflowSetup(
      {},
      { stage: "category", brief: "A report", category: "content-pipeline" }
    );
    renderFlow();
    const summary = await screen.findByRole("region", {
      name: "Before you generate"
    });
    expect(summary).toHaveTextContent("inputs, processing steps and outputs");
    expect(summary).toHaveTextContent("Build places the nodes later");
    expect(summary).toHaveTextContent("Model: m (p)");
    expect(summary).toHaveTextContent("Cost estimate unavailable");
    expect(planWorkflow).not.toHaveBeenCalled();
  });

  it("opens on the idea step and shows three stepper entries", () => {
    settings = writeWorkflowSetup({}, { stage: "idea", brief: "" });
    renderFlow();
    expect(
      screen.getByRole("heading", { name: "What should this workflow do?" })
    ).toBeInTheDocument();
    expect(screen.getByText("1. Idea")).toBeInTheDocument();
    expect(screen.getByText("2. Plan")).toBeInTheDocument();
    expect(screen.getByText("3. Build")).toBeInTheDocument();
  });

  // Criterion 2: a workflow at each stage resumes at that step.
  it.each([
    ["idea", "What should this workflow do?"],
    ["category", "What kind of workflow?"],
    ["review", "Your plan"],
    ["setup", "Models and how it runs"]
  ])("resumes stage %s at its own step", (stage, heading) => {
    settings = writeWorkflowSetup(
      {},
      {
        stage: stage as "idea",
        brief: "b",
        category: "content-pipeline",
        plan: PLAN
      }
    );
    renderFlow();
    expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
  });

  // Criterion 2, second half: a workflow with no setup is not in the flow.
  it("renders nothing for a workflow with no settings.setup", () => {
    settings = { hide_ui: false };
    const { container } = renderFlow();
    expect(container).toBeEmptyDOMElement();
  });

  // PRD § 11.1: the examples browser is inline, and picking one is what copies
  // it. Opening the browser used to finish the flow on the spot, so the
  // creator came back to an empty canvas.
  describe("the inline examples browser", () => {
    const openBrowser = async () => {
      settings = writeWorkflowSetup({}, { stage: "idea", brief: "b" });
      renderFlow();
      await userEvent.click(
        screen.getByRole("button", { name: /Start from an example/ })
      );
      return screen.findByRole("heading", { name: "Start from an example" });
    };

    it("opens in the step, copies nothing, and finishes nothing", async () => {
      await openBrowser();
      expect(await screen.findByText("Summarize a PDF")).toBeInTheDocument();
      expect(startFromExample).not.toHaveBeenCalled();
      expect(readWorkflowSetup(settings)?.stage).toBe("idea");
      // The shell's own button cannot skip past an open browser.
      expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    });

    it("copies the picked example and then finishes", async () => {
      const onFinish = jest.fn();
      settings = writeWorkflowSetup({}, { stage: "idea", brief: "b" });
      renderFlow({ onFinish });
      await userEvent.click(
        screen.getByRole("button", { name: /Start from an example/ })
      );
      await userEvent.click(await screen.findByText("Summarize a PDF"));
      await waitFor(() => expect(startFromExample).toHaveBeenCalledTimes(1));
      expect(startFromExample.mock.calls[0][0].id).toBe("summarize.json");
      await waitFor(() =>
        expect(readWorkflowSetup(settings)?.stage).toBe("done")
      );
      expect(onFinish).toHaveBeenCalled();
    });

    it("stays in the flow when the copy is refused", async () => {
      startFromExample.mockRejectedValueOnce(new Error("example is missing"));
      const onFinish = jest.fn();
      settings = writeWorkflowSetup({}, { stage: "idea", brief: "b" });
      renderFlow({ onFinish });
      await userEvent.click(
        screen.getByRole("button", { name: /Start from an example/ })
      );
      await userEvent.click(await screen.findByText("Summarize a PDF"));
      expect(await screen.findByText("example is missing")).toBeInTheDocument();
      expect(onFinish).not.toHaveBeenCalled();
      expect(readWorkflowSetup(settings)?.stage).toBe("idea");
    });

    it("goes back to the idea with the brief intact", async () => {
      await openBrowser();
      await userEvent.click(
        screen.getByRole("button", { name: "Back to your idea" })
      );
      expect(
        screen.getByRole("heading", { name: "What should this workflow do?" })
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
      expect(readWorkflowSetup(settings)?.brief).toBe("b");
    });
  });

  it("keeps Continue disabled until the brief has something in it", async () => {
    settings = writeWorkflowSetup({}, { stage: "idea", brief: "" });
    const { rerender } = renderFlow();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();

    await userEvent.type(
      screen.getByPlaceholderText("Summarize a PDF and email it"),
      "x"
    );
    rerender(
      <ThemeProvider theme={mockTheme}>
        <Harness />
      </ThemeProvider>
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled()
    );
  });

  // Criterion 3: `Plan the steps` runs the planner and places nothing.
  it("runs the planner from the category step and places no node", async () => {
    settings = writeWorkflowSetup(
      {},
      { stage: "category", brief: "b", category: "content-pipeline" }
    );
    renderFlow();
    await userEvent.click(
      screen.getByRole("button", { name: "Plan the steps" })
    );
    await waitFor(() => expect(planWorkflow).toHaveBeenCalledTimes(1));
    expect(buildFromPlan).not.toHaveBeenCalled();
  });

  it("keeps the creator on the category step when the planner is refused", async () => {
    settings = writeWorkflowSetup(
      {},
      { stage: "category", brief: "b", category: "content-pipeline" }
    );
    // The reason arrives from the call itself. `planError` stays null here on
    // purpose: the hook sets it a render later, so a shell that read it saw
    // nothing and reported every refusal as a missing plan.
    planWorkflow.mockResolvedValueOnce("no provider");
    renderFlow();
    await userEvent.click(
      screen.getByRole("button", { name: "Plan the steps" })
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("no provider");
  });

  it("keeps the picked planner model on the workflow", async () => {
    settings = writeWorkflowSetup(
      {},
      { stage: "category", brief: "b", category: "content-pipeline" }
    );
    renderFlow();

    // The host's default is the first language model a provider offers; the
    // picker replaces it.
    await userEvent.click(screen.getByRole("button", { name: /^m$/ }));
    await userEvent.click(screen.getByRole("button", { name: "pick gemini" }));

    // On the workflow, so a reload plans with it rather than the default.
    expect(readWorkflowSetup(settings)?.planner_model).toEqual({
      provider: "gemini",
      id: "gemini-3.6-flash"
    });
  });

  it("plans with the stored model rather than the host's default", async () => {
    settings = writeWorkflowSetup(
      {},
      {
        stage: "category",
        brief: "b",
        category: "content-pipeline",
        planner_model: { provider: "gemini", id: "gemini-3.6-flash" }
      }
    );
    renderFlow();

    await userEvent.click(
      screen.getByRole("button", { name: "Plan the steps" })
    );
    await waitFor(() =>
      expect(planWorkflow).toHaveBeenCalledWith(
        expect.objectContaining({
          model: { provider: "gemini", id: "gemini-3.6-flash" }
        })
      )
    );
  });

  // Criterion 4, first half: an unknown node type blocks `Continue to setup`.
  it("disables Continue to setup while a step names a type the registry lacks", () => {
    settings = writeWorkflowSetup(
      {},
      {
        stage: "review",
        brief: "b",
        plan: {
          ...PLAN,
          steps: [{ ...PLAN.steps[0], node_type: "nodetool.made.Up" }]
        }
      }
    );
    renderFlow();
    expect(
      screen.getByRole("button", { name: "Continue to setup" })
    ).toBeDisabled();
  });

  // Criterion 4, second half: a missing provider blocks it too.
  it("disables Continue to setup while a needed provider is missing", () => {
    settings = writeWorkflowSetup(
      {},
      {
        stage: "review",
        brief: "b",
        plan: {
          ...PLAN,
          steps: [{ ...PLAN.steps[0], model_role: "language" }]
        }
      }
    );
    renderFlow({ providerConfigured: () => false });
    expect(
      screen.getByRole("button", { name: "Continue to setup" })
    ).toBeDisabled();
  });

  it("enables Continue to setup once both markers clear", () => {
    settings = writeWorkflowSetup(
      {},
      { stage: "review", brief: "b", plan: PLAN }
    );
    renderFlow();
    expect(
      screen.getByRole("button", { name: "Continue to setup" })
    ).toBeEnabled();
  });

  // F1: the build runs the workflow once (PRD § 11.3). The creator is told so
  // before the click, not afterwards on the landing checklist.
  it("says the build also runs it once, before Build is pressed", () => {
    settings = writeWorkflowSetup(
      {},
      { stage: "setup", brief: "b", plan: PLAN }
    );
    renderFlow();
    const disclosure = screen.getByRole("region", { name: "Before you build" });
    expect(disclosure).toHaveTextContent(
      "Build places the nodes and then runs it once"
    );
    expect(disclosure).toHaveTextContent("runs once with the sample inputs");
    expect(
      screen.getByText("Builds, checks, then runs it once")
    ).toBeInTheDocument();
    // The run-mode card cannot read as "nothing runs until you press run".
    expect(
      screen.getByText("After the test run, you open it and press run.")
    ).toBeInTheDocument();
  });

  // F15: coming back to the category with nothing changed keeps the plan.
  it("continues to the stored plan instead of re-planning when nothing changed", async () => {
    settings = writeWorkflowSetup(
      {},
      {
        stage: "category",
        brief: "b",
        category: "content-pipeline",
        plan: PLAN,
        plan_source: { brief: "b", category: "content-pipeline" }
      }
    );
    renderFlow();
    await userEvent.click(
      screen.getByRole("button", { name: "Continue to your plan" })
    );
    expect(planWorkflow).not.toHaveBeenCalled();
    expect(readWorkflowSetup(settings)?.stage).toBe("review");
  });

  it("offers an explicit re-plan once the brief has changed", () => {
    settings = writeWorkflowSetup(
      {},
      {
        stage: "category",
        brief: "something else",
        category: "content-pipeline",
        plan: PLAN,
        plan_source: { brief: "b", category: "content-pipeline" }
      }
    );
    renderFlow();
    expect(
      screen.getByRole("button", { name: "Re-plan the steps" })
    ).toBeInTheDocument();
  });

  // F15, second half: re-picking the category the creator is on keeps the run
  // mode they chose on the next step.
  it("keeps the chosen run mode when the same category is picked again", async () => {
    settings = writeWorkflowSetup(
      {},
      {
        stage: "category",
        brief: "b",
        category: "content-pipeline",
        run_mode: "trigger"
      }
    );
    renderFlow();
    await userEvent.click(
      screen.getByRole("radio", { name: /Content pipeline/ })
    );
    expect(readWorkflowSetup(settings)?.run_mode).toBe("trigger");
  });

  // F17: a role's model decides what the build places and what the test run
  // spends, so it lives on the workflow rather than in component state.
  it("keeps the picked role model on the workflow and builds with it", async () => {
    settings = writeWorkflowSetup(
      {},
      { stage: "setup", brief: "b", plan: PLAN_WITH_ROLE }
    );
    const { unmount } = renderFlow();
    await userEvent.click(screen.getByRole("radio", { name: /other/ }));
    expect(readWorkflowSetup(settings)?.["role_models"]).toEqual({
      language: "p:other"
    });

    // A remount reads it back rather than falling to whatever sorts first.
    unmount();
    renderFlow();
    await userEvent.click(
      screen.getByRole("button", { name: "Build your workflow" })
    );
    await waitFor(() => expect(buildFromPlan).toHaveBeenCalledTimes(1));
    expect(chosenModelCalls).toContainEqual(["language", "p:other"]);
  });

  // F20: the review lets a step be added and edited, so it can be left holding
  // an empty title. The build never reads one.
  it("holds Continue to setup while a step has no title", () => {
    settings = writeWorkflowSetup(
      {},
      {
        stage: "review",
        brief: "b",
        plan: { ...PLAN, steps: [{ ...PLAN.steps[0], title: "  " }] }
      }
    );
    renderFlow();
    expect(
      screen.getByRole("button", { name: "Continue to setup" })
    ).toBeDisabled();
    expect(
      screen.getByText("Give every step and output a name")
    ).toBeInTheDocument();
  });

  // F26: a mutually exclusive choice announces as one radio group with one
  // checked option. Three independent toggles say "three on/off controls",
  // which is a different question from the one the step is asking. Every grid
  // here goes through OptionCardGrid with a defined `selectedId`; these
  // assertions are what stops that from silently becoming navigation mode.
  describe("single-choice semantics", () => {
    it("makes the category a radio group with the chosen card checked", () => {
      settings = writeWorkflowSetup(
        {},
        { stage: "category", brief: "b", category: "media-batch" }
      );
      renderFlow();
      const group = screen.getByRole("radiogroup", {
        name: "Workflow category"
      });
      expect(within(group).getByRole("radio", { checked: true })).toHaveTextContent(
        "Media batch"
      );
      expect(within(group).getAllByRole("radio")).toHaveLength(
        WORKFLOW_CATEGORIES.length
      );
      expect(within(group).queryAllByRole("button", { pressed: true })).toEqual(
        []
      );
    });

    it("makes the run mode a radio group with the chosen card checked", () => {
      settings = writeWorkflowSetup(
        {},
        { stage: "setup", brief: "b", plan: PLAN, run_mode: "trigger" }
      );
      renderFlow();
      const group = screen.getByRole("radiogroup", { name: "Run mode" });
      expect(
        within(group).getByRole("radio", { checked: true })
      ).toHaveTextContent("On a trigger");
      expect(within(group).getAllByRole("radio")).toHaveLength(3);
    });

    it("makes a role's model tiles a radio group with the remembered model checked", () => {
      settings = writeWorkflowSetup(
        {},
        {
          stage: "setup",
          brief: "b",
          plan: PLAN_WITH_ROLE,
          role_models: { language: "p:other" }
        }
      );
      renderFlow();
      const group = screen.getByRole("radiogroup", { name: "Language model" });
      expect(
        within(group).getByRole("radio", { checked: true })
      ).toHaveTextContent("other");
    });

    // The examples browser is the one grid that is not a choice: each card
    // opens something, so it stays navigation and carries no checked state.
    it("leaves the examples browser as navigation, not a selection", async () => {
      settings = writeWorkflowSetup({}, { stage: "idea", brief: "b" });
      renderFlow();
      await userEvent.click(
        screen.getByRole("button", { name: /Start from an example/ })
      );
      await screen.findByText("Summarize a PDF");
      expect(
        screen.queryByRole("radiogroup", { name: "Example workflows" })
      ).toBeNull();
      expect(screen.queryAllByRole("button", { pressed: true })).toEqual([]);
    });
  });

  it("builds from the plan on the last step and tells the host", async () => {
    settings = writeWorkflowSetup(
      {},
      { stage: "setup", brief: "b", plan: PLAN }
    );
    const onFinish = jest.fn();
    renderFlow({ onFinish });
    await userEvent.click(
      screen.getByRole("button", { name: "Build your workflow" })
    );
    await waitFor(() => expect(buildFromPlan).toHaveBeenCalledTimes(1));
    expect(buildFromPlan.mock.calls[0][0]).toMatchObject({
      sampleInputs: { text: "hello" }
    });
    expect(onFinish).toHaveBeenCalled();
  });
});
