import { render, screen, fireEvent, within } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { localProviderSpec, type LocalProviderSpec } from "@nodetool-ai/protocol";
import mockTheme from "../../../__mocks__/themeMock";
import ModelMenuDialogBase from "../shared/ModelMenuDialogBase";
import { useLanguageModelMenuStore } from "../../../stores/ModelMenuStore";
import useModelPreferencesStore from "../../../stores/ModelPreferencesStore";
import { useProviders } from "../../../hooks/useProviders";
import {
  useLocalProviderInstalls,
  type LocalInstallStatus,
  type LocalProviderInstallInfo
} from "../../../hooks/useLocalProviderInstalls";
import type { LanguageModel } from "../../../stores/ApiTypes";

jest.mock("../../../hooks/useProviders");
jest.mock("../../../hooks/useLocalProviderInstalls");
jest.mock("../../../hooks/useModelAvailability", () => {
  const available = () => ({ available: true, providerEnabled: true, hasKey: true });
  return { useModelAvailability: () => available };
});

const llamaSpec = localProviderSpec("node_llama_cpp") as LocalProviderSpec;
const sdSpec = localProviderSpec("stable_diffusion_cpp") as LocalProviderSpec;
const install = jest.fn(async () => true);
const onModelChange = jest.fn();

const installs = (
  entries: Array<[LocalProviderSpec, LocalInstallStatus]>
): Map<string, LocalProviderInstallInfo> =>
  new Map(entries.map(([spec, status]) => [spec.provider, { spec, status, install }]));

const qwen = {
  type: "language_model",
  id: "hf:unsloth/Qwen3-4B-Instruct-2507-GGUF/Qwen3-4B-Instruct-2507-Q4_K_M.gguf",
  name: "Qwen3 4B Instruct",
  provider: "node_llama_cpp",
  execution: { state: "ready", kind: "server", label: "Server" }
} as unknown as LanguageModel;

const ui = (
  models: LanguageModel[],
  localCapabilities?: string[],
  providers: string[] = ["openai"]
) => (
  <QueryClientProvider client={new QueryClient()}>
    <MemoryRouter>
      <ThemeProvider theme={mockTheme}>
        <ModelMenuDialogBase<LanguageModel>
          open
          onClose={jest.fn()}
          onModelChange={onModelChange}
          modelData={{ models, isLoading: false, error: null, providers }}
          storeHook={useLanguageModelMenuStore}
          modelType="language_model"
          localCapabilities={localCapabilities}
        />
      </ThemeProvider>
    </MemoryRouter>
  </QueryClientProvider>
);

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
  install.mockClear();
  onModelChange.mockClear();
  jest.mocked(useProviders).mockReturnValue({
    providers: [],
    isLoading: false,
    isFetching: false,
    error: null
  } as unknown as ReturnType<typeof useProviders>);
  useLanguageModelMenuStore.setState({ search: "", selectedProvider: null });
  useModelPreferencesStore.setState({ favorites: new Set(), recents: [] });
});

describe("local provider install in the model picker", () => {
  it("lists an uninstalled local provider and installs it from its empty state", () => {
    jest.mocked(useLocalProviderInstalls).mockReturnValue(
      installs([[llamaSpec, "missing"], [sdSpec, "missing"]])
    );
    render(ui([], ["generate_message"]));
    // sd.cpp serves no chat capability, so the chat picker leaves it out.
    expect(screen.queryByText("sd.cpp")).toBeNull();
    fireEvent.click(screen.getByText("llama.cpp"));
    fireEvent.click(screen.getByRole("button", { name: "Install llama.cpp" }));
    expect(install).toHaveBeenCalledTimes(1);
  });

  it("shows progress while the package installs", () => {
    jest.mocked(useLocalProviderInstalls).mockReturnValue(installs([[llamaSpec, "installing"]]));
    useLanguageModelMenuStore.setState({ selectedProvider: "node_llama_cpp" });
    render(ui([], ["generate_message"]));
    expect(screen.getByText("Installing llama.cpp")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Install llama.cpp" })).toBeNull();
  });

  it("offers the install on a model row instead of selecting the model", () => {
    jest.mocked(useLocalProviderInstalls).mockReturnValue(installs([[llamaSpec, "missing"]]));
    render(ui([qwen], ["generate_message"]));
    const row = screen.getByText("Qwen3 4B Instruct").closest(".model-menu__model-item") as HTMLElement;
    expect(row.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(row);
    expect(onModelChange).not.toHaveBeenCalled();
    fireEvent.click(within(row).getByRole("button", { name: "Install llama.cpp on this computer" }));
    expect(install).toHaveBeenCalledTimes(1);
  });

  it("adds nothing once the package is installed", () => {
    jest.mocked(useLocalProviderInstalls).mockReturnValue(installs([[llamaSpec, "installed"]]));
    render(ui([qwen], ["generate_message"]));
    expect(screen.queryByRole("button", { name: /^Install/ })).toBeNull();
  });

  it("adds nothing to a picker that names no local capability", () => {
    jest.mocked(useLocalProviderInstalls).mockReturnValue(installs([[llamaSpec, "missing"]]));
    render(ui([]));
    expect(screen.queryByText("llama.cpp")).toBeNull();
  });
});

describe("local providers without models", () => {
  it("hides a local provider that has no models and nothing to install", () => {
    jest.mocked(useLocalProviderInstalls).mockReturnValue(new Map());
    // llama_cpp connects to a llama-server the user runs. With none set up,
    // it lists no models.
    render(ui([qwen], ["generate_message"], ["openai", "llama_cpp", "node_llama_cpp"]));
    const sidebar = within(screen.getByRole("navigation", { name: "Model sources" }));
    expect(sidebar.getByText("llama.cpp")).toBeInTheDocument();
    expect(sidebar.queryByText("llama-server")).toBeNull();
    expect(sidebar.getByText("OpenAI")).toBeInTheDocument();
  });
});
