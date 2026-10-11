/**
 * The Workflow host's hand-off at stage `done`. The shell has no step for
 * `done`, so the host is what opens the canvas, whoever wrote the stage.
 */
import { act, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../../__mocks__/themeMock";

const emptyModels = {
  models: [],
  isLoading: false,
  error: null,
  refetch: async () => {}
};
jest.mock("../../../../hooks/useModelsByProvider", () => ({
  useLanguageModelsByProvider: () => emptyModels,
  useImageModelsByProvider: () => emptyModels,
  useVideoModelsByProvider: () => emptyModels,
  useTTSModelsByProvider: () => emptyModels
}));
jest.mock("../../../../hooks/useRecommendedModelKeys", () => ({
  recommendedModelKey: () => "",
  useRecommendedModelKeys: () => []
}));
jest.mock("../../../../stores/GlobalChatStore", () => ({
  __esModule: true,
  default: (selector: (state: unknown) => unknown) =>
    selector({ selectedModel: null })
}));
jest.mock("../../../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManagerStore: () => ({ getState: () => ({}) })
}));
jest.mock("../../../../hooks/workflow/importWorkflowFile", () => ({
  importWorkflowGraph: jest.fn(),
  readWorkflowFile: jest.fn()
}));
jest.mock("../../../../hooks/workflow/useBuildFromPlan", () => ({
  isWorkflowBuildLive: () => false,
  readWorkflowBuild: () => null,
  workflowBuildResult: () => null
}));

let setup: { stage: string } | null = { stage: "idea" };
jest.mock("../../../../hooks/workflow/useWorkflowSetup", () => ({
  useWorkflowSetupDocument: () => setup
}));

// The flow itself is pinned by `useWorkflowSetupFlow.test.tsx`. Here it only
// reports a stage, whether a build runs, and the finish it was handed.
let flowStage = "idea";
let flowBuilding = false;
let flowFinish: ((result: null) => void) | undefined;
jest.mock("../useWorkflowSetupFlow", () => ({
  useWorkflowSetupFlow: (options: { onFinish: (result: null) => void }) => {
    flowFinish = options.onFinish;
    return {
      stage: flowStage,
      building: flowBuilding,
      cancelBuild: jest.fn(),
      steps: [],
      labels: { title: "Workflow" },
      onStageChange: jest.fn(),
      buildResult: null
    };
  }
}));
jest.mock("../../SetupFlow", () => ({
  SetupFlow: () => <div>setup flow</div>
}));

import WorkflowSetupHost from "../WorkflowSetupHost";

const onFinish = jest.fn();

const renderHost = () => {
  const ui = () => (
    <ThemeProvider theme={mockTheme}>
      <WorkflowSetupHost
        workflowId="w1"
        onStartFromExample={async () => null}
        onFinish={onFinish}
      />
    </ThemeProvider>
  );
  const view = render(ui());
  return { rerender: () => view.rerender(ui()) };
};

beforeEach(() => {
  jest.clearAllMocks();
  setup = { stage: "idea" };
  flowStage = "idea";
  flowBuilding = false;
  flowFinish = undefined;
});

describe("WorkflowSetupHost at stage done", () => {
  it("opens the workflow when the agent writes done while the tab is open", () => {
    const view = renderHost();
    expect(screen.getByText("setup flow")).toBeInTheDocument();

    // `ui_workflow_set_setup` or `ui_workflow_build_from_plan` wrote it.
    setup = { stage: "done" };
    flowStage = "done";
    view.rerender();

    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledWith(null);
    expect(screen.queryByText("setup flow")).not.toBeInTheDocument();
    expect(screen.getByText("Opening your workflow")).toBeInTheDocument();
  });

  it("hands off once when the flow finished itself", () => {
    const view = renderHost();
    setup = { stage: "done" };
    flowStage = "done";
    act(() => flowFinish?.(null));
    view.rerender();

    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it("waits for the build's own result while it checks and test-runs", () => {
    const view = renderHost();
    setup = { stage: "done" };
    flowStage = "done";
    flowBuilding = true;
    view.rerender();

    expect(onFinish).not.toHaveBeenCalled();
    expect(
      screen.getByText("Checking and test-running your workflow")
    ).toBeInTheDocument();
  });

  it("puts keyboard focus on Cancel when the build's wait replaces the flow", () => {
    const view = renderHost();
    setup = { stage: "done" };
    flowStage = "done";
    flowBuilding = true;
    view.rerender();

    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  });

  it("finishes a workflow that loaded as done", () => {
    setup = { stage: "done" };
    flowStage = "done";
    renderHost();

    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});
