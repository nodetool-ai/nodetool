import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import { MAX_X_LABELS, SpendOverTimeChart } from "../SpendOverTimeChart";
import type { DayPoint } from "../costsData";

const daysEndingOct13 = (count: number): DayPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    date: new Date(2026, 9, 13 - (count - 1 - i)),
    values: {},
    total: 0
  }));

const renderChart = (days: DayPoint[]) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <SpendOverTimeChart
        days={days}
        providers={[]}
        stackOrder={[]}
        rangeLabel="daily"
      />
    </ThemeProvider>
  );

describe("SpendOverTimeChart x axis", () => {
  it.each([7, 14, 30, 90])(
    "labels at most a fitting number of dates for %i days, ending on the latest day",
    (count) => {
      renderChart(daysEndingOct13(count));

      const labels = screen
        .getAllByTestId("spend-axis-date")
        .map((label) => label.textContent);

      expect(labels.length).toBeLessThanOrEqual(MAX_X_LABELS);
      expect(labels[labels.length - 1]).toBe("10/13");
    }
  );

  it("keeps a label from widening its column", () => {
    renderChart(daysEndingOct13(90));

    const label = screen.getAllByTestId("spend-axis-date")[0];
    expect(label).toHaveStyle({ position: "absolute", whiteSpace: "nowrap" });
  });
});
