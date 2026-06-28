import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import AppRuntimeView from "../AppRuntimeView";
import { AppSpec, createEmptyAppSpec } from "../appSchema";
import { Workflow } from "../../../stores/ApiTypes";
import { globalWebSocketManager } from "../../../lib/websocket/GlobalWebSocketManager";

const workflow = {
  id: "wf-runtime-test",
  name: "Runtime Test",
  access: "private",
  graph: {
    nodes: [
      {
        id: "in1",
        type: "nodetool.input.StringInput",
        data: { name: "prompt", label: "Prompt" }
      },
      {
        id: "out1",
        type: "nodetool.output.StringOutput",
        data: { name: "result", label: "Result" }
      }
    ],
    edges: []
  }
} as unknown as Workflow;

const spec: AppSpec = {
  ...createEmptyAppSpec("Reactive App"),
  widgets: [
    {
      id: "h1",
      type: "heading",
      layout: { x: 0, y: 0, w: 12, h: 1 },
      props: { text: "Reactive App", level: 1 }
    },
    {
      id: "t1",
      type: "text",
      layout: { x: 0, y: 1, w: 12, h: 1 },
      props: { text: "" },
      binding: "result"
    }
  ]
};

const renderView = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <AppRuntimeView workflow={workflow} spec={spec} />
    </ThemeProvider>
  );

describe("AppRuntimeView", () => {
  it("renders widgets from the spec", () => {
    renderView();
    expect(screen.getByText("Reactive App")).toBeInTheDocument();
  });

  it("lets the user type into an input that isn't bound to a workflow input", async () => {
    const inputSpec: AppSpec = {
      ...createEmptyAppSpec("Inputs"),
      widgets: [
        {
          id: "ti1",
          type: "textInput",
          layout: { x: 0, y: 0, w: 12, h: 1 },
          props: { label: "Name", placeholder: "", multiline: false }
        }
      ]
    };

    render(
      <ThemeProvider theme={mockTheme}>
        <AppRuntimeView workflow={workflow} spec={inputSpec} />
      </ThemeProvider>
    );

    const field = screen.getByLabelText("Name");
    await userEvent.type(field, "hello");
    await waitFor(() => expect(field).toHaveValue("hello"));
  });

  it("reactively updates a bound widget when a streamed output arrives", async () => {
    renderView();

    // Simulate the streaming runner emitting an output for node out1 / "result".
    globalWebSocketManager.deliverLocal({
      type: "output_update",
      workflow_id: workflow.id,
      node_id: "out1",
      node_name: "result",
      output_name: "result",
      output_type: "string",
      value: "Hello from the graph"
    } as unknown as Parameters<typeof globalWebSocketManager.deliverLocal>[0]);

    await waitFor(() =>
      expect(screen.getByText("Hello from the graph")).toBeInTheDocument()
    );
  });
});
