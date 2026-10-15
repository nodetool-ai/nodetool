import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import mockTheme from "../../../__mocks__/themeMock";
import ModelMenuDialogBase from "../shared/ModelMenuDialogBase";
import { useLanguageModelMenuStore } from "../../../stores/ModelMenuStore";
import useModelPreferencesStore from "../../../stores/ModelPreferencesStore";
import { useProviders } from "../../../hooks/useProviders";
import { openProviderOnboarding } from "../../../stores/ProviderOnboardingStore";
import type { LanguageModel } from "../../../stores/ApiTypes";

jest.mock("../../../hooks/useProviders");
jest.mock("../../../stores/ProviderOnboardingStore", () => ({
  ...jest.requireActual("../../../stores/ProviderOnboardingStore"),
  openProviderOnboarding: jest.fn()
}));
jest.mock("../../../hooks/useModelAvailability", () => {
  const available = () => ({
    available: true,
    providerEnabled: true,
    hasKey: true
  });
  return { useModelAvailability: () => available };
});

const apiModel = (
  id: string,
  name: string,
  provider: string
): LanguageModel =>
  ({
    type: "language_model",
    id,
    name,
    provider,
    execution: { state: "ready", kind: "api", label: "API" }
  }) as unknown as LanguageModel;

const localModel = (id: string, name: string): LanguageModel =>
  ({
    type: "language_model",
    id,
    name,
    provider: "ollama",
    execution: { state: "ready", kind: "local", label: "Local" }
  }) as unknown as LanguageModel;

const gpt = apiModel("gpt-4o", "GPT-4o", "openai");
const claude = apiModel("claude-sonnet", "Claude Sonnet", "anthropic");
const llama = localModel("llama3", "Llama 3");

type Props = {
  open?: boolean;
  models?: LanguageModel[];
  selectedModel?: { id: string; provider?: string };
  promptForApiKey?: boolean;
  onClose?: () => void;
};

const ui = ({
  open = true,
  models = [],
  selectedModel,
  promptForApiKey = true,
  onClose = jest.fn()
}: Props) => (
  <QueryClientProvider client={new QueryClient()}>
    <MemoryRouter>
      <ThemeProvider theme={mockTheme}>
        <ModelMenuDialogBase<LanguageModel>
          open={open}
          onClose={onClose}
          onModelChange={jest.fn()}
          modelData={{
            models,
            isLoading: false,
            error: null,
            providers: ["openai", "anthropic", "ollama", "chatgpt"]
          }}
          storeHook={useLanguageModelMenuStore}
          modelType="language_model"
          selectedModel={selectedModel}
          promptForApiKey={promptForApiKey}
        />
      </ThemeProvider>
    </MemoryRouter>
  </QueryClientProvider>
);

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
  for (const [key, descriptor] of Object.entries(originalSize)) {
    if (descriptor) {
      Object.defineProperty(HTMLElement.prototype, key, descriptor);
    }
  }
});

beforeEach(() => {
  jest.mocked(openProviderOnboarding).mockClear();
  jest.mocked(useProviders).mockReturnValue({
    providers: [{ provider: "ollama", capabilities: ["generate_message"] }],
    isLoading: false,
    isFetching: false,
    error: null
  } as unknown as ReturnType<typeof useProviders>);
  useLanguageModelMenuStore.setState({ search: "", selectedProvider: null });
  useModelPreferencesStore.setState({ favorites: new Set(), recents: [] });
});

describe("Add an API key row", () => {
  it("shows when only local models are listed and opens the provider dialog", () => {
    const onClose = jest.fn();
    render(ui({ models: [llama], onClose }));

    fireEvent.click(screen.getByText("Add an API key"));

    expect(onClose).toHaveBeenCalled();
    expect(openProviderOnboarding).toHaveBeenCalledWith(
      expect.objectContaining({ capability: "generate_message" })
    );
  });

  it("is hidden once an API provider has a ready model", () => {
    render(ui({ models: [llama, gpt] }));
    expect(screen.queryByText("Add an API key")).toBeNull();
  });

  it("is hidden for pickers that do not ask for it", () => {
    render(ui({ models: [llama], promptForApiKey: false }));
    expect(screen.queryByText("Add an API key")).toBeNull();
  });
});

describe("provider with no models", () => {
  it("does not show for a provider that has models", () => {
    useLanguageModelMenuStore.setState({ selectedProvider: "openai" });
    render(ui({ models: [llama, gpt] }));
    expect(screen.queryByText(/has no models yet/)).toBeNull();
  });

  it("shows when the user clicks an empty provider while the menu is open", () => {
    render(ui({ models: [llama, gpt] }));
    fireEvent.click(screen.getByText("ChatGPT"));
    expect(screen.getByText("ChatGPT has no models yet")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Connect ChatGPT" }));
    expect(openProviderOnboarding).toHaveBeenCalled();
  });
});

describe("provider filter after the provider set changes", () => {
  it("returns to All models when a connected provider adds models", () => {
    useLanguageModelMenuStore.setState({ selectedProvider: "anthropic" });
    const { rerender } = render(ui({ models: [claude] }));
    // Closing keeps the filter, as before.
    rerender(ui({ open: false, models: [claude] }));
    expect(useLanguageModelMenuStore.getState().selectedProvider).toBe(
      "anthropic"
    );

    // A key was connected while closed: OpenAI now lists models.
    rerender(ui({ open: false, models: [claude, gpt] }));
    rerender(ui({ open: true, models: [claude, gpt] }));

    expect(useLanguageModelMenuStore.getState().selectedProvider).toBeNull();
    expect(screen.getByText("GPT-4o")).toBeTruthy();
  });

  it("keeps the filter when the provider set is unchanged", () => {
    useLanguageModelMenuStore.setState({ selectedProvider: "anthropic" });
    const { rerender } = render(ui({ models: [claude, gpt] }));
    rerender(ui({ open: false, models: [claude, gpt] }));
    rerender(ui({ open: true, models: [claude, gpt] }));
    expect(useLanguageModelMenuStore.getState().selectedProvider).toBe(
      "anthropic"
    );
  });

  it("clears a filter whose provider has no models on opening", () => {
    useLanguageModelMenuStore.setState({ selectedProvider: "chatgpt" });
    render(ui({ models: [gpt] }));
    expect(useLanguageModelMenuStore.getState().selectedProvider).toBeNull();
  });
});

describe("current model", () => {
  it("marks the selected model's row", () => {
    render(ui({ models: [gpt, claude], selectedModel: { id: "gpt-4o", provider: "openai" } }));

    const rows = screen.getAllByRole("button").filter((el) =>
      el.classList.contains("model-menu__model-item")
    );
    const current = rows.filter((el) => el.getAttribute("aria-current") === "true");
    expect(current).toHaveLength(1);
    expect(current[0].textContent).toContain("GPT-4o");
    expect(current[0].querySelector(".model-current-check")).not.toBeNull();
  });

  it("marks nothing without a selected model", () => {
    render(ui({ models: [gpt, claude] }));
    expect(document.querySelector("[aria-current='true']")).toBeNull();
  });
});
