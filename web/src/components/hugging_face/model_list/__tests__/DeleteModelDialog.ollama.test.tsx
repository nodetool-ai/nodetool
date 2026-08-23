/**
 * @jest-environment jsdom
 */
import { stub } from "../../../../test-utils/doubles";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../../__mocks__/themeMock";
import type { UnifiedModel } from "../../../../stores/ApiTypes";

const mockOllamaDelete = jest.fn();
const mockHfDelete = jest.fn();

jest.mock("../../../../lib/trpc", () => ({
  trpc: {
    models: {
      huggingfaceDelete: { mutate: (...a: unknown[]) => mockHfDelete(...a) },
      ollamaDelete: { mutate: (...a: unknown[]) => mockOllamaDelete(...a) }
    }
  }
}));

jest.mock("../../../../utils/fileExplorer", () => ({
  isFileExplorerAvailable: () => false,
  openOllamaPath: jest.fn(),
  openInExplorer: jest.fn()
}));

const mockAddNotification = jest.fn();
jest.mock("../../../../stores/NotificationStore", () => ({
  useNotificationStore: (selector: (s: unknown) => unknown) =>
    selector({ addNotification: mockAddNotification })
}));

const mockUseModels = jest.fn();
jest.mock("../useModels", () => ({
  useModels: (...a: unknown[]) => mockUseModels(...a)
}));

import DeleteModelDialog from "../DeleteModelDialog";

const OLLAMA_MODEL: UnifiedModel = stub<UnifiedModel>({
  id: "llama3.1:8b",
  name: "llama3.1:8b",
  repo_id: "llama3.1:8b",
  type: "llama_model",
  path: null
});

const renderDialog = (onClose = () => undefined) => {
  const qc = new QueryClient();
  render(
    <ThemeProvider theme={mockTheme}>
      <QueryClientProvider client={qc}>
        <DeleteModelDialog modelId="llama3.1:8b" onClose={onClose} />
      </QueryClientProvider>
    </ThemeProvider>
  );
};

beforeEach(() => {
  mockOllamaDelete.mockReset().mockResolvedValue(true);
  mockHfDelete.mockReset().mockResolvedValue(true);
  mockAddNotification.mockReset();
  mockUseModels.mockReset().mockReturnValue({ allModels: [OLLAMA_MODEL] });
});

describe("DeleteModelDialog — Ollama models", () => {
  it("deletes through models.ollamaDelete and closes", async () => {
    const onClose = jest.fn();
    renderDialog(onClose);

    await userEvent.click(screen.getByRole("button", { name: /^Delete$/i }));

    await waitFor(() =>
      expect(mockOllamaDelete).toHaveBeenCalledWith({ model: "llama3.1:8b" })
    );
    expect(mockHfDelete).not.toHaveBeenCalled();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("reports a refused delete instead of claiming success", async () => {
    mockOllamaDelete.mockResolvedValue(false);
    const onClose = jest.fn();
    renderDialog(onClose);

    await userEvent.click(screen.getByRole("button", { name: /^Delete$/i }));

    await waitFor(() =>
      expect(mockAddNotification).toHaveBeenCalledWith(
        expect.objectContaining({ type: "error" })
      )
    );
    expect(onClose).not.toHaveBeenCalled();
  });
});
