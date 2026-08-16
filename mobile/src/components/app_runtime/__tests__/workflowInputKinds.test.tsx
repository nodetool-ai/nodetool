/**
 * `WorkflowInput` routing: the widget renders whatever control the Input node it
 * binds to needs. Everything the kind table declares must reach a real control —
 * a kind that falls through to a plain text box would silently break the app
 * (a model reference is not something anybody types).
 */
import React from "react";
import { render, screen } from "@testing-library/react-native";

import {
  parseApplicationDocument,
  type ApplicationDocument,
} from "@nodetool-ai/app-runtime";

import type { Workflow } from "../../../types/workflow";

jest.mock("../../../trpc/client", () => ({
  // Media widgets resolve an `asset://` locator through `assets.get`; these
  // cases render non-asset sources, so the lookup never settles.
  trpc: {
    assets: { get: { useQuery: () => ({ data: undefined, isLoading: false }) } },
    useQueries: () => [],
  },
}));

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
}));

jest.mock("../../../stores/WorkflowRunner", () => ({
  useWorkflowRunner: () => ({
    getState: () => ({
      job_id: null,
      run: jest.fn().mockResolvedValue(undefined),
      cancel: jest.fn().mockResolvedValue(undefined),
    }),
    subscribe: () => () => {},
  }),
}));

jest.mock("../../../services/WebSocketService", () => ({
  webSocketService: { subscribe: () => () => {} },
}));

jest.mock("../../../services/api", () => ({
  apiService: {
    resolveUrl: (uri: string) => uri,
    getApiHost: () => "http://localhost:7777",
  },
}));

// The model picker's own data comes from tRPC; the routing test only cares that
// the picker — not a text box — is what the model kinds render.
jest.mock("../../../hooks/useModelsByProvider", () => ({
  useModelsForType: () => ({
    models: [
      { type: "language_model", id: "m1", name: "Sonnet", provider: "anthropic" },
    ],
    providers: [],
    isLoading: false,
    error: null,
    refetch: jest.fn(),
  }),
}));

import ApplicationAppView from "../ApplicationAppView";

const appDoc = {
  schemaVersion: 3,
  ui: {
    root: { props: { title: "Inputs" } },
    content: [
      { type: "WorkflowInput", props: { id: "w-1", binding: "op:main/in:n1" } },
    ],
    zones: {},
  },
  operations: [
    {
      id: "main",
      name: "Run",
      workflowId: "wf-kinds",
      inputs: {},
      outputs: {},
      policy: "replace",
    },
  ],
  resources: [],
  variables: [],
};

const workflowWith = (nodeType: string, data: Record<string, unknown> = {}) =>
  ({
    id: `wf-${nodeType}`,
    name: "Inputs",
    description: "",
    graph: {
      nodes: [{ id: "n1", type: nodeType, data: { name: "field", ...data } }],
      edges: [],
    },
    access: "private",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  });

const renderInput = (nodeType: string, data?: Record<string, unknown>) =>
  render(
    <ApplicationAppView
      document={parseApplicationDocument(appDoc) as ApplicationDocument}
      workflow={workflowWith(nodeType, data)}
    />
  );

describe("WorkflowInput kind routing", () => {
  it("renders a model picker for a language model input", async () => {
    renderInput("nodetool.input.LanguageModelInput");

    expect(await screen.findByText("Sonnet")).toBeTruthy();
    expect(screen.queryByPlaceholderText("owner/model")).toBeNull();
  });

  it.each([
    "nodetool.input.ImageModelInput",
    "nodetool.input.VideoModelInput",
    "nodetool.input.TTSModelInput",
    "nodetool.input.ASRModelInput",
    "nodetool.input.EmbeddingModelInput",
  ])("renders a model picker for %s", async (nodeType) => {
    renderInput(nodeType);

    expect(await screen.findByText("Sonnet")).toBeTruthy();
  });

  it("renders a repo field for a Hugging Face model input", async () => {
    renderInput("nodetool.input.HuggingFaceModelInput");

    expect(await screen.findByPlaceholderText("owner/model")).toBeTruthy();
  });

  it("renders a grid for a dataframe input", async () => {
    renderInput("nodetool.input.DataFrameInput");

    expect(await screen.findByText("No columns to edit")).toBeTruthy();
  });

  it("renders a path field for file and folder inputs", async () => {
    renderInput("nodetool.input.FilePathInput");
    expect(await screen.findByPlaceholderText("/path/to/file.txt")).toBeTruthy();

    screen.unmount();
    renderInput("nodetool.input.FolderPathInput");
    expect(await screen.findByPlaceholderText("/path/to/folder")).toBeTruthy();
  });

  it("renders a document picker for a 3D model input", async () => {
    renderInput("nodetool.input.Model3DInput");

    expect(await screen.findByText("Choose 3D model")).toBeTruthy();
  });

  it("renders a width/height pair for an image size input", async () => {
    renderInput("nodetool.input.ImageSizeInput");

    expect(await screen.findByLabelText("width")).toBeTruthy();
    expect(screen.getByLabelText("height")).toBeTruthy();
  });

  it.each([
    ["nodetool.input.ImageListInput", "Add image"],
    ["nodetool.input.VideoListInput", "Add video"],
    ["nodetool.input.AudioListInput", "Add audio"],
  ])("renders a media list for %s", async (nodeType, addLabel) => {
    renderInput(nodeType);

    expect(await screen.findByText(addLabel)).toBeTruthy();
  });

  it("renders a line-per-entry field for a text list input", async () => {
    renderInput("nodetool.input.TextListInput");

    expect(await screen.findByPlaceholderText("One entry per line")).toBeTruthy();
  });

  it("still renders a text box for a string input", async () => {
    renderInput("nodetool.input.StringInput");

    expect(await screen.findByText("field")).toBeTruthy();
    expect(screen.queryByText("No columns to edit")).toBeNull();
  });
});
