import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import mockTheme from "../../../__mocks__/themeMock";
import ASRModelMenuDialog from "../ASRModelMenuDialog";
import { useProviders } from "../../../hooks/useProviders";
import { useASRModelsByProvider } from "../../../hooks/useModelsByProvider";
import { trpc } from "../../../lib/trpc";
import type { UnifiedModel } from "../../../stores/ApiTypes";

jest.mock("../../../hooks/useProviders");
jest.mock("../../../hooks/useModelsByProvider", () => ({
  useASRModelsByProvider: jest.fn()
}));
jest.mock("../../../lib/trpc", () => ({
  trpc: { models: { recommendedAsr: { query: jest.fn() } } }
}));

const whisperBase: UnifiedModel = {
  id: "ggerganov/whisper.cpp/ggml-base.en.bin",
  type: "hf.whisper_cpp",
  name: "base.en",
  repo_id: "ggerganov/whisper.cpp",
  path: "ggml-base.en.bin",
  downloaded: false,
  provider: "whisper_cpp"
};

// jsdom has no layout: give elements a size so the virtualizer renders rows.
const originalSize = {
  offsetWidth: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth"),
  offsetHeight: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight")
};

beforeAll(() => {
  Object.defineProperties(HTMLElement.prototype, {
    offsetWidth: { configurable: true, value: 400 },
    offsetHeight: { configurable: true, value: 400 }
  });
});

afterAll(() => {
  Object.defineProperties(HTMLElement.prototype, {
    offsetWidth: originalSize.offsetWidth ?? { configurable: true, value: 0 },
    offsetHeight: originalSize.offsetHeight ?? { configurable: true, value: 0 }
  });
});

beforeEach(() => {
  jest.mocked(useProviders).mockReturnValue({
    providers: [
      {
        provider: "whisper_cpp",
        capabilities: ["automatic_speech_recognition"],
        access: "in_process",
        display_name: "whisper.cpp"
      }
    ],
    isLoading: false,
    isFetching: false,
    error: null
  });
  // whisper.cpp lists only the files on disk, so a fresh install lists none.
  jest.mocked(useASRModelsByProvider).mockReturnValue({
    models: [],
    providers: ["whisper_cpp"],
    isLoading: false,
    isFetching: false,
    error: null,
    refetch: jest.fn()
  });
  jest.mocked(trpc.models.recommendedAsr.query).mockResolvedValue([
    whisperBase
  ]);
});

const renderDialog = (recommendedModels?: UnifiedModel[]) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <ThemeProvider theme={mockTheme}>
          <ASRModelMenuDialog
            open
            onClose={jest.fn()}
            recommendedModels={recommendedModels}
          />
        </ThemeProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );

it("offers recommended whisper.cpp files when the caller passes none", async () => {
  renderDialog();
  expect(await screen.findByText("base.en")).toBeInTheDocument();
  expect(trpc.models.recommendedAsr.query).toHaveBeenCalledTimes(1);
});

it("offers recommended whisper.cpp files when the caller passes an empty list", async () => {
  renderDialog([]);
  expect(await screen.findByText("base.en")).toBeInTheDocument();
});
