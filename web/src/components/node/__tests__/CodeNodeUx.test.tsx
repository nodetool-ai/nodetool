jest.mock("../../ui_primitives", () => {
  const actual = jest.requireActual("../../ui_primitives");
  return {
    ...actual,
    Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>
  };
});

jest.mock("../../../stores/ContextMenuStore", () => ({
  __esModule: true,
  default: (selector: (state: { openContextMenu: jest.Mock }) => unknown) =>
    selector({ openContextMenu: jest.fn() })
}));

jest.mock("../../../stores/LogStore", () => {
  const store = jest.fn();
  return {
    __esModule: true,
    default: store
  };
});

jest.mock("zustand/traditional", () => ({
  useStoreWithEqualityFn: () => []
}));

const mockUpdateNode = jest.fn();
const mockUpdateNodeData = jest.fn();

jest.mock("../../../contexts/NodeContext", () => ({
  useNodes: jest.fn((selector: (state: {
    updateNode: typeof mockUpdateNode;
    updateNodeData: typeof mockUpdateNodeData;
    workflow: { id: string };
  }) => unknown) =>
    selector({
      updateNode: mockUpdateNode,
      updateNodeData: mockUpdateNodeData,
      workflow: { id: "wf-1" }
    })
  )
}));

jest.mock("../../../config/data_types", () => ({
  IconForType: () => null
}));

jest.mock("../NodeLogs", () => ({
  NodeLogsDialog: () => null
}));

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NodeHeader from "../NodeHeader";
import {
  resolveCodeNodeTitle,
  resolveVisibleBasicFields
} from "../codeNodeUi";
import type { NodeData } from "../../../stores/NodeData";

function makeNodeData(overrides: Partial<NodeData> = {}): NodeData {
  return {
    properties: {},
    selectable: true,
    dynamic_properties: {},
    workflow_id: "wf-1",
    ...overrides
  };
}

describe("code node UI helpers", () => {
  it("uses the node title for code nodes when present", () => {
    expect(resolveCodeNodeTitle("nodetool.code.Code", "Conditional Switch", "Code")).toBe(
      "Conditional Switch"
    );
  });

  it("hides the code field from snippet code nodes by default", () => {
    expect(
      resolveVisibleBasicFields("nodetool.code.Code", ["code", "timeout"], {
        codeNodeMode: "snippet"
      } as NodeData)
    ).toEqual(["timeout"]);
  });
});

describe("NodeHeader code node title editing", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("allows manual code node titles to be edited inline", async () => {
    const user = userEvent.setup();
    render(
      <NodeHeader
        id="node-1"
        title="My Script"
        metadataTitle="Code"
        data={makeNodeData({ title: "My Script" })}
        isTitleEditable
        showCodeBadge
        codeBadgeTooltip="Code node"
      />
    );

    await user.dblClick(screen.getByText("My Script"));
    const input = screen.getByDisplayValue("My Script");
    await user.clear(input);
    await user.type(input, "Transform Text{enter}");

    expect(mockUpdateNodeData).toHaveBeenCalledWith("node-1", {
      title: "Transform Text"
    });
  });

  it("does not allow snippet code node titles to be edited", async () => {
    const user = userEvent.setup();
    render(
      <NodeHeader
        id="node-2"
        title="Conditional Switch"
        metadataTitle="Code"
        data={makeNodeData({
          title: "Conditional Switch",
          codeNodeMode: "snippet"
        })}
        isTitleEditable={false}
        showCodeBadge
        codeBadgeTooltip="Code node"
      />
    );

    await user.dblClick(screen.getByText("Conditional Switch"));

    expect(screen.queryByDisplayValue("Conditional Switch")).not.toBeInTheDocument();
    expect(mockUpdateNodeData).not.toHaveBeenCalled();
    expect(screen.getByText("C")).toBeInTheDocument();
  });
});
