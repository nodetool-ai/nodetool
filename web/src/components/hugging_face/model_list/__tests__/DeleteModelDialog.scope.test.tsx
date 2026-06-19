/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../../__mocks__/themeMock";
import type { UnifiedModel } from "../../../../stores/ApiTypes";

const mockDelete = jest.fn();

jest.mock("../../../../lib/trpc", () => ({
  trpc: {
    models: {
      huggingfaceDelete: { mutate: (...a: unknown[]) => mockDelete(...a) }
    }
  }
}));

jest.mock("../../../../utils/fileExplorer", () => ({
  isFileExplorerAvailable: () => false,
  openOllamaPath: jest.fn(),
  openInExplorer: jest.fn()
}));

const mockUseModels = jest.fn();
jest.mock("../useModels", () => ({
  useModels: (...a: unknown[]) => mockUseModels(...a)
}));

import DeleteModelDialog from "../DeleteModelDialog";

const HF_MODEL: UnifiedModel = {
  id: "org/m",
  name: "org/m",
  repo_id: "org/m",
  type: "hf.model",
  path: null
} as unknown as UnifiedModel;

const renderDialog = (scope: "local" | "worker") => {
  const qc = new QueryClient();
  const invalidateSpy = jest.spyOn(qc, "invalidateQueries");
  render(
    <ThemeProvider theme={mockTheme}>
      <QueryClientProvider client={qc}>
        <DeleteModelDialog
          modelId="org/m"
          onClose={() => undefined}
          scope={scope}
        />
      </QueryClientProvider>
    </ThemeProvider>
  );
  return invalidateSpy;
};

beforeEach(() => {
  mockDelete.mockReset().mockResolvedValue(true);
  mockUseModels.mockReset().mockReturnValue({ allModels: [HF_MODEL] });
});

describe("DeleteModelDialog scope", () => {
  it("passes scope=worker to huggingfaceDelete and invalidates the scope key", async () => {
    const invalidateSpy = renderDialog("worker");

    await userEvent.click(screen.getByRole("button", { name: /^Delete$/i }));

    await waitFor(() =>
      expect(mockDelete).toHaveBeenCalledWith({
        repo_id: "org/m",
        scope: "worker"
      })
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["allModels", "worker"]
    });
  });

  it("passes scope=local by default", async () => {
    renderDialog("local");

    await userEvent.click(screen.getByRole("button", { name: /^Delete$/i }));

    await waitFor(() =>
      expect(mockDelete).toHaveBeenCalledWith({
        repo_id: "org/m",
        scope: "local"
      })
    );
  });
});
