import React from "react";
import { stub } from "../../../test-utils/doubles";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Data } from "@puckeditor/core";

import mockTheme from "../../../__mocks__/themeMock";
import type { ApplicationDocument } from "@nodetool-ai/app-runtime";

import AppRuntimeView from "../AppRuntimeView";
import { Workflow } from "../../../stores/ApiTypes";
import { globalWebSocketManager } from "../../../lib/websocket/GlobalWebSocketManager";
import {
  disposeAppRuntimeStore,
  getAppRuntimeStore,
  workflowInstanceId
} from "../runtime/appRuntimeStore";

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
    store().getState().dispatchEvent({
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
  disposeAppRuntimeStore(instance);
});

describe("AppRuntimeView (Puck Render)", () => {
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
      globalWebSocketManager.deliverLocal(stub<Parameters<typeof globalWebSocketManager.deliverLocal>[0]>({
        type: "output_update",
        workflow_id: workflow.id,
        job_id: "someone-elses-job",
        node_id: "out1",
        node_name: "result",
        output_name: "result",
        output_type: "string",
        value: "Contamination from another tab"
      }));
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
});
