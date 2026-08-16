import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import type { Data } from "@puckeditor/core";
import type { AppDocMeta } from "@nodetool-ai/app-runtime";

import mockTheme from "../../../__mocks__/themeMock";
import type { Workflow } from "../../../stores/ApiTypes";
import type { AppDocument } from "../appData";

const setCurrentWorkflowId = jest.fn();

jest.mock("../../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: <T,>(
    selector: (state: { setCurrentWorkflowId: unknown }) => T
  ) => selector({ setCurrentWorkflowId })
}));

jest.mock("../../panels/FrontendToolRuntimeSync", () => ({
  __esModule: true,
  default: () => null
}));

jest.mock("../AppBuilderAgentPanel", () => ({
  __esModule: true,
  default: ({ workflowId }: { workflowId: string }) => (
    <div data-testid="agent-panel">{workflowId}</div>
  )
}));

/**
 * Stands in for Puck: a Save button that emits a layout the editor produced,
 * and a Meta button that mutates operations/resources/variables the way the
 * agent's `ui_app_*` tools do.
 */
const EDITED_UI: Data = {
  root: { props: { title: "Edited" } },
  content: [{ type: "Text", props: { id: "t1" } }],
  zones: {}
} as unknown as Data;

const EDITED_META: AppDocMeta = {
  operations: [
    {
      id: "main",
      name: "Run",
      workflowId: "wf-1",
      inputs: {},
      outputs: {},
      policy: "replace"
    }
  ],
  resources: [
    {
      id: "res-1",
      name: "Images",
      kind: "asset",
      scope: { projectId: "default" },
      operations: ["read"]
    }
  ],
  variables: [
    {
      id: "var-1",
      name: "count",
      type: { type: "int" },
      scope: "instance",
      persist: false
    }
  ]
};

jest.mock("../puck/PuckAppEditor", () => ({
  __esModule: true,
  default: ({
    onPublish,
    onMetaChange,
    onToggleAgent,
    onClose
  }: {
    onPublish: (data: Data) => void;
    onMetaChange?: (meta: AppDocMeta) => void;
    onToggleAgent?: () => void;
    onClose?: () => void;
  }) => (
    <div>
      <button type="button" onClick={() => onMetaChange?.(EDITED_META)}>
        Edit meta
      </button>
      <button type="button" onClick={() => onPublish(EDITED_UI)}>
        Save
      </button>
      <button
        type="button"
        onClick={() =>
          onPublish({
            ...EDITED_UI,
            root: { props: { ...EDITED_UI.root.props, theme: "card" } }
          } as unknown as Data)
        }
      >
        Save with theme
      </button>
      {onToggleAgent && (
        <button type="button" onClick={onToggleAgent}>
          Ask Agent
        </button>
      )}
      {onClose && (
        <button type="button" onClick={onClose}>
          Back
        </button>
      )}
    </div>
  )
}));

import AppBuilderShell from "../AppBuilderShell";

const workflow: Workflow = {
  id: "wf-1",
  name: "Workflow",
  description: "",
  graph: { nodes: [], edges: [] },
  access: "private",
  created_at: "",
  updated_at: ""
};

const document: AppDocument = {
  schemaVersion: 3,
  ui: { root: { props: { title: "Start" } }, content: [], zones: {} },
  operations: [],
  resources: [],
  variables: [],
  theme: { id: "dark" }
};

const renderShell = (onSave = jest.fn()) => {
  render(
    <ThemeProvider theme={mockTheme}>
      <AppBuilderShell
        applicationId="app-1"
        document={document}
        workflow={workflow}
        agentWorkflowId="wf-1"
        onSave={onSave}
      />
    </ThemeProvider>
  );
  return onSave;
};

/** The toggle Puck draws in its header — hidden behind a menu on narrow screens. */
const headerAgentToggle = () =>
  screen.getAllByRole("button", { name: "Ask Agent" })[0];

const originalMatchMedia = window.matchMedia;

/** Reports every query as matching (or not), standing in for the viewport width. */
const setNarrowViewport = (narrow: boolean) => {
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches: narrow,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn()
  })) as unknown as typeof window.matchMedia;
};

beforeEach(() => {
  jest.clearAllMocks();
  setNarrowViewport(false);
});

afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

describe("AppBuilderShell", () => {
  it("saves the whole document, not just the layout", async () => {
    const user = userEvent.setup();
    const onSave = renderShell();

    await user.click(screen.getByRole("button", { name: "Edit meta" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith({
      schemaVersion: 3,
      theme: { id: "dark" },
      ui: EDITED_UI,
      operations: EDITED_META.operations,
      resources: EDITED_META.resources,
      variables: EDITED_META.variables
    });
  });

  it("reports the operations upward as the agent binds them", async () => {
    const user = userEvent.setup();
    const onOperationsChange = jest.fn();
    render(
      <ThemeProvider theme={mockTheme}>
        <AppBuilderShell
          applicationId="app-1"
          document={document}
          workflow={workflow}
          agentWorkflowId="wf-1"
          onSave={jest.fn()}
          onOperationsChange={onOperationsChange}
        />
      </ThemeProvider>
    );

    // The seed first, so the parent starts from what the canvas actually holds.
    expect(onOperationsChange).toHaveBeenCalledWith([]);

    await user.click(screen.getByRole("button", { name: "Edit meta" }));

    // Then the bound operation, long before any save — this is what lets the
    // parent load wf-1's graph and answer the agent's binding targets.
    expect(onOperationsChange).toHaveBeenLastCalledWith(EDITED_META.operations);
  });

  it("writes the theme the author picked on the root back to the document", async () => {
    const user = userEvent.setup();
    const onSave = renderShell();

    await user.click(screen.getByRole("button", { name: "Save with theme" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ theme: { id: "card" } })
    );
  });

  it("points the agent's workflow tools at the bound workflow", () => {
    renderShell();

    expect(setCurrentWorkflowId).toHaveBeenCalledWith("wf-1");
  });

  it("opens the agent panel for the bound workflow", async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(headerAgentToggle());

    expect(screen.getByTestId("agent-panel")).toHaveTextContent("wf-1");
  });

  it("opens the agent from its own toggle on a narrow viewport", async () => {
    // Puck folds its header actions into a chevron menu below 638px, so the
    // shell renders a floating toggle that stays reachable there.
    setNarrowViewport(true);
    const user = userEvent.setup();
    renderShell();

    const toggles = screen.getAllByRole("button", { name: "Ask Agent" });
    expect(toggles).toHaveLength(2);

    await user.click(toggles[1]);

    expect(screen.getByTestId("agent-panel")).toHaveTextContent("wf-1");
    expect(
      screen.getByRole("button", { name: "Close agent" })
    ).toBeInTheDocument();
  });

  it("keeps the floating toggle off wide viewports, where Puck shows its own", () => {
    renderShell();

    expect(screen.getAllByRole("button", { name: "Ask Agent" })).toHaveLength(1);
  });

  it("offers the agent when no workflow is bound — it is what authors one", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <AppBuilderShell
          applicationId="app-1"
          document={document}
          workflow={workflow}
          onSave={jest.fn()}
        />
      </ThemeProvider>
    );

    expect(
      screen.getByRole("button", { name: "Ask Agent" })
    ).toBeInTheDocument();
    expect(setCurrentWorkflowId).not.toHaveBeenCalled();
  });
});
