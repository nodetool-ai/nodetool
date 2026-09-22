import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import { useNodeError } from "../../../hooks/nodes/useNodeExecState";
import { useNodeStoreRef } from "../../../contexts/NodeContext";
import useLogsStore from "../../../stores/LogStore";
import { createNodeStore } from "../../../stores/NodeStore";
import useWorkflowRunsStore from "../../../stores/WorkflowRunsStore";
import { useBottomPanelStore } from "../../../stores/BottomPanelStore";
import mockTheme from "../../../__mocks__/themeMock";
import NodeErrors from "../NodeErrors";

jest.mock("../../../hooks/nodes/useNodeExecState");
jest.mock("../../../contexts/NodeContext");

describe("NodeErrors log filtering", () => {
  beforeEach(() => {
    useLogsStore.setState({ logs: [], logsByNode: {}, filter: null });
    useWorkflowRunsStore.setState({
      runs: {},
      focusedJob: { "workflow-1": "job-1" },
      pinned: {}
    });
    useBottomPanelStore.setState((state) => ({
      ...state,
      panel: {
        ...state.panel,
        activeView: "trace",
        isVisible: false
      }
    }));
    jest.mocked(useNodeError).mockReturnValue("Provider failed");
    jest.mocked(useNodeStoreRef).mockReturnValue(createNodeStore());
  });

  it("opens Logs with the failing workflow, run, and node selected", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider theme={mockTheme}>
        <NodeErrors
          id="node-1"
          workflow_id="workflow-1"
          nodeType="nodetool.image.Generate"
        />
      </ThemeProvider>
    );

    await user.click(
      screen.getByRole("button", { name: "View logs for this node and run" })
    );

    expect(useLogsStore.getState().filter).toEqual({
      workflowId: "workflow-1",
      jobId: "job-1",
      nodeId: "node-1"
    });
    expect(useBottomPanelStore.getState().panel).toMatchObject({
      activeView: "logs",
      isVisible: true
    });
  });
});
