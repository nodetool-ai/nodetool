/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import mockTheme from "../../../../__mocks__/themeMock";
import type { UseModelsResult } from "../useModels";

const mockUseModels = jest.fn();
jest.mock("../useModels", () => ({
  useModels: (...a: unknown[]) => mockUseModels(...a)
}));

const mockUseWorkers = jest.fn();
jest.mock("../../../../hooks/useWorkers", () => ({
  useWorkers: () => mockUseWorkers()
}));

// Keep the heavy child components inert — this test is about the header toggle
// and the empty-state, not the sidebars/hero.
jest.mock("../ModelTypeSidebar", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../ModelsRightSidebar", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../LocalModelsHero", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../../onboarding/ModelOnboarding", () => ({
  __esModule: true,
  default: () => null
}));

import ModelListIndex from "../ModelListIndex";
import { useModelManagerStore } from "../../../../stores/ModelManagerStore";

const EMPTY_MODELS: UseModelsResult = {
  modelTypes: ["All"],
  availableModelTypes: new Set(["All"]),
  modelCountsByType: { All: 0 },
  allModels: [],
  groupedModels: {},
  filteredModels: [],
  isLoading: false,
  isFetching: false,
  error: null,
  handleShowInExplorer: async () => undefined
};

const makeInstance = (overrides: Record<string, unknown> = {}) => ({
  id: "i-1",
  profile_name: "pod-a",
  target: "runpod",
  provider_ref: "ref",
  ws_url: "wss://x",
  token: null,
  status: "attached",
  attached_to: "local",
  created_at: "",
  last_activity_at: "",
  estimated_cost_usd: null,
  ...overrides
});

const renderIndex = () => {
  const qc = new QueryClient();
  return render(
    <ThemeProvider theme={mockTheme}>
      <QueryClientProvider client={qc}>
        <ModelListIndex />
      </QueryClientProvider>
    </ThemeProvider>
  );
};

beforeEach(() => {
  mockUseModels.mockReset().mockReturnValue(EMPTY_MODELS);
  mockUseWorkers.mockReset().mockReturnValue({ activeWorker: null });
  useModelManagerStore.setState({
    scope: "local",
    source: "installed",
    // These tests exercise the Installed/Recommended views directly, so pin the
    // source as already-settled to bypass the empty-install onboarding default.
    sourceInitialized: true,
    modelSearchTerm: "",
    selectedModelType: "All"
  });
});

describe("ModelListIndex scope toggle", () => {
  it("hides the scope toggle when no worker is attached", () => {
    mockUseWorkers.mockReturnValue({ activeWorker: null });
    renderIndex();
    expect(
      screen.queryByRole("button", { name: /Local/i })
    ).not.toBeInTheDocument();
  });

  it("shows the Local + worker toggle when a worker is attached", () => {
    mockUseWorkers.mockReturnValue({ activeWorker: makeInstance() });
    renderIndex();
    expect(
      screen.getByRole("button", { name: /Local/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /pod-a/i })
    ).toBeInTheDocument();
  });

  it("renders the worker empty-state when scope=worker and the cache is empty", () => {
    mockUseWorkers.mockReturnValue({ activeWorker: makeInstance() });
    useModelManagerStore.setState({ scope: "worker" });
    renderIndex();
    expect(
      screen.getByText(/No models cached on this worker yet/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/any model you download lands on its volume/i)
    ).toBeInTheDocument();
  });

  it("always shows the Installed/Recommended source toggle", () => {
    mockUseWorkers.mockReturnValue({ activeWorker: null });
    renderIndex();
    expect(
      screen.getByRole("button", { name: /installed models/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /recommended models/i })
    ).toBeInTheDocument();
  });

  it("switching to Recommended sets the source and resets filters", async () => {
    useModelManagerStore.setState({
      selectedModelType: "hf.text_generation"
    });
    renderIndex();

    await userEvent.click(
      screen.getByRole("button", { name: /recommended models/i })
    );

    const state = useModelManagerStore.getState();
    expect(state.source).toBe("recommended");
    expect(state.selectedModelType).toBe("All");
  });

  it("renders the recommended empty-state when source=recommended and the catalog is empty", () => {
    useModelManagerStore.setState({ source: "recommended" });
    renderIndex();
    expect(
      screen.getByText(/No recommended models/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/gathered from the nodes you have installed/i)
    ).toBeInTheDocument();
  });

  it("defaults to onboarding when nothing is installed locally", async () => {
    mockUseWorkers.mockReturnValue({ activeWorker: null });
    useModelManagerStore.setState({
      source: "installed",
      sourceInitialized: false
    });
    renderIndex();
    await waitFor(() =>
      expect(useModelManagerStore.getState().source).toBe("onboarding")
    );
    expect(useModelManagerStore.getState().sourceInitialized).toBe(true);
  });

  it("stays on Installed when local models exist", async () => {
    mockUseWorkers.mockReturnValue({ activeWorker: null });
    mockUseModels.mockReturnValue({
      ...EMPTY_MODELS,
      allModels: [{ id: "org/m", name: "m", type: "hf.text_generation" }],
      filteredModels: [{ id: "org/m", name: "m", type: "hf.text_generation" }]
    });
    useModelManagerStore.setState({
      source: "installed",
      sourceInitialized: false
    });
    renderIndex();
    // Give the auto-default effect a chance to (not) run.
    await new Promise((r) => setTimeout(r, 0));
    expect(useModelManagerStore.getState().source).toBe("installed");
  });

  it("does not auto-default to onboarding while a worker is attached", async () => {
    mockUseWorkers.mockReturnValue({ activeWorker: makeInstance() });
    useModelManagerStore.setState({
      scope: "local",
      source: "installed",
      sourceInitialized: false
    });
    renderIndex();
    await new Promise((r) => setTimeout(r, 0));
    expect(useModelManagerStore.getState().source).toBe("installed");
  });

  it("does not bounce back to onboarding after the user opens Installed", async () => {
    mockUseWorkers.mockReturnValue({ activeWorker: null });
    // User has explicitly settled on Installed even though it's empty.
    useModelManagerStore.setState({
      source: "installed",
      sourceInitialized: true
    });
    renderIndex();
    await new Promise((r) => setTimeout(r, 0));
    expect(useModelManagerStore.getState().source).toBe("installed");
  });

  it("falls back to Local scope when the worker detaches", async () => {
    // Worker scope is active but no worker is attached (detached mid-session).
    mockUseWorkers.mockReturnValue({ activeWorker: null });
    useModelManagerStore.setState({ scope: "worker" });
    renderIndex();
    await waitFor(() =>
      expect(useModelManagerStore.getState().scope).toBe("local")
    );
  });
});
