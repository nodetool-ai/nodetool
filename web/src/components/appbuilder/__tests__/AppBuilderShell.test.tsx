import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Data } from "@puckeditor/core";
import type { AppDocMeta } from "@nodetool-ai/app-runtime";

import type { Workflow } from "../../../stores/ApiTypes";
import type { AppDocument } from "../appData";

const setCurrentWorkflowId = jest.fn();

jest.mock("../../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: (
    selector: (state: { setCurrentWorkflowId: unknown }) => unknown
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
    <AppBuilderShell
      document={document}
      workflow={workflow}
      agentWorkflowId="wf-1"
      onSave={onSave}
    />
  );
  return onSave;
};

beforeEach(() => jest.clearAllMocks());

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

  it("points the agent's workflow tools at the bound workflow", () => {
    renderShell();

    expect(setCurrentWorkflowId).toHaveBeenCalledWith("wf-1");
  });

  it("opens the agent panel for the bound workflow", async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByRole("button", { name: "Ask Agent" }));

    expect(screen.getByTestId("agent-panel")).toHaveTextContent("wf-1");
  });

  it("hides the agent when no workflow is bound", () => {
    render(
      <AppBuilderShell
        document={document}
        workflow={workflow}
        onSave={jest.fn()}
      />
    );

    expect(
      screen.queryByRole("button", { name: "Ask Agent" })
    ).not.toBeInTheDocument();
    expect(setCurrentWorkflowId).not.toHaveBeenCalled();
  });
});
