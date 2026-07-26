/**
 * Display widgets that read the runtime beyond a plain value: the Table's
 * shaping of an array binding, and the Progress widget's streaming activity
 * label.
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import type { AppInstanceState } from "@nodetool-ai/app-runtime";

import mockTheme from "../../../../__mocks__/themeMock";
import { makeTestRuntime } from "../../__tests__/testRuntime";
import { ProgressWidget, TableWidget } from "../widgets";

const OUTPUT_KEY = "main:out1";

const renderWidget = (
  element: React.ReactElement,
  initial: Partial<AppInstanceState> = {}
) => {
  const { wrapper: Wrapper } = makeTestRuntime(initial);
  return render(
    <ThemeProvider theme={mockTheme}>
      <Wrapper>{element}</Wrapper>
    </ThemeProvider>
  );
};

const withOutput = (value: unknown): Partial<AppInstanceState> => ({
  outputs: {
    [OUTPUT_KEY]: { value, invocationId: "j1", status: "done", revision: 1 }
  }
});

const RUNNING: Partial<AppInstanceState> = {
  invocations: {
    j1: { id: "j1", operationId: "main", status: "running", startedAt: 1 }
  },
  activeInvocation: { main: "j1" }
};

describe("TableWidget", () => {
  it("renders an array of objects as one column per key", () => {
    renderWidget(
      <TableWidget id="t1" binding="result" />,
      withOutput([
        { title: "First", score: 1 },
        { title: "Second", score: 2 }
      ])
    );
    expect(screen.getByRole("columnheader", { name: "title" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "score" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "First" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "2" })).toBeInTheDocument();
  });

  it("renders an array of primitives as a single column", () => {
    renderWidget(
      <TableWidget id="t1" binding="result" label="Results" />,
      withOutput(["alpha", "beta"])
    );
    expect(
      screen.getByRole("columnheader", { name: "Results" })
    ).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(3);
  });

  it("shows the placeholder when the binding holds nothing", () => {
    renderWidget(
      <TableWidget id="t1" binding="result" placeholder="Nothing yet" />
    );
    expect(screen.getByText("Nothing yet")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});

describe("ProgressWidget", () => {
  it("shows what the run reports it is doing", () => {
    renderWidget(<ProgressWidget id="p1" label="Working" />, {
      ...RUNNING,
      activity: { j1: "Calling search" }
    });
    expect(screen.getByText("Calling search")).toBeInTheDocument();
  });

  it("falls back to the configured label when the run reports nothing", () => {
    renderWidget(<ProgressWidget id="p1" label="Working" />, RUNNING);
    expect(screen.getByText("Working")).toBeInTheDocument();
  });
});
