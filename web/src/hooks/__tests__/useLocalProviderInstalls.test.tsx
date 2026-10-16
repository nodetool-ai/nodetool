import React from "react";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { useLocalProviderInstalls } from "../useLocalProviderInstalls";
import useRuntimePackagesStore from "../../stores/RuntimePackagesStore";
import useNodePacksStore from "../../stores/NodePacksStore";

const runtimeStatus = (id: string, installed: boolean) => ({
  id,
  name: id,
  description: "",
  installed,
  installing: false
});

const setPlatform = (platform: string | undefined): void => {
  Object.defineProperty(window, "api", {
    configurable: true,
    value: platform ? { platform } : undefined
  });
};

let client: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

beforeEach(() => {
  client = new QueryClient();
  setPlatform("darwin");
  useRuntimePackagesStore.setState({
    available: true,
    statuses: [
      runtimeStatus("sd-cpp", false),
      runtimeStatus("node-llama-cpp", true),
      runtimeStatus("transformers-js", false)
    ],
    busyIds: ["transformers-js"],
    refresh: async () => {},
    install: jest.fn(async () => true)
  });
  useNodePacksStore.setState({
    available: true,
    availablePacks: [{ repo_id: "nodetool-ai/nodetool-mlx", name: "MLX", description: "" }],
    installed: [],
    busyIds: [],
    refresh: async () => {},
    install: jest.fn(async () => true)
  });
});

afterAll(() => setPlatform(undefined));

describe("useLocalProviderInstalls", () => {
  it("reports each local provider's install state", () => {
    const { result } = renderHook(() => useLocalProviderInstalls(), { wrapper });
    const status = Object.fromEntries(
      [...result.current].map(([provider, info]) => [provider, info.status])
    );
    expect(status).toEqual({
      stable_diffusion_cpp: "missing",
      node_llama_cpp: "installed",
      transformers_js: "installing",
      mlx: "missing"
    });
  });

  it("leaves out MLX off macOS and when the pack catalog lacks it", () => {
    setPlatform("linux");
    const { result } = renderHook(() => useLocalProviderInstalls(), { wrapper });
    expect(result.current.has("mlx")).toBe(false);
    setPlatform("darwin");
    useNodePacksStore.setState({ availablePacks: [] });
    const { result: noCatalog } = renderHook(() => useLocalProviderInstalls(), { wrapper });
    expect(noCatalog.current.has("mlx")).toBe(false);
  });

  it("is empty without the desktop runtime API", () => {
    useRuntimePackagesStore.setState({ available: false });
    const { result } = renderHook(() => useLocalProviderInstalls(), { wrapper });
    expect(result.current.size).toBe(0);
  });

  it("installs the package and reloads providers and models", async () => {
    const invalidate = jest.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useLocalProviderInstalls(), { wrapper });
    await act(async () => {
      await result.current.get("stable_diffusion_cpp")!.install();
      await result.current.get("mlx")!.install();
    });
    expect(useRuntimePackagesStore.getState().install).toHaveBeenCalledWith("sd-cpp");
    expect(useNodePacksStore.getState().install).toHaveBeenCalledWith("nodetool-ai/nodetool-mlx");
    expect(invalidate).toHaveBeenCalledTimes(2);
    const predicate = invalidate.mock.calls[0]![0]!.predicate!;
    const matches = (key: string[]) =>
      predicate({ queryKey: key } as unknown as Parameters<typeof predicate>[0]);
    expect(matches(["providers"])).toBe(true);
    expect(matches(["image-models", "stable_diffusion_cpp"])).toBe(true);
    expect(matches(["workflows"])).toBe(false);
  });
});
