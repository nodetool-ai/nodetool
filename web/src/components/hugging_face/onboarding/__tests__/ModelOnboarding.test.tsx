/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../../__mocks__/themeMock";

// EngineGuide pulls in react-router (Package Manager link) and the node-pack
// store; keep it inert — this test is about the hardware card and model rows.
jest.mock("../EngineGuide", () => ({
  __esModule: true,
  default: () => <div data-testid="engine-guide" />
}));

// Avoid the HF cache network scan; report nothing installed.
jest.mock("../../../../stores/HfCacheStatusStore", () => ({
  useHfCacheStatusStore: (selector: (s: unknown) => unknown) =>
    selector({
      statuses: {},
      version: 0,
      ensureStatuses: jest.fn()
    })
}));

import ModelOnboarding from "../ModelOnboarding";
import { useSystemStatsStore } from "../../../../stores/systemStatsHandler";
import { useModelManagerStore } from "../../../../stores/ModelManagerStore";
import type { SystemStats } from "../../../../stores/ApiTypes";

const renderOnboarding = (onDownload = jest.fn()) => {
  render(
    <ThemeProvider theme={mockTheme}>
      <ModelOnboarding onDownload={onDownload} />
    </ThemeProvider>
  );
  return onDownload;
};

beforeEach(() => {
  useSystemStatsStore.getState().setStats({
    cpu_percent: 0,
    memory_percent: 0,
    vram_total_gb: 12,
    memory_total_gb: 32
  } as SystemStats);
  useModelManagerStore.getState().setVramOverrideGb(null);
});

describe("ModelOnboarding", () => {
  it("shows the hardware budget and headline", () => {
    renderOnboarding();
    expect(
      screen.getByText(/Get started with local models/i)
    ).toBeInTheDocument();
    expect(screen.getByText("Your machine")).toBeInTheDocument();
    // 12 GB detected VRAM is used as the recommendation budget.
    expect(screen.getAllByText("12 GB").length).toBeGreaterThan(0);
  });

  it("renders the capability filter and recommended models", () => {
    renderOnboarding();
    expect(
      screen.getByRole("button", { name: /all capabilities/i })
    ).toBeInTheDocument();
    // A well-known catalog model is shown.
    expect(screen.getByText("Qwen2.5 7B")).toBeInTheDocument();
  });

  it("filters models when a capability is selected", async () => {
    const user = userEvent.setup();
    renderOnboarding();
    await user.click(screen.getByRole("button", { name: /Image Generation/i }));
    expect(screen.getByText("SDXL Turbo")).toBeInTheDocument();
    expect(screen.queryByText("Qwen2.5 7B")).not.toBeInTheDocument();
  });

  it("starts a download when a model's Download button is clicked", async () => {
    const user = userEvent.setup();
    const onDownload = renderOnboarding();
    const buttons = screen.getAllByRole("button", { name: /^Download$/i });
    await user.click(buttons[0]);
    expect(onDownload).toHaveBeenCalledTimes(1);
    expect(onDownload.mock.calls[0][0]).toHaveProperty("type");
  });

  it("marks models over budget as needing more memory", () => {
    // Drop the budget so FLUX (24 GB) can't fit.
    useModelManagerStore.getState().setVramOverrideGb(8);
    renderOnboarding();
    expect(screen.getByText("FLUX.1 schnell")).toBeInTheDocument();
    // The over-budget fit chip appears for at least one model.
    expect(
      screen.getAllByText(/Needs more memory/i).length
    ).toBeGreaterThan(0);
  });
});
