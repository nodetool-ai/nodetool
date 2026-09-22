import { focusActiveWorkflowEditor } from "../focusWorkflowEditor";

describe("focusActiveWorkflowEditor", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("skips selected nodes in inert tabs and focuses the active selected node", () => {
    const inactiveTab = document.createElement("div");
    inactiveTab.setAttribute("inert", "");
    const inactiveNode = document.createElement("div");
    inactiveNode.className = "react-flow__node selected";
    inactiveNode.tabIndex = -1;
    inactiveTab.append(inactiveNode);

    const activeTab = document.createElement("div");
    const activeNode = document.createElement("div");
    activeNode.className = "react-flow__node selected";
    activeNode.tabIndex = -1;
    activeTab.append(activeNode);
    document.body.append(inactiveTab, activeTab);

    expect(focusActiveWorkflowEditor()).toBe(true);
    expect(document.activeElement).toBe(activeNode);
  });

  it("falls back to the reachable canvas when no selected node can focus", () => {
    const inactiveNode = document.createElement("div");
    inactiveNode.setAttribute("inert", "");
    inactiveNode.className = "react-flow__node selected";
    const activePane = document.createElement("div");
    activePane.className = "react-flow__pane";
    document.body.append(inactiveNode, activePane);

    expect(focusActiveWorkflowEditor()).toBe(true);
    expect(document.activeElement).toBe(activePane);
    expect(activePane.tabIndex).toBe(-1);
  });
});
