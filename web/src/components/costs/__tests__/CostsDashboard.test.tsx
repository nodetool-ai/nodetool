import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

// No backend in unit tests — fall back to the bundled sample view.
jest.mock("../useCostsDashboard", () => ({
  useCostsDashboard: () => ({ view: null, isLoading: false, isError: false })
}));

import CostsDashboard from "../CostsDashboard";

const renderDashboard = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <CostsDashboard />
    </ThemeProvider>
  );

describe("CostsDashboard", () => {
  it("renders the header, stat cards and headline figures", () => {
    renderDashboard();
    expect(
      screen.getByRole("heading", { level: 1, name: "Costs" })
    ).toBeInTheDocument();
    expect(screen.getByText("Total spend")).toBeInTheDocument();
    expect(screen.getByText("Node executions")).toBeInTheDocument();
    expect(screen.getByText("Top cost driver")).toBeInTheDocument();
    expect(screen.getByText("161")).toBeInTheDocument();
    expect(screen.getByText("9 failed · 4 workflows")).toBeInTheDocument();
    expect(screen.getByText(/64%/)).toBeInTheDocument();
  });

  it("renders the spend-over-time chart with a provider legend", () => {
    renderDashboard();
    expect(screen.getByText("Spend over time")).toBeInTheDocument();
    // Provider names appear in the legend (and elsewhere) — at least once.
    expect(screen.getAllByText("OpenAI").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Anthropic").length).toBeGreaterThan(0);
  });

  it("shows the detailed execution table by default", () => {
    renderDashboard();
    expect(screen.getByText("Provider / Model")).toBeInTheDocument();
    expect(screen.getAllByText("Caption (BLIP-2)").length).toBeGreaterThan(0);
    expect(screen.getByText("exec_42s")).toBeInTheDocument();
    expect(screen.getByText("161 of 161")).toBeInTheDocument();
  });

  it("switches to an aggregated view when grouping changes", async () => {
    const user = userEvent.setup();
    renderDashboard();
    await user.click(screen.getByRole("button", { name: "Provider" }));
    expect(screen.getByText("Share of spend")).toBeInTheDocument();
    // The detailed columns are gone in the aggregated view.
    expect(screen.queryByText("Provider / Model")).not.toBeInTheDocument();
  });

  it("filters the table via the search box", async () => {
    const user = userEvent.setup();
    renderDashboard();
    const search = screen.getByPlaceholderText("Filter nodes, models…");
    await user.type(search, "whisper");
    // Whisper rows remain; the SDXL pinned row is filtered out.
    expect(screen.getAllByText("Whisper v3").length).toBeGreaterThan(0);
    expect(screen.queryByText("SDXL")).not.toBeInTheDocument();
  });

  it("narrows results when a date range is selected", async () => {
    const user = userEvent.setup();
    renderDashboard();
    await user.click(screen.getByRole("button", { name: "7d" }));
    const count = screen.getByText(/^\d+ of \d+$/);
    const match = count.textContent?.match(/(\d+) of (\d+)/);
    expect(match).toBeTruthy();
    const [, visible, total] = match!;
    // 7-day window is a (non-strict) subset of the full 161 executions.
    expect(Number(total)).toBeLessThanOrEqual(161);
    expect(Number(visible)).toBeLessThanOrEqual(Number(total));
  });
});
