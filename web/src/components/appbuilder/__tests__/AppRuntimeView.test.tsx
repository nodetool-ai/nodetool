import { stub } from "../../../test-utils/doubles";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Data } from "@puckeditor/core";

import mockTheme from "../../../__mocks__/themeMock";
import type { ApplicationDocument } from "@nodetool-ai/app-runtime";
import type { ServerAppInstance } from "../runtime/appInstanceApi";

import AppRuntimeView from "../AppRuntimeView";
import { useBugReportStore } from "../../../stores/BugReportStore";
import { Workflow } from "../../../stores/ApiTypes";
import { globalWebSocketManager } from "../../../lib/websocket/GlobalWebSocketManager";
import { useRun } from "../../../serverState/useRuns";
import useTraceStore from "../../../stores/TraceStore";
import {
  disposeAppRuntimeStore,
  getAppRuntimeStore,
  workflowInstanceId
} from "../runtime/appRuntimeStore";

let mockLoadedInstance: ServerAppInstance | undefined;
let mockInstanceError: string | undefined;
jest.mock("../runtime/useAppInstance", () => ({
  useAppInstance: () => ({ enabled: false, visitor: false, account: "1", instance: mockLoadedInstance, error: mockInstanceError, attach: () => undefined, flush: async () => undefined, serverFold: (apply: () => void) => apply(), refresh: async () => undefined, loading: false })
}));
jest.mock("../../../serverState/useRuns", () => ({
  ...jest.requireActual("../../../serverState/useRuns"),
  useRun: jest.fn(() => ({ data: undefined }))
}));
jest.mock("../../runs/AskRunAgentButton", () => ({ AskRunAgentButton: ({ runId, spanId }: { runId: string; spanId?: string }) => <button data-run={runId} data-span={spanId}>Ask the agent</button> }));

const workflow = stub<Workflow>({
  id: "wf-puck-runtime",
  name: "Runtime Test",
  access: "private",
  graph: {
    nodes: [
      {
        id: "out1",
        type: "nodetool.output.StringOutput",
        data: { name: "result", label: "Result" }
      }
    ],
    edges: []
  }
});

const data: Data = {
  root: { props: { title: "Reactive App" } },
  content: [
    { type: "Heading", props: { id: "h1", text: "Reactive App", level: "1" } },
    { type: "Text", props: { id: "t1", text: "", binding: "result" } }
  ],
  zones: {}
};

const instance = workflowInstanceId(workflow.id);
const store = () => getAppRuntimeStore(instance);

const renderView = (document?: ApplicationDocument) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ThemeProvider theme={mockTheme}>
        <AppRuntimeView workflow={workflow} data={data} document={document} />
      </ThemeProvider>
    </QueryClientProvider>
  );

/** Register a run and make it the operation's active invocation. */
const startRun = (id: string) =>
  act(() =>
    store()
      .getState()
      .dispatchEvent({
        type: "runStarted",
        invocation: {
          id,
          operationId: "main",
          status: "running",
          startedAt: 1
        },
        outputKeys: []
      })
  );

beforeEach(() => {
  mockLoadedInstance = undefined;
  mockInstanceError = undefined;
  disposeAppRuntimeStore(instance);
  useTraceStore.getState().clear();
  jest.mocked(useRun).mockReturnValue(stub<ReturnType<typeof useRun>>({ data: undefined }));
});

