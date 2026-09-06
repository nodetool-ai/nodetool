/**
 * The Workflow flow config: three stepper entries for four stages, resume by
 * stage, and the one gate this phase turns on — `Continue to setup` is disabled
 * while any step names a node type the registry does not have or needs a model
 * role no provider covers (PRD § 11.7 criteria 2, 3 and 4; D23).
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import type { WorkflowSetupPlan } from "@nodetool-ai/protocol/api-schemas/workflows.js";

import mockTheme from "../../../../__mocks__/themeMock";

// The planner is the one model call in this flow. The suite drives it directly:
// what it writes is pinned by `usePlanWorkflow.test.tsx`.
const planWorkflow = jest.fn(async () => true);
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
const managerState = {
  getWorkflow: () => ({ id: "w1", name: "W", settings, graph: null }),
  getNodeStore: () => undefined,
  updateWorkflow,
  saveWorkflow
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

import { writeWorkflowSetup } from "@nodetool-ai/protocol/api-schemas/workflows.js";
import { SetupFlow } from "../../SetupFlow";
import { useWorkflowSetupFlow } from "../useWorkflowSetupFlow";
import type { ModelRoleChoices } from "../SetupStep";
import type { BuildFromPlanInput } from "../../../../hooks/workflow/useBuildFromPlan";

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

const roleChoices = (role: string): ModelRoleChoices => ({
  role,
  tiles: [{ id: "p:m", title: "m", description: "p" }],
  selectedId: "p:m",
  onSelect: jest.fn()
});

const Harness = ({
  providerConfigured = () => true,
  onFinish
}: {
  providerConfigured?: (role: string) => boolean;
  onFinish?: () => void;
}) => {
  const config = useWorkflowSetupFlow({
    workflowId: "w1",
    plannerModel: { provider: "p", id: "m" },
    providerConfigured,
    modelChoices: roleChoices,
    chosenModel: () => ({ type: "language_model", id: "m" }),
    onStartFromExample: jest.fn(),
    onImport: jest.fn(async () => {}),
    onFinish
  });
  return <SetupFlow config={config} />;
};

const renderFlow = (props: Parameters<typeof Harness>[0] = {}) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <Harness {...props} />
    </ThemeProvider>
  );

beforeEach(() => {
  jest.clearAllMocks();
  planError = null;
  settings = {};
});

describe("useWorkflowSetupFlow", () => {
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
      { stage: stage as "idea", brief: "b", category: "content-pipeline", plan: PLAN }
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

  it("keeps Continue disabled until the brief has something in it", async () => {
    settings = writeWorkflowSetup({}, { stage: "idea", brief: "" });
    const { rerender } = renderFlow();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();

    await userEvent.type(screen.getByPlaceholderText("Summarize a PDF and email it"), "x");
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
    planWorkflow.mockResolvedValueOnce(false);
    planError = "no provider";
    renderFlow();
    await userEvent.click(
      screen.getByRole("button", { name: "Plan the steps" })
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("no provider");
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
