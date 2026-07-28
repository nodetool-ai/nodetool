/**
 * The Chart widget derives its traces from whatever shape the binding holds —
 * a dataframe, an array of records, or a list of numbers — so the app author
 * never writes a Plotly spec.
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import type { AppInstanceState } from "@nodetool-ai/app-runtime";

import mockTheme from "../../../../__mocks__/themeMock";
import { makeTestRuntime } from "../../__tests__/testRuntime";
import { ChartWidget, chartTraces } from "../ChartWidget";

// Plotly is loaded lazily in the real widget; the test only cares that the
// widget decided there was something to plot.
jest.mock("../../../node/output/PlotlyChart", () => ({
  __esModule: true,
  default: () =>
    require("react").createElement("div", { "data-testid": "plotly" })
}));

const OUTPUT_KEY = "main:out1";

const withOutput = (value: unknown): Partial<AppInstanceState> => ({
  outputs: {
    [OUTPUT_KEY]: { value, invocationId: "j1", status: "done", revision: 1 }
  }
});

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

describe("chartTraces", () => {
  it("makes one series per numeric column of a dataframe", () => {
    const traces = chartTraces(
      {
        type: "dataframe",
        columns: [{ name: "month" }, { name: "sales" }, { name: "costs" }],
        data: [
          ["Jan", 10, 4],
          ["Feb", 20, 6]
        ]
      },
      "line"
    );
    expect(traces).toHaveLength(2);
    expect(traces[0]).toMatchObject({
      type: "scatter",
      mode: "lines+markers",
      name: "sales",
      x: ["Jan", "Feb"],
      y: [10, 20]
    });
  });

  it("reads an array of records the same way", () => {
    const traces = chartTraces(
      [
        { label: "a", score: 1 },
        { label: "b", score: 2 }
      ],
      "bar"
    );
    expect(traces).toEqual([
      { type: "bar", name: "score", x: ["a", "b"], y: [1, 2] }
    ]);
  });

  it("numbers the rows when no column can serve as the category axis", () => {
    expect(chartTraces([3, 5], "scatter")).toEqual([
      { type: "scatter", mode: "markers", name: "value", x: ["1", "2"], y: [3, 5] }
    ]);
  });

  it("turns the first numeric column into pie values", () => {
    expect(
      chartTraces([{ label: "a", n: 3 }, { label: "b", n: 7 }], "pie")
    ).toEqual([{ type: "pie", labels: ["a", "b"], values: [3, 7] }]);
  });

  it("plots nothing when no column is numeric", () => {
    expect(chartTraces([{ label: "a" }, { label: "b" }], "line")).toEqual([]);
  });
});

describe("ChartWidget", () => {
  it("renders the plot once the binding holds plottable data", async () => {
    renderWidget(
      <ChartWidget id="c1" binding="result" chartKind="bar" label="Sales" />,
      withOutput([{ label: "a", score: 1 }])
    );
    expect(await screen.findByTestId("plotly")).toBeInTheDocument();
    expect(screen.getByText("Sales")).toBeInTheDocument();
  });

  it("shows the placeholder when the binding holds nothing", () => {
    renderWidget(
      <ChartWidget id="c1" binding="result" placeholder="No data" />
    );
    expect(screen.getByText("No data")).toBeInTheDocument();
    expect(screen.queryByTestId("plotly")).not.toBeInTheDocument();
  });
});
