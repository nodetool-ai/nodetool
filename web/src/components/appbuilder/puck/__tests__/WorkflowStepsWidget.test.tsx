import React from "react";
import { act, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../../__mocks__/themeMock";
import useMetadataStore from "../../../../stores/MetadataStore";
import { makeTestRuntime } from "../../__tests__/testRuntime";
import { configuredSteps, generativeSteps, WorkflowStepsWidget } from "../WorkflowStepsWidget";

const metadata: Record<string, unknown> = {
  "a.Image": { title: "Make image", auto_save_asset: true, properties: [] },
  "a.Video": { title: "Make video", properties: [{ name: "model", type: { type: "video_model" } }] },
  "a.Concat": { title: "Concat", properties: [] }
};
const graph = {
  nodes: [
    { id: "video", type: "a.Video" },
    { id: "concat", type: "a.Concat" },
    { id: "image", type: "a.Image" }
  ],
  edges: [
    { source: "image", target: "video" },
    { source: "video", target: "concat" }
  ]
};
const getMetadata = (type: string) => metadata[type];

it("lists only generative nodes in dependency order", () => {
  expect(generativeSteps(graph as never, getMetadata as never)).toEqual([
    { id: "image", title: "Make image" },
    { id: "video", title: "Make video" }
  ]);
});

it("updates each step from the run's node messages", () => {
  useMetadataStore.setState({ getMetadata: getMetadata as never });
  const runtime = makeTestRuntime({
    invocations: { run: { id: "run", operationId: "main", status: "running", startedAt: 1 } },
    activeInvocation: { main: "run" }
  });
  jest.mocked(runtime.value.getOperationGraph).mockReturnValue(graph as never);
  render(
    <ThemeProvider theme={mockTheme}>
      <runtime.wrapper>
        <WorkflowStepsWidget id="steps" operationId="main" />
      </runtime.wrapper>
    </ThemeProvider>
  );
  expect(screen.getAllByText("Waiting")).toHaveLength(2);
  const dispatch = runtime.store.getState().dispatchEvent;
  act(() => dispatch({ type: "invocationNode", invocationId: "run", nodeId: "image", status: "completed" }));
  act(() => dispatch({ type: "invocationNode", invocationId: "run", nodeId: "video", status: "error", error: "Too big" }));
  expect(screen.getByText("Done")).toBeInTheDocument();
  expect(screen.getByText("Too big")).toBeInTheDocument();
  expect(screen.queryByText("Waiting")).toBeNull();
  const items = screen.getAllByRole("listitem");
  expect(items.map((item) => item.getAttribute("data-state"))).toEqual(["done", "failed"]);
});

it("binds configured steps to nodes, in the configured order", () => {
  expect(
    configuredSteps(
      [
        { nodeId: "concat", title: "Cut the film", description: "Joins every clip" },
        { nodeId: "missing" },
        { nodeId: "image" }
      ],
      graph as never,
      getMetadata as never
    )
  ).toEqual([
    { id: "concat", title: "Cut the film", description: "Joins every clip" },
    { id: "image", title: "Make image" }
  ]);
});

it("shows configured steps instead of the automatic ones", () => {
  useMetadataStore.setState({ getMetadata: getMetadata as never });
  const runtime = makeTestRuntime({
    invocations: { run: { id: "run", operationId: "main", status: "running", startedAt: 1 } },
    activeInvocation: { main: "run" }
  });
  jest.mocked(runtime.value.getOperationGraph).mockReturnValue(graph as never);
  render(
    <ThemeProvider theme={mockTheme}>
      <runtime.wrapper>
        <WorkflowStepsWidget id="steps" operationId="main" steps={[{ nodeId: "concat", title: "Cut" }]} />
      </runtime.wrapper>
    </ThemeProvider>
  );
  expect(screen.getByText("Cut")).toBeInTheDocument();
  expect(screen.queryByText("Make image")).toBeNull();
  const dispatch = runtime.store.getState().dispatchEvent;
  act(() => dispatch({ type: "invocationNode", invocationId: "run", nodeId: "concat", status: "running", progress: 0.5 }));
  expect(screen.getByText("50%")).toBeInTheDocument();
  expect(screen.getByRole("progressbar", { name: "Workflow progress" })).toHaveAttribute("aria-valuenow", "50");
});
