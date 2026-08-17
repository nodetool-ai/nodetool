/**
 * The Table widget: an array of objects becomes columns from the rows' keys, an
 * array of primitives becomes one column, and an empty value says so instead of
 * rendering an empty frame.
 */
import { render, screen } from "@testing-library/react-native";

import {
  parseApplicationDocument,
  type ApplicationDocument
} from "@nodetool-ai/app-runtime";

import type { Workflow } from "../../../types/workflow";

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: jest.fn() })
}));

jest.mock("../../../stores/WorkflowRunner", () => ({
  useWorkflowRunner: () => ({
    getState: () => ({
      job_id: null,
      run: jest.fn().mockResolvedValue(undefined),
      cancel: jest.fn().mockResolvedValue(undefined)
    }),
    subscribe: () => () => {}
  })
}));

import { webSocketService } from "../../../services/WebSocketService";

// The real socket singleton; only `subscribe` is stubbed so nothing dials out.
jest.spyOn(webSocketService, "subscribe").mockReturnValue(() => {});

import { apiService } from "../../../services/api";

// The real `apiService` singleton, with only the two host-dependent lookups
// pinned so URLs are stable regardless of the configured API host.
jest.spyOn(apiService, "resolveUrl").mockImplementation((uri) => uri ?? null);
jest.spyOn(apiService, "getApiHost").mockReturnValue("http://localhost:7777");

import ApplicationAppView from "../ApplicationAppView";

const tableProps = (placeholder?: string) => {
  type PropsFields = { id: string; binding: string; placeholder?: string };
  const props: PropsFields = {
    id: "table-1",
    binding: "var:rows"
  };
  if (placeholder) {
    props.placeholder = placeholder;
  }
  return props;
};

const appDoc = (rows: unknown, placeholder?: string) => ({
  schemaVersion: 3,
  ui: {
    root: { props: { title: "Report" } },
    content: [
      {
        type: "Table",
        props: tableProps(placeholder)
      }
    ],
    zones: {}
  },
  operations: [
    {
      id: "main",
      name: "Run",
      workflowId: "wf-table",
      inputs: {},
      outputs: {},
      policy: "replace"
    }
  ],
  resources: [],
  variables: [
    {
      id: "rows",
      name: "rows",
      scope: "instance",
      persist: false,
      default: rows
    }
  ]
});

const makeWorkflow = (id: string): Workflow =>
  ({
    id,
    name: "Report",
    description: "",
    graph: { nodes: [], edges: [] },
    access: "private",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  });

const renderApp = (id: string, doc: unknown) =>
  render(
    <ApplicationAppView
      document={parseApplicationDocument(doc) as ApplicationDocument}
      workflow={makeWorkflow(id)}
    />
  );

describe("Table widget", () => {
  it("renders one column per key of an array of objects", async () => {
    renderApp(
      "wf-table-objects",
      appDoc([
        { city: "Berlin", score: 7 },
        { city: "Lisbon", extra: true }
      ])
    );

    // Columns are the union of the rows' keys, in first-seen order.
    expect(await screen.findByText("city")).toBeTruthy();
    expect(screen.getByText("score")).toBeTruthy();
    expect(screen.getByText("extra")).toBeTruthy();
    expect(screen.getByText("Berlin")).toBeTruthy();
    expect(screen.getByText("7")).toBeTruthy();
    expect(screen.getByText("true")).toBeTruthy();
  });

  it("renders an array of primitives as a single unnamed column", async () => {
    renderApp("wf-table-primitives", appDoc(["red", "green"]));

    expect(await screen.findByText("red")).toBeTruthy();
    expect(screen.getByText("green")).toBeTruthy();
  });

  it("shows the placeholder for an empty value", () => {
    renderApp("wf-table-empty", appDoc([], "Nothing yet"));

    expect(screen.getByText("Nothing yet")).toBeTruthy();
    expect(screen.queryByText(/not available on mobile/)).toBeNull();
  });
});
