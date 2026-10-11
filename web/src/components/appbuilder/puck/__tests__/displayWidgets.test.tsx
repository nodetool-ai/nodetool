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
import { makeTestRuntime, TEST_SCOPE } from "../../__tests__/testRuntime";
import { ProgressWidget, resolveImageSrc, TableWidget } from "../widgets";

const OUTPUT_KEY = "main:out1";

const renderWidget = (
  element: React.ReactElement,
  initial: Partial<AppInstanceState> = {},
  overrides: Parameters<typeof makeTestRuntime>[1] = {}
) => {
  const { wrapper: Wrapper } = makeTestRuntime(initial, overrides);
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

  describe("bound to a second operation's progress", () => {
    const TWO_OPS = {
      scope: {
        ...TEST_SCOPE,
        operations: [
          ...TEST_SCOPE.operations,
          {
            operationId: "translate",
            inputs: [],
            outputs: [],
            nodeIds: [],
            variableNames: []
          }
        ]
      }
    };
    const running = (
      operationId: string,
      progress: number
    ): Partial<AppInstanceState> => ({
      invocations: {
        j1: {
          id: "j1",
          operationId,
          status: "running",
          startedAt: 1,
          progress
        }
      },
      activeInvocation: { [operationId]: "j1" }
    });

    it("shows while that operation runs, as a percentage", () => {
      renderWidget(
        <ProgressWidget
          id="p1"
          binding="op:translate/exec#progress"
          label="Translating"
        />,
        running("translate", 0.6),
        TWO_OPS
      );
      expect(screen.getByText("Translating")).toBeInTheDocument();
      expect(screen.getAllByRole("progressbar")[0]).toHaveAttribute(
        "aria-valuenow",
        "60"
      );
    });

    it("stays hidden while only the first operation runs", () => {
      renderWidget(
        <ProgressWidget
          id="p1"
          binding="op:translate/exec#progress"
          label="Translating"
        />,
        running("main", 0.6),
        TWO_OPS
      );
      expect(screen.queryByText("Translating")).not.toBeInTheDocument();
    });
  });
});

describe("resolveImageSrc", () => {
  it("reads a serialized media ref stored in an app variable", () => {
    expect(
      resolveImageSrc(JSON.stringify({ type: "image", uri: "asset://hero" }))
    ).toBe("asset://hero");
  });

  it("resolves an asset-only media ref", () => {
    expect(resolveImageSrc({ type: "image", asset_id: "hero" })).toBe(
      "asset://hero"
    );
  });

  it("resolves an asset ID emitted through an app variable", () => {
    expect(resolveImageSrc("3d5bf29fd3004ca0bb4991d2648b2876")).toBe(
      "asset://3d5bf29fd3004ca0bb4991d2648b2876"
    );
  });
});
