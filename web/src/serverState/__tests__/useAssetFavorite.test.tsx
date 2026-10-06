import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const updateAsset = jest.fn();
const addNotification = jest.fn();

jest.mock("../../trpc/client", () => ({
  trpcClient: {
    assets: {
      update: { mutate: (input: unknown) => updateAsset(input) }
    }
  }
}));

jest.mock("../../stores/NotificationStore", () => ({
  useNotificationStore: <T,>(selector: (s: Record<string, unknown>) => T) =>
    selector({ addNotification })
}));

import { useSetAssetFavorite } from "../useAssetFavorite";

const folderKey = ["assets", { parent_id: "u1", project_id: "default" }];

const makeClient = (): QueryClient => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  client.setQueryData(folderKey, {
    assets: [
      { id: "a1", name: "a.png", favorite: false },
      { id: "a2", name: "b.png", favorite: false }
    ],
    next: null
  });
  return client;
};

const cachedFavorites = (client: QueryClient): Record<string, unknown> => {
  const data = client.getQueryData<{
    assets: Array<{ id: string; favorite: boolean }>;
  }>(folderKey);
  return Object.fromEntries(
    (data?.assets ?? []).map((asset) => [asset.id, asset.favorite])
  );
};

describe("useSetAssetFavorite", () => {
  beforeEach(() => {
    updateAsset.mockReset();
    addNotification.mockReset();
  });

  it("stars the asset on the server and in every cached list at once", async () => {
    let resolveUpdate: () => void = () => {};
    updateAsset.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveUpdate = resolve;
      })
    );
    const client = makeClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useSetAssetFavorite(), { wrapper });

    act(() => result.current(["a1"], true));

    await waitFor(() =>
      expect(cachedFavorites(client)).toEqual({ a1: true, a2: false })
    );
    expect(updateAsset).toHaveBeenCalledWith({ id: "a1", favorite: true });
    resolveUpdate();
  });

  it("reports a failed update", async () => {
    updateAsset.mockRejectedValue(new Error("offline"));
    const client = makeClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useSetAssetFavorite(), { wrapper });

    act(() => result.current(["a1", "a2"], true));

    await waitFor(() =>
      expect(addNotification).toHaveBeenCalledWith(
        expect.objectContaining({ type: "error" })
      )
    );
    expect(updateAsset).toHaveBeenCalledTimes(2);
  });
});
