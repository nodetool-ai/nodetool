import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

const mockOpenTab = jest.fn();
jest.mock("../../../stores/WorkspaceTabsStore", () => ({
  useWorkspaceTabsStore: (selector: (state: unknown) => unknown) =>
    selector({ openTab: mockOpenTab }),
  creationProjectId: () => "project-a"
}));
const mockAddNotification = jest.fn();
jest.mock("../../../stores/NotificationStore", () => ({
  useNotificationStore: (selector: (state: unknown) => unknown) =>
    selector({ addNotification: mockAddNotification })
}));
const mockDocumentByFile = jest.fn();
jest.mock("../../../trpc/client", () => ({
  trpc: {
    projects: {
      get: {
        useQuery: () => ({
          data: {
            documents: [
              {
                type: "script",
                ref: "script-1",
                name: "Launch voiceover",
                updatedAt: "2026-01-01T00:00:00Z",
                status: null,
                spendUsd: 0,
                unpricedCount: 0,
                thumbnails: [],
                preview: null
              }
            ]
          }
        })
      }
    }
  },
  trpcClient: {
    projects: {
      documentByFile: {
        query: (...args: unknown[]) => mockDocumentByFile(...args)
      }
    }
  }
}));
jest.mock("../../projects/ProjectDocumentPreview", () => ({
  __esModule: true,
  default: () => <div data-testid="document-preview" />
}));

import ScriptProperty from "../ScriptProperty";
import WorkflowProperty from "../WorkflowProperty";

const LocationProbe = () => (
  <div data-testid="location">{useLocation().pathname}</div>
);

const renderScript = (value: unknown, onChange: jest.Mock) =>
  render(
    <MemoryRouter initialEntries={["/editor/current-workflow"]}>
      <LocationProbe />
      <ThemeProvider theme={mockTheme}>
        <ScriptProperty
          property={{
            name: "value",
            type: { type: "script", optional: false, type_args: [] },
            default: null,
            title: "Value",
            description: "",
            required: false
          }}
          nodeType="nodetool.constant.Script"
          nodeId="script_constant"
          propertyIndex="0"
          value={value}
          onChange={onChange}
        />
      </ThemeProvider>
    </MemoryRouter>
  );

const fileDrop = (path: string) => {
  const data = JSON.stringify({
    type: "project-file",
    payload: { projectId: "project-a", path }
  });
  return {
    dataTransfer: {
      types: ["application/x-nodetool-drag"],
      getData: (format: string) =>
        format === "application/x-nodetool-drag" ? data : "",
      files: [],
      items: []
    }
  };
};

describe("DocumentConstantProperty", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows a drop hint and no picker when nothing is linked", () => {
    renderScript({ type: "script", id: null }, jest.fn());
    expect(screen.getByText("Drop a script file here")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("shows the linked document's name and preview", () => {
    renderScript({ type: "script", id: "script-1" }, jest.fn());
    expect(screen.getByText("Launch voiceover")).toBeInTheDocument();
    expect(screen.getByTestId("document-preview")).toBeInTheDocument();
  });

  it("opens the document in a workspace tab and keeps the workflow open", () => {
    renderScript({ type: "script", id: "script-1" }, jest.fn());
    fireEvent.click(screen.getByRole("button", { name: "Open in script editor" }));
    expect(screen.getByText("Edit")).toBeInTheDocument();
    expect(mockOpenTab).toHaveBeenCalledWith(
      expect.objectContaining({ type: "script", ref: "script-1", mode: "edit" })
    );
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/editor/current-workflow"
    );
  });

  it("opens the document on a double-click of the node", () => {
    renderScript({ type: "script", id: "script-1" }, jest.fn());
    fireEvent.doubleClick(screen.getByTestId("document-constant"));
    expect(mockOpenTab).toHaveBeenCalledWith(
      expect.objectContaining({ type: "script", ref: "script-1" })
    );
  });

  it("opens a linked workflow in a workspace tab, not by navigation", () => {
    render(
      <MemoryRouter initialEntries={["/editor/current-workflow"]}>
        <LocationProbe />
        <ThemeProvider theme={mockTheme}>
          <WorkflowProperty
            property={{
              name: "value",
              type: { type: "workflow", optional: false, type_args: [] },
              default: null,
              title: "Value",
              description: "",
              required: false
            }}
            nodeType="nodetool.constant.Workflow"
            nodeId="workflow_constant"
            propertyIndex="0"
            value={{ type: "workflow", id: "wf-2" }}
            onChange={jest.fn()}
          />
        </ThemeProvider>
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("button", { name: "Open in workflow editor" }));
    expect(mockOpenTab).toHaveBeenCalledWith(
      expect.objectContaining({ type: "workflow", ref: "wf-2", mode: "edit" })
    );
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/editor/current-workflow"
    );
  });

  it("replaces the value when a script file is dropped on the node", async () => {
    mockDocumentByFile.mockResolvedValue({
      type: "script",
      ref: "script-2",
      name: "Teaser",
      updatedAt: "2026-01-01T00:00:00Z",
      file: { path: "teaser.script.json", state: "ok", error: null }
    });
    const onChange = jest.fn();
    renderScript({ type: "script", id: "script-1" }, onChange);
    fireEvent.drop(screen.getByTestId("document-constant"), fileDrop("teaser.script.json"));
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({ type: "script", id: "script-2" })
    );
    expect(mockDocumentByFile).toHaveBeenCalledWith({
      id: "project-a",
      path: "teaser.script.json"
    });
  });

  it("rejects a document file of another kind with a warning", async () => {
    mockDocumentByFile.mockResolvedValue({
      type: "timeline",
      ref: "cut-1",
      name: "Cut",
      updatedAt: "2026-01-01T00:00:00Z",
      file: { path: "cut.timeline.json", state: "ok", error: null }
    });
    const onChange = jest.fn();
    renderScript({ type: "script", id: "script-1" }, onChange);
    fireEvent.drop(screen.getByTestId("document-constant"), fileDrop("cut.timeline.json"));
    await waitFor(() =>
      expect(mockAddNotification).toHaveBeenCalledWith(
        expect.objectContaining({ type: "warning" })
      )
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it("rejects a media file without asking the server", async () => {
    const onChange = jest.fn();
    renderScript({ type: "script", id: null }, onChange);
    fireEvent.drop(screen.getByTestId("document-constant"), fileDrop("clip.mp4"));
    await waitFor(() => expect(mockAddNotification).toHaveBeenCalled());
    expect(mockDocumentByFile).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });
});
