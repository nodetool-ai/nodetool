import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

jest.mock("../useCostsDashboard", () => ({
  useCostsDashboard: jest.fn()
}));

import CostsDashboard from "../CostsDashboard";
import { useCostsDashboard } from "../useCostsDashboard";
import type { CostsView } from "../costsView";

const mockHook = useCostsDashboard as jest.MockedFunction<
  typeof useCostsDashboard
>;

const view: CostsView = {
  providers: [
    { id: "openai", label: "OpenAI", color: "#4FD18B", total: 1.35 },
    { id: "anthropic", label: "Anthropic", color: "#F2A65A", total: 0.98 }
  ],
  stackOrder: ["openai", "anthropic"],
  days: [
    {
      date: new Date(2026, 4, 16),
      values: { openai: 0.1, anthropic: 0.05 },
      total: 0.15
    },
    { date: new Date(2026, 4, 29), values: { openai: 0.2 }, total: 0.2 }
  ],
  executions: [
    {
      id: "exec_1",
      title: "GenerateText",
      category: "llm",
      workflow: "Newsletter draft",
      providerId: "openai",
      model: "gpt-4o",
      tokensIn: 1200,
      tokensOut: 380,
      runtimeSec: 1.5,
      status: "ok",
      timestamp: new Date(2026, 4, 29, 17, 47),
      cost: 0.012
    },
    {
      id: "exec_2",
      title: "StableDiffusionXL",
      category: "image",
      workflow: "Product shots batch",
      providerId: "replicate",
      model: "sdxl-1.0",
      tokensIn: null,
      tokensOut: null,
      runtimeSec: 7.5,
      status: "error",
      timestamp: new Date(2026, 4, 29, 13, 0),
      cost: 0.011
    }
  ],
  stats: {
    totalSpend: 2.33,
    executionCount: 42,
    failedCount: 3,
    avgPerExecution: 0.021,
    topDriver: { label: "gpt-4o", providerId: "openai", cost: 1.21 },
    deltaFraction: 0.64,
    workflowCount: 2
  }
};

const renderDashboard = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <CostsDashboard />
    </ThemeProvider>
  );

describe("CostsDashboard", () => {
  beforeEach(() => {
    mockHook.mockReturnValue({ view, isLoading: false, isError: false });
  });

  it("renders the header, stat cards and headline figures", () => {
    renderDashboard();
    expect(
      screen.getByRole("heading", { level: 1, name: "Costs" })
    ).toBeInTheDocument();
    expect(screen.getByText("Total spend")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("3 failed · 2 workflows")).toBeInTheDocument();
    expect(screen.getByText(/64%/)).toBeInTheDocument();
    expect(screen.getByText("Top cost driver")).toBeInTheDocument();
  });

  it("renders the spend-over-time chart with a provider legend", () => {
    renderDashboard();
    expect(screen.getByText("Spend over time")).toBeInTheDocument();
    expect(screen.getAllByText("OpenAI").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Anthropic").length).toBeGreaterThan(0);
  });

  it("shows the detailed execution table by default", () => {
    renderDashboard();
    expect(screen.getByText("Provider / Model")).toBeInTheDocument();
    expect(screen.getByText("GenerateText")).toBeInTheDocument();
    expect(screen.getByText("exec_1")).toBeInTheDocument();
    expect(screen.getByText("2 of 2")).toBeInTheDocument();
  });

  it("switches to an aggregated view when grouping changes", async () => {
    const user = userEvent.setup();
    renderDashboard();
    await user.click(screen.getByRole("button", { name: "Provider" }));
    expect(screen.getByText("Share of spend")).toBeInTheDocument();
    expect(screen.queryByText("Provider / Model")).not.toBeInTheDocument();
  });

  it("filters the table via the search box", async () => {
    const user = userEvent.setup();
    renderDashboard();
    await user.type(
      screen.getByPlaceholderText("Filter nodes, models…"),
      "generate"
    );
    expect(screen.getByText("GenerateText")).toBeInTheDocument();
    expect(screen.queryByText("StableDiffusionXL")).not.toBeInTheDocument();
  });

  it("toggles the active date range", async () => {
    const user = userEvent.setup();
    renderDashboard();
    const sevenDay = screen.getByRole("button", { name: "7d" });
    await user.click(sevenDay);
    expect(sevenDay).toHaveAttribute("aria-pressed", "true");
  });

  it("shows a loading state with no fabricated data", () => {
    mockHook.mockReturnValue({ view: null, isLoading: true, isError: false });
    renderDashboard();
    expect(screen.getByText("Spend per node execution")).toBeInTheDocument();
    expect(screen.queryByText("Total spend")).not.toBeInTheDocument();
    expect(screen.queryByText("Spend over time")).not.toBeInTheDocument();
  });

  it("shows an error state", () => {
    mockHook.mockReturnValue({ view: null, isLoading: false, isError: true });
    renderDashboard();
    expect(screen.getByText(/load cost data/i)).toBeInTheDocument();
    expect(screen.queryByText("Total spend")).not.toBeInTheDocument();
  });
});
