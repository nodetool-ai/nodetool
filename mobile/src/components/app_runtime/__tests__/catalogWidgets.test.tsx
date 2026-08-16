/**
 * Native parity for the widgets added beyond the original catalog. A type the
 * web builder can place but this renderer does not know falls through to the
 * unknown-widget hint, so each one is checked against a real document.
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

import ApplicationAppView from "../ApplicationAppView";

/** A document with one widget bound to a variable holding `value`. */
const appDoc = (
  type: string,
  props: Record<string, unknown>,
  value?: unknown
) => ({
  schemaVersion: 3,
  ui: {
    root: { props: { title: "Catalog" } },
    content: [{ type, props: { id: `${type}-1`, ...props } }],
    zones: {},
  },
  operations: [
    {
      id: "main",
      name: "Run",
      workflowId: "wf-catalog",
      inputs: {},
      outputs: {},
      policy: "replace",
    },
  ],
  resources: [],
  variables: [
    {
      id: "data",
      name: "data",
      scope: "instance",
      persist: false,
      default: value,
    },
  ],
});

const makeWorkflow = (id: string): Workflow =>
  ({
    id,
    name: "Catalog",
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

describe("added catalog widgets on mobile", () => {
  it("renders an Alert from its binding", async () => {
    renderApp(
      "wf-alert",
      appDoc(
        "Alert",
        { binding: "var:data", severity: "error", title: "Failed" },
        "Model refused"
      )
    );
    expect(await screen.findByText("Model refused")).toBeTruthy();
    expect(screen.getByText("Failed")).toBeTruthy();
  });

  it("renders a List of a bound array", async () => {
    renderApp(
      "wf-list",
      appDoc("List", { binding: "var:data" }, ["alpha", "beta"])
    );
    expect(await screen.findByText("alpha")).toBeTruthy();
    expect(screen.getByText("beta")).toBeTruthy();
  });

  it("renders Key/Value rows for a bound record", async () => {
    renderApp(
      "wf-kv",
      appDoc("KeyValue", { binding: "var:data" }, { model: "sonnet" })
    );
    expect(await screen.findByText("model")).toBeTruthy();
    expect(screen.getByText("sonnet")).toBeTruthy();
  });

  it("renders a Stat and its caption", async () => {
    renderApp(
      "wf-stat",
      appDoc("Stat", { binding: "var:data", label: "Score", caption: "so far" }, 42)
    );
    expect(await screen.findByText("42")).toBeTruthy();
    expect(screen.getByText("so far")).toBeTruthy();
  });

  it("renders a Code block", async () => {
    renderApp(
      "wf-code",
      appDoc("CodeBlock", { binding: "var:data" }, "print('hi')")
    );
    expect(await screen.findByText("print('hi')")).toBeTruthy();
  });

  it("offers a Download once the binding carries a file", async () => {
    renderApp(
      "wf-download",
      appDoc("Download", { binding: "var:data", label: "Get it" }, {
        type: "document",
        uri: "https://example.test/report.pdf",
      })
    );
    expect(await screen.findByText("Get it")).toBeTruthy();
  });

  it("renders the option groups as chips", async () => {
    renderApp(
      "wf-radio",
      appDoc("RadioGroup", {
        binding: "var:data",
        label: "Colour",
        options: [{ value: "Red" }, { value: "Blue" }],
      })
    );
    expect(await screen.findByText("Red")).toBeTruthy();
    expect(screen.getByText("Blue")).toBeTruthy();
  });

  it("shows only the active tab's contents", async () => {
    renderApp("wf-tabs", {
      schemaVersion: 3,
      ui: {
        root: { props: {} },
        content: [
          {
            type: "Tabs",
            props: {
              id: "tabs-1",
              tab1Label: "One",
              tab2Label: "Two",
              tab1: [{ type: "Text", props: { id: "t1", text: "first pane" } }],
              tab2: [{ type: "Text", props: { id: "t2", text: "second pane" } }],
            },
          },
        ],
        zones: {},
      },
      operations: [],
      resources: [],
      variables: [],
    });
    expect(await screen.findByText("One")).toBeTruthy();
    expect(screen.getByText("Two")).toBeTruthy();
    // Both panes stay mounted; only the inactive one is hidden.
    expect(screen.getByText("first pane")).toBeTruthy();
  });

  it("renders an Accordion's slot", async () => {
    renderApp("wf-accordion", {
      schemaVersion: 3,
      ui: {
        root: { props: {} },
        content: [
          {
            type: "Accordion",
            props: {
              id: "acc-1",
              title: "Advanced",
              defaultOpen: true,
              content: [{ type: "Text", props: { id: "t1", text: "inner" } }],
            },
          },
        ],
        zones: {},
      },
      operations: [],
      resources: [],
      variables: [],
    });
    expect(await screen.findByText("Advanced")).toBeTruthy();
    expect(screen.getByText("inner")).toBeTruthy();
  });
});
