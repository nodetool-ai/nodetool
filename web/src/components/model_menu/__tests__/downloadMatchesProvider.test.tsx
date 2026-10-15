import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import mockTheme from "../../../__mocks__/themeMock";
import ASRModelMenuDialog from "../ASRModelMenuDialog";
import { useProviders } from "../../../hooks/useProviders";
import { useASRModelsByProvider } from "../../../hooks/useModelsByProvider";
import { downloadMatchesProvider } from "../shared/downloadMatchesProvider";
import type { UnifiedModel } from "../../../stores/ApiTypes";

jest.mock("../../../hooks/useProviders");
jest.mock("../../../hooks/useModelsByProvider", () => ({
  useASRModelsByProvider: jest.fn()
}));
jest.mock("../../../lib/trpc", () => ({
  trpc: { models: { recommendedAsr: { query: jest.fn().mockResolvedValue([]) } } }
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

describe("downloadMatchesProvider", () => {
  it("matches a download that names its provider only to that provider", () => {
    expect(downloadMatchesProvider(whisperBase, "whisper_cpp")).toBe(true);
    expect(downloadMatchesProvider(whisperBase, "openai")).toBe(false);
  });

  it("puts Ollama tags under Ollama and GGUF files under llama.cpp", () => {
    const tag = { id: "gpt-oss:20b", type: "llama_model", name: "GPT - OSS" } as UnifiedModel;
    const gguf = { id: "q/gemma.gguf", type: "llama_cpp_model", name: "Gemma" } as UnifiedModel;
    expect(downloadMatchesProvider(tag, "ollama")).toBe(true);
    expect(downloadMatchesProvider(tag, "openai")).toBe(false);
    expect(downloadMatchesProvider(gguf, "llama_cpp")).toBe(true);
    expect(downloadMatchesProvider(gguf, "openai")).toBe(false);
  });
});

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

// UX research study 4: with the OpenAI filter picked, the list still offered
// local downloads, so people read the filter as broken.
it("leaves other providers' downloads out of a provider filter", async () => {
  jest.mocked(useProviders).mockReturnValue({
    providers: [
      {
        provider: "openai",
        capabilities: ["automatic_speech_recognition"],
        access: "remote_api",
        display_name: "OpenAI"
      },
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
  jest.mocked(useASRModelsByProvider).mockReturnValue({
    models: [
      {
        type: "asr_model",
        id: "whisper-1",
        name: "Cloud Whisper",
        provider: "openai"
      }
    ],
    providers: ["openai", "whisper_cpp"],
    isLoading: false,
    isFetching: false,
    error: null,
    refetch: jest.fn()
  });
  const user = userEvent.setup();
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <ThemeProvider theme={mockTheme}>
          <ASRModelMenuDialog open onClose={jest.fn()} recommendedModels={[whisperBase]} />
        </ThemeProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );

  expect(await screen.findByText("base.en")).toBeInTheDocument();
  await user.click(screen.getAllByText("OpenAI")[0]);
  await waitFor(() => expect(screen.queryByText("base.en")).not.toBeInTheDocument());
  expect(screen.getByText("Cloud Whisper")).toBeInTheDocument();
});
