import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

const mockUseRunningTriggers = jest.fn();

jest.mock("../../../serverState/useTriggers", () => ({
  __esModule: true,
  useRunningTriggers: () => mockUseRunningTriggers()
}));

import { WorkflowTriggerIndicator } from "../WorkflowTriggerIndicator";

const renderIndicator = (workflowId = "wf-1") =>
  render(
    <ThemeProvider theme={mockTheme}>
      <WorkflowTriggerIndicator workflowId={workflowId} />
    </ThemeProvider>
  );

const running = (
  overrides: Partial<{
    id: string;
    workflow_id: string;
    enabled: boolean;
    last_error: string | null;
    disabled_reason: string | null;
  }> = {}
) => ({
  id: "reg-1",
  workflow_id: "wf-1",
  node_id: "n1",
  kind: "schedule",
  enabled: true,
  last_fired_at: null,
  last_error: null,
  ...overrides
});

beforeEach(() => {
  jest.clearAllMocks();
  mockUseRunningTriggers.mockReturnValue({ data: [] });
});

describe("WorkflowTriggerIndicator", () => {
  it("renders nothing while the query has not resolved", () => {
    mockUseRunningTriggers.mockReturnValue({ data: undefined });
    const { container } = renderIndicator();
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for a workflow with no armed trigger", () => {
    mockUseRunningTriggers.mockReturnValue({
      data: [running({ workflow_id: "wf-other" })]
    });
    const { container } = renderIndicator();
    expect(container).toBeEmptyDOMElement();
  });

  it("marks a workflow whose trigger is armed", () => {
    mockUseRunningTriggers.mockReturnValue({ data: [running()] });
    renderIndicator();
    expect(screen.getByRole("img", { name: "Trigger armed" })).toBeInTheDocument();
  });

  it("counts multiple armed registrations", () => {
    mockUseRunningTriggers.mockReturnValue({
      data: [running(), running({ id: "reg-2" })]
    });
    renderIndicator();
    expect(
      screen.getByRole("img", { name: "2 triggers armed" })
    ).toBeInTheDocument();
  });

  it("names the failure when a registration carries a last error", () => {
    mockUseRunningTriggers.mockReturnValue({
      data: [running({ last_error: "connection refused" })]
    });
    renderIndicator();
    expect(
      screen.getByRole("img", {
        name: "Trigger armed — last run failed: connection refused"
      })
    ).toBeInTheDocument();
  });

  it("says a trigger stopped itself, which armed-and-failing does not cover", () => {
    mockUseRunningTriggers.mockReturnValue({
      data: [
        running({
          enabled: false,
          disabled_reason: "failures",
          last_error: "connection refused"
        })
      ]
    });
    renderIndicator();
    expect(
      screen.getByRole("img", {
        name: "Disabled after 5 consecutive failures."
      })
    ).toBeInTheDocument();
  });
});
