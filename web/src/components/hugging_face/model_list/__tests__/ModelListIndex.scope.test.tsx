/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
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
    modelSearchTerm: "",
    selectedModelType: "All",
    filterStatus: "all"
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
      screen.getByText(/Download one to its volume\./i)
    ).toBeInTheDocument();
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
