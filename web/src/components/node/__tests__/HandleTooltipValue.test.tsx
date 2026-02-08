import React from "react";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { create } from "zustand";
import type { Node } from "@xyflow/react";
import PropertyField from "../PropertyField";
import NodeOutput from "../NodeOutput";
import { NodeProvider } from "../../../contexts/NodeContext";
import useResultsStore from "../../../stores/ResultsStore";
import type { NodeData } from "../../../stores/NodeData";
import type { NodeStore } from "../../../stores/NodeStore";
import { HANDLE_TOOLTIP_ENTER_DELAY } from "../../HandleTooltip";

jest.mock("@xyflow/react", () => {
  const actual = jest.requireActual("@xyflow/react");
  return {
    ...actual,
    Handle: ({
      children,
      isConnectable,
      ...props
    }: React.HTMLAttributes<HTMLDivElement> & { isConnectable?: boolean }) => (
      <div data-testid="handle" {...props}>
        {children}
      </div>
    )
  };
});

jest.mock("../../../stores/ContextMenuStore", () => ({
  __esModule: true,
  default: (selector: (state: { openContextMenu: jest.Mock }) => unknown) =>
    selector({ openContextMenu: jest.fn() })
}));

jest.mock("../../../config/data_types", () => ({
  colorForType: () => "#000000",
  textColorForType: () => "#ffffff"
}));

jest.mock("../PropertyInput", () => ({
  __esModule: true,
  default: () => <div data-testid="property-input" />
}));

jest.mock("../PropertyLabel", () => ({
  __esModule: true,
  default: () => <div data-testid="property-label" />
}));

jest.mock("../OutputRenderer", () => ({
  __esModule: true,
  default: ({ value }: { value: unknown }) => <div>{String(value)}</div>
}));

const tooltipDelay = HANDLE_TOOLTIP_ENTER_DELAY;

const createNodeStore = (node: Node<NodeData>): NodeStore => {
  const store = create(() => ({
    findNode: (nodeId: string) => (nodeId === node.id ? node : undefined)
  }));
  const nodeStore = store as unknown as NodeStore;
  nodeStore.temporal = create(() => ({})) as unknown as NodeStore["temporal"];
  return nodeStore;
};

const renderTooltip = async (element: HTMLElement, user: ReturnType<typeof userEvent.setup>) => {
  await user.hover(element);
  act(() => {
    jest.advanceTimersByTime(tooltipDelay);
  });
};

const renderInputTooltip = async (
  value: unknown,
  user: ReturnType<typeof userEvent.setup>
) => {
  const { container } = render(
    <PropertyField
      id="node-1"
      value={value}
      nodeType="test"
      propertyIndex="0"
      property={{
        name: "prompt",
        type: { type: "string", type_args: [], optional: false },
        required: false
      }}
      showFields={false}
      showHandle={true}
      data={{
        properties: {},
        dynamic_properties: {},
        workflow_id: "workflow-1",
        selectable: true
      }}
    />
  );

  const wrapper = container.querySelector(".handle-tooltip-wrapper") as HTMLElement;
  expect(wrapper).toBeInTheDocument();

  await renderTooltip(wrapper, user);
};

const createOutputNode = () => {
  const node: Node<NodeData> = {
    id: "node-1",
    type: "test",
    position: { x: 0, y: 0 },
    data: {
      properties: {},
      dynamic_properties: {},
      workflow_id: "workflow-1",
      selectable: true
    }
  };
  return createNodeStore(node);
};

describe("HandleTooltip value rendering", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
      useResultsStore.getState().clearOutputResults("workflow-1");
      useResultsStore.getState().clearResults("workflow-1");
    });
    jest.useRealTimers();
  });

  it("shows the input value in the handle tooltip", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await renderInputTooltip("Hello input", user);

    expect(screen.getByText("Hello input")).toBeInTheDocument();
  });

  it.each([
    ["", "Empty string"],
    [[], "Empty list"],
    [{}, "Empty object"],
    [null, "null"]
  ])("shows fallback label for %p", async (value, label) => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await renderInputTooltip(value, user);

    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("shows the output value in the handle tooltip", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    useResultsStore
      .getState()
      .setOutputResult("workflow-1", "node-1", { greeting: "Hello output" });
    const store = createOutputNode();

    const { container } = render(
      <NodeProvider createStore={() => store}>
        <NodeOutput
          id="node-1"
          output={{
            name: "greeting",
            type: { type: "string", type_args: [], optional: false },
            stream: false
          }}
        />
      </NodeProvider>
    );

    const wrapper = container.querySelector(".handle-tooltip-wrapper") as HTMLElement;
    expect(wrapper).toBeInTheDocument();

    await renderTooltip(wrapper, user);

    expect(screen.getByText("Hello output")).toBeInTheDocument();
  });

  it("uses output field fallback when named output is missing", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    useResultsStore
      .getState()
      .setOutputResult("workflow-1", "node-1", { output: "Fallback output" });
    const store = createOutputNode();

    const { container } = render(
      <NodeProvider createStore={() => store}>
        <NodeOutput
          id="node-1"
          output={{
            name: "greeting",
            type: { type: "string", type_args: [], optional: false },
            stream: false
          }}
        />
      </NodeProvider>
    );

    const wrapper = container.querySelector(".handle-tooltip-wrapper") as HTMLElement;
    expect(wrapper).toBeInTheDocument();

    await renderTooltip(wrapper, user);

    expect(screen.getByText("Fallback output")).toBeInTheDocument();
  });

  it("uses raw result when output is a primitive", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    useResultsStore
      .getState()
      .setOutputResult("workflow-1", "node-1", "Raw result");
    const store = createOutputNode();

    const { container } = render(
      <NodeProvider createStore={() => store}>
        <NodeOutput
          id="node-1"
          output={{
            name: "greeting",
            type: { type: "string", type_args: [], optional: false },
            stream: false
          }}
        />
      </NodeProvider>
    );

    const wrapper = container.querySelector(".handle-tooltip-wrapper") as HTMLElement;
    expect(wrapper).toBeInTheDocument();

    await renderTooltip(wrapper, user);

    expect(screen.getByText("Raw result")).toBeInTheDocument();
  });
});