describe("AppRuntimeView (Puck Render)", () => {
  it("keeps working values visible when a loaded instance has a save conflict", async () => {
    mockLoadedInstance = stub<ServerAppInstance>({
      id: "loaded-instance",
      user_id: "1",
      variables: {},
      snapshot: {
        document: {
          schemaVersion: 3,
          ui: { ...data, content: [{ type: "Text", props: { id: "t1", text: "", binding: "var:unsaved" } }] },
          operations: [],
          resources: [],
          variables: [{ id: "unsaved", name: "Unsaved", scope: "instance", persist: false, type: { type: "str" } }]
        },
        workflow_graphs: {},
        script_documents: {}
      }
    });
    mockInstanceError = "This instance changed in another session";
    act(() => {
      store().getState().dispatchEvent({ type: "seedVariables", values: { unsaved: "Working draft" } });
    });
    renderView();
    expect(await screen.findByText(mockInstanceError)).toBeInTheDocument();
    expect(screen.getByText("Working draft")).toBeInTheDocument();
    expect(store().getState().variables.unsaved).toBe("Working draft");
  });
  it("waits for explicit workspace instance identity before mounting widgets", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ThemeProvider theme={mockTheme}>
          <AppRuntimeView
            workflow={workflow}
            data={data}
            application={{ id: "app" }}
            onInstanceReady={jest.fn()}
          />
        </ThemeProvider>
      </QueryClientProvider>
    );
    expect(screen.getByText("Opening instance")).toBeInTheDocument();
    expect(screen.queryByText("Reactive App")).not.toBeInTheDocument();
  });
  it("opens the stored failed span and hands the same typed IDs to chat", async () => {
    const runId = "a".repeat(32), spanId = "b".repeat(16);
    startRun("failed-job");
    act(() => {
      store().getState().setRunReference("main", { runId, traceId: "c".repeat(32), invocationId: "failed-job" });
      store().getState().dispatchEvent({ type: "invocationError", invocationId: "failed-job", error: "Missing input" });
    });
    jest.mocked(useRun).mockReturnValue(stub<ReturnType<typeof useRun>>({ data: { summary: { first_failed_span_id: spanId } } }));
    renderView();
    const banner = within(screen.getByRole("alert"));
    await userEvent.click(banner.getByRole("button", { name: "View trace" }));
    expect(useTraceStore.getState()).toMatchObject({ selectedRunId: runId, focusedSpanId: spanId, view: "trace" });
    expect(banner.getByRole("button", { name: "Ask the agent" })).toHaveAttribute("data-run", runId);
    expect(banner.getByRole("button", { name: "Ask the agent" })).toHaveAttribute("data-span", spanId);
  });
  it("renders widgets from the Puck document", () => {
    renderView();
    expect(screen.getAllByText("Reactive App").length).toBeGreaterThan(0);
  });

  it("displays a value that landed in the bound output's slot", async () => {
    startRun("job-1");
    act(() =>
      store().getState().dispatchEvent({
        type: "outputValue",
        key: "main:out1",
        invocationId: "job-1",
        value: "Hello from the graph",
        disposition: "replace"
      })
    );
    renderView();

    await waitFor(() =>
      expect(screen.getByText("Hello from the graph")).toBeInTheDocument()
    );
  });

  it("ignores a streamed output from a run this app did not start", async () => {
    renderView();

    act(() => {
      globalWebSocketManager.deliverLocal(
        stub<Parameters<typeof globalWebSocketManager.deliverLocal>[0]>({
          type: "output_update",
          workflow_id: workflow.id,
          job_id: "someone-elses-job",
          node_id: "out1",
          node_name: "result",
          output_name: "result",
          output_type: "string",
          value: "Contamination from another tab"
        })
      );
    });

    await waitFor(() =>
      expect(
        screen.queryByText("Contamination from another tab")
      ).not.toBeInTheDocument()
    );
  });

  it("applies the theme the document selects", () => {
    renderView({
      schemaVersion: 3,
      ui: data,
      operations: [],
      resources: [],
      variables: [],
      theme: { id: "centered" }
    });
    // The "centered" theme caps the content column; the default does not.
    const css = Array.from(document.querySelectorAll("style"))
      .flatMap((el) => Array.from(el.sheet?.cssRules ?? []))
      .map((rule) => rule.cssText)
      .join("");
    expect(css).toMatch(/max-width:\s*720px/);
  });

  it("surfaces the active invocation's error as a dismissible banner", async () => {
    startRun("job-err");
    act(() =>
      store().getState().dispatchEvent({
        type: "invocationError",
        invocationId: "job-err",
        error: "Boom: model failed"
      })
    );
    renderView();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Boom: model failed");

    await userEvent.click(screen.getByRole("button", { name: /close/i }));
    await waitFor(() =>
      expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    );
  });

  it("reports an invocation as an operation failure", async () => {
    startRun("job-report");
    act(() =>
      store().getState().dispatchEvent({
        type: "invocationError",
        invocationId: "job-report",
        error: "Provider unavailable"
      })
    );
    renderView();
    await userEvent.click(
      screen.getByRole("button", { name: "Report failure" })
    );
    expect(useBugReportStore.getState().context?.source).toBe(
      "operation-failure"
    );
    useBugReportStore.getState().close();
  });

  it("surfaces an error from a non-default operation", async () => {
    const document: ApplicationDocument = {
      schemaVersion: 3,
      ui: data,
      operations: [
        {
          id: "main",
          name: "Main",
          workflowId: workflow.id,
          inputs: {},
          outputs: {},
          policy: "replace"
        },
        {
          id: "review",
          name: "Review",
          workflowId: workflow.id,
          inputs: {},
          outputs: {},
          policy: "replace"
        }
      ],
      resources: [],
      variables: []
    };
    act(() =>
      store()
        .getState()
        .dispatchEvent({
          type: "runStarted",
          invocation: {
            id: "job-review-error",
            operationId: "review",
            status: "running",
            startedAt: 2
          },
          outputKeys: []
        })
    );
    act(() =>
      store().getState().dispatchEvent({
        type: "invocationError",
        invocationId: "job-review-error",
        error: "Review failed"
      })
    );

    renderView(document);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Review: Review failed"
    );
  });
});
