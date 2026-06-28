import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import type { Data } from "@puckeditor/core";

import mockTheme from "../../../__mocks__/themeMock";
import AppRuntimeView from "../AppRuntimeView";
import { Workflow } from "../../../stores/ApiTypes";
import { globalWebSocketManager } from "../../../lib/websocket/GlobalWebSocketManager";

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
});
