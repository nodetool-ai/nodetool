import { stub } from "../../../test-utils/doubles";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import type { Data, DefaultComponents } from "@puckeditor/core";
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

/**
 * The layout Puck emits once the author has picked a theme: the shell seeds
 * the theme id onto the root as a field, so it rides back in the root props
 * that Puck's own `Data` does not declare.
 */
type ThemedData = Data<DefaultComponents, { title?: string; theme: string }>;

/**
 * Stands in for Puck: a Save button that emits a layout the editor produced,
 * and a Meta button that mutates operations/resources/variables the way the
 * agent's `ui_app_*` tools do.
 */
const EDITED_UI: Data = stub<Data>({
  root: { props: { title: "Edited" } },
  content: [{ type: "Text", props: { id: "t1" } }],
  zones: {}
});

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
    onClose
  }: {
    onPublish: (data: Data) => void;
    onMetaChange?: (meta: AppDocMeta) => void;
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
          onPublish(
            stub<ThemedData>({
              ...EDITED_UI,
              root: { props: { ...EDITED_UI.root.props, theme: "card" } }
            })
          )
        }
      >
        Save with theme
      </button>
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

const originalMatchMedia = window.matchMedia;

/** Reports every query as matching (or not), standing in for the viewport width. */
const setNarrowViewport = (narrow: boolean) => {
  window.matchMedia = jest.fn((query: string) => stub<MediaQueryList>({
    matches: narrow,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn()
  }));
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

  it("does not point graph tools at a placeholder when no workflow is bound", () => {
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

    expect(setCurrentWorkflowId).not.toHaveBeenCalled();
  });
});
