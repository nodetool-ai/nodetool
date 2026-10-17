import React from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import { useSubgraphTabsStore } from "../../../stores/SubgraphTabsStore";
import SubgraphTabStrip from "../SubgraphTabStrip";

const mockSetState = jest.fn();
jest.mock("../../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManagerStore: () => ({ setState: mockSetState })
}));

const renderStrip = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <SubgraphTabStrip hostId="wf1" hostActiveKey={null} hostLabel="Workflow" />
    </ThemeProvider>
  );

describe("SubgraphTabStrip", () => {
  let subgraphKey = "";

  beforeEach(() => {
    mockSetState.mockClear();
    useSubgraphTabsStore.setState({ tabs: [], activeKey: null });
    act(() => {
      subgraphKey = useSubgraphTabsStore.getState().openTab({
        workflowId: "wf1",
        nodeId: "n1",
        label: "Inner",
        initialGraph: { nodes: [], edges: [] }
      });
    });
  });

  it("renders nothing while the host has no subgraph open", () => {
    useSubgraphTabsStore.setState({ tabs: [], activeKey: null });
    renderStrip();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });

  it("lists the host and its subgraphs as tabs, the shown one selected", () => {
    renderStrip();
    expect(
      screen.getByRole("tablist", { name: "Workflow and subgraph canvases" })
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Inner/ })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(screen.getByRole("tab", { name: "Workflow" })).toHaveAttribute(
      "aria-selected",
      "false"
    );
  });

  it("activates the host canvas from its tab", async () => {
    const user = userEvent.setup();
    renderStrip();
    await user.click(screen.getByRole("tab", { name: "Workflow" }));
    expect(useSubgraphTabsStore.getState().activeKey).toBeNull();
  });

  it("closes a subgraph tab from the keyboard and drops its store", async () => {
    const user = userEvent.setup();
    renderStrip();
    screen.getByRole("tab", { name: /Inner/ }).focus();
    await user.keyboard("{Delete}");
    expect(useSubgraphTabsStore.getState().tabs).toHaveLength(0);
    expect(mockSetState).toHaveBeenCalledTimes(1);
  });

  it("offers no close on the host tab", async () => {
    const user = userEvent.setup();
    renderStrip();
    expect(
      screen.queryByRole("button", { name: "Close Workflow" })
    ).not.toBeInTheDocument();
    screen.getByRole("tab", { name: "Workflow" }).focus();
    await user.keyboard("{Delete}");
    expect(useSubgraphTabsStore.getState().tabs.map((t) => t.key)).toEqual([
      subgraphKey
    ]);
  });

  it("closes a subgraph tab with its close button", async () => {
    const user = userEvent.setup();
    renderStrip();
    await user.click(screen.getByRole("button", { name: "Close Inner" }));
    expect(useSubgraphTabsStore.getState().tabs).toHaveLength(0);
  });
});
