import React from "react";
import { render } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import type { Graph } from "../../../stores/ApiTypes";

const reactFlowProps: Array<Record<string, unknown>> = [];
const backgroundProps: Array<Record<string, unknown>> = [];
jest.mock("@xyflow/react", () => ({
  ReactFlow: (props: Record<string, unknown> & { children?: React.ReactNode }) => {
    reactFlowProps.push(props);
    return <div data-testid="react-flow">{props.children}</div>;
  },
  ReactFlowProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Background: (props: Record<string, unknown>) => {
    backgroundProps.push(props);
    return null;
  },
  BackgroundVariant: { Cross: "cross" },
  useReactFlow: () => ({ fitView: jest.fn() }),
  useNodesInitialized: () => false
}));

import WorkflowGraphPreview from "../WorkflowGraphPreview";

const graph: Graph = {
  nodes: [
    {
      id: "out",
      type: "nodetool.output.Output",
      data: {},
      ui_properties: { position: { x: 0, y: 0 } }
    }
  ],
  edges: []
} as unknown as Graph;

const EDITOR_GRID = "#1F2126";
const EDITOR_BG = "#08090A";
const theme = {
  ...mockTheme,
  vars: {
    ...mockTheme.vars,
    palette: {
      ...mockTheme.vars.palette,
      c_editor_grid_color: EDITOR_GRID,
      c_editor_bg_color: EDITOR_BG
    }
  }
} as typeof mockTheme;

const renderPreview = () =>
  render(
    <ThemeProvider theme={theme}>
      <WorkflowGraphPreview graph={graph} workflowId="wf" />
    </ThemeProvider>
  );

describe("WorkflowGraphPreview", () => {
  beforeEach(() => {
    reactFlowProps.length = 0;
    backgroundProps.length = 0;
    document.documentElement.classList.remove("dark");
  });

  // An example opens in this read-only view. Without a color mode ReactFlow
  // falls back to its light defaults, so dark mode showed white nodes.
  it("follows dark mode like the editor canvas", () => {
    document.documentElement.classList.add("dark");
    const { unmount } = renderPreview();
    expect(reactFlowProps.at(-1)?.colorMode).toBe("dark");
    unmount();
  });

  it("follows light mode like the editor canvas", () => {
    renderPreview();
    expect(reactFlowProps.at(-1)?.colorMode).toBe("light");
  });

  it("draws the editor's grid and canvas colors", () => {
    renderPreview();
    const background = backgroundProps.at(-1);
    expect(background?.gap).toBe(25);
    expect(background?.color).toBe(EDITOR_GRID);
    expect(background?.style).toEqual({ backgroundColor: EDITOR_BG });
  });
});
