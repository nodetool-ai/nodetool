/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../../__mocks__/themeMock";

const mockStartDownload = jest.fn();
jest.mock("../../../../stores/ModelDownloadStore", () => ({
  useModelDownloadStore: (sel: (s: unknown) => unknown) =>
    sel({ startDownload: mockStartDownload, downloads: {} })
}));

jest.mock("../../../../stores/HfCacheStatusStore", () => ({
  useHfCacheStatusStore: (sel: (s: unknown) => unknown) =>
    sel({ statuses: {}, pending: {}, version: 0, ensureStatuses: jest.fn() })
}));

const mockUseWorkers = jest.fn();
jest.mock("../../../../hooks/useWorkers", () => ({
  useWorkers: () => mockUseWorkers()
}));

// Replace the heavy row with a button that just fires onDownload, so the test
// targets the routing logic, not the row's rendering/cache internals.
jest.mock("../../../hugging_face/model_list/ModelListItem", () => ({
  __esModule: true,
  default: ({
    model,
    onDownload
  }: {
    model: { repo_id?: string | null };
    onDownload?: () => void;
  }) => <button onClick={onDownload}>Download {model.repo_id}</button>
}));
jest.mock("../../../hugging_face/ModelPackCard", () => ({
  __esModule: true,
  default: () => null
}));

import RecommendedModelsView from "../RecommendedModelsView";

const MODEL = {
  id: "org/m",
  name: "org/m",
  repo_id: "org/m",
  type: "hf.text_generation",
  downloaded: false
} as never;

const renderView = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <RecommendedModelsView recommendedModels={[MODEL]} modelPacks={[]} />
    </ThemeProvider>
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockUseWorkers.mockReturnValue({ activeWorker: null });
});

describe("RecommendedModelsView download routing", () => {
  it("routes the download to the worker when one is attached", async () => {
    mockUseWorkers.mockReturnValue({
      activeWorker: { id: "i-1", status: "attached" }
    });
    renderView();

    await userEvent.click(
      screen.getByRole("button", { name: /download org\/m/i })
    );

    expect(mockStartDownload).toHaveBeenCalledWith(
      "org/m",
      "hf.text_generation",
      undefined,
      undefined,
      undefined,
      "worker"
    );
  });

  it("routes the download locally when no worker is attached", async () => {
    mockUseWorkers.mockReturnValue({ activeWorker: null });
    renderView();

    await userEvent.click(
      screen.getByRole("button", { name: /download org\/m/i })
    );

    expect(mockStartDownload).toHaveBeenCalledWith(
      "org/m",
      "hf.text_generation",
      undefined,
      undefined,
      undefined,
      "local"
    );
  });
});
