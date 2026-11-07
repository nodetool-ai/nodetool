import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@mui/material/styles";
import "@testing-library/jest-dom";
import mockTheme from "../../../__mocks__/themeMock";
import useRemoteSettingsStore, { type SettingWithValue } from "../../../stores/RemoteSettingStore";
import LocalComfyConnect from "../LocalComfyConnect";

const mockRestFetch = jest.fn();
jest.mock("../../../lib/rest-fetch", () => ({
  restFetch: (...args: unknown[]) => mockRestFetch(...args)
}));
const mockStart = jest.fn();
jest.mock("../../../hooks/useStartComfyWorkflow", () => ({
  useStartComfyWorkflow: () => ({ start: mockStart, starting: false })
}));
jest.mock("../../../serverState/useComfyNodeMetadata", () => ({
  refreshComfyNodeCatalog: jest.fn(async () => undefined)
}));

const setting = (env_var: string, value: string): SettingWithValue =>
  ({ env_var, value, group: "ComfyUI", is_secret: false }) as unknown as SettingWithValue;

const json = (body: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => body }) as Response;

function setup() {
  const saved: Record<string, string> = {};
  useRemoteSettingsStore.setState({
    settings: [],
    fetchSettings: async () => useRemoteSettingsStore.getState().settings,
    updateSettings: async (values: Record<string, string>) => {
      Object.assign(saved, values);
      useRemoteSettingsStore.setState({
        settings: Object.entries(saved).map(([key, value]) => setting(key, value))
      });
    }
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ThemeProvider theme={mockTheme}>
        <LocalComfyConnect />
      </ThemeProvider>
    </QueryClientProvider>
  );
  return { saved };
}

beforeEach(() => {
  jest.resetAllMocks();
});

it("saves the default address, checks the server and starts on its checkpoint", async () => {
  mockRestFetch.mockResolvedValue(
    json({
      url: "http://127.0.0.1:8188",
      version: "0.3.68",
      device: "cuda:0 NVIDIA GeForce RTX 4070",
      models: {
        checkpoints: ["dreamshaper_8.safetensors", "sd_xl_base_1.0.safetensors"],
        diffusion_models: [],
        loras: ["detail.safetensors"]
      }
    })
  );
  const { saved } = setup();

  await userEvent.click(screen.getByRole("button", { name: "Connect" }));

  expect(saved).toEqual({ COMFY_SERVER_URL: "http://127.0.0.1:8188", COMFY_TARGET: "server" });
  expect(
    await screen.findByText("Connected to ComfyUI 0.3.68 on NVIDIA GeForce RTX 4070")
  ).toBeInTheDocument();
  expect(screen.getByText("2 checkpoints, 0 diffusion models, 1 LoRA")).toBeInTheDocument();
  expect(mockRestFetch).toHaveBeenCalledWith("/api/comfy/server-status", expect.anything());

  await userEvent.click(screen.getByRole("button", { name: "Start a Comfy workflow" }));
  await waitFor(() => expect(mockStart).toHaveBeenCalledWith("sd_xl_base_1.0.safetensors"));
});

it("says why the server did not answer", async () => {
  mockRestFetch.mockResolvedValue(
    json(
      { error: { message: "Nothing answered at http://127.0.0.1:8188. Start ComfyUI, or check the address and port." } },
      502
    )
  );
  setup();

  await userEvent.click(screen.getByRole("button", { name: "Connect" }));

  expect(await screen.findByText(/Nothing answered at http:\/\/127\.0\.0\.1:8188/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Check again" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Start a Comfy workflow" })).not.toBeInTheDocument();
});
