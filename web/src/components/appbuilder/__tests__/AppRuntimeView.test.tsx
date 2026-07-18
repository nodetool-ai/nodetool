import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import type { Data } from "@puckeditor/core";

import mockTheme from "../../../__mocks__/themeMock";
import AppRuntimeView from "../AppRuntimeView";
import { Workflow } from "../../../stores/ApiTypes";
import { globalWebSocketManager } from "../../../lib/websocket/GlobalWebSocketManager";
import { getAppRuntimeStore } from "../runtime/appRuntimeStore";

const workflow = {
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
} as unknown as Workflow;

const data: Data = {
  root: { props: { title: "Reactive App" } },
  content: [
    { type: "Heading", props: { id: "h1", text: "Reactive App", level: "1" } },
    { type: "Text", props: { id: "t1", text: "", binding: "result" } }
  ],
  zones: {}
};

const renderView = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <AppRuntimeView workflow={workflow} data={data} />
    </ThemeProvider>
  );

describe("AppRuntimeView (Puck Render)", () => {
  it("renders widgets from the Puck document", () => {
    renderView();
    expect(screen.getAllByText("Reactive App").length).toBeGreaterThan(0);
  });

  it("reactively updates a bound widget when a streamed output arrives", async () => {
    renderView();

    act(() => {
      globalWebSocketManager.deliverLocal({
        type: "output_update",
        workflow_id: workflow.id,
        node_id: "out1",
        node_name: "result",
        output_name: "result",
        output_type: "string",
        value: "Hello from the graph"
      } as unknown as Parameters<typeof globalWebSocketManager.deliverLocal>[0]);
    });

    await waitFor(() =>
      expect(screen.getByText("Hello from the graph")).toBeInTheDocument()
    );
  });

  it("concatenates streamed text appends into one string", async () => {
    // The runtime store is a singleton keyed by workflow id — drop any value a
    // prior test folded so this run starts from an empty "result".
    act(() => getAppRuntimeStore(workflow.id).getState().clearOutputs(["result"]));
    renderView();

    const append = (value: string) =>
      act(() => {
        globalWebSocketManager.deliverLocal({
          type: "output_update",
          workflow_id: workflow.id,
          node_id: "out1",
          node_name: "result",
          output_name: "result",
          output_type: "string",
          disposition: "append",
          value
        } as unknown as Parameters<
          typeof globalWebSocketManager.deliverLocal
        >[0]);
      });

    append("Hel");
    append("lo");

    // Concatenated to "Hello" — not split into separate "Hel"/"lo" parts.
    await waitFor(() =>
      expect(screen.getByText("Hello")).toBeInTheDocument()
    );
  });

  it("surfaces a run error as a dismissible banner", async () => {
    act(() => {
      getAppRuntimeStore(workflow.id).getState().setError("Boom: model failed");
    });
    renderView();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Boom: model failed");

    await userEvent.click(screen.getByRole("button", { name: /close/i }));
    await waitFor(() =>
      expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    );
  });
});
