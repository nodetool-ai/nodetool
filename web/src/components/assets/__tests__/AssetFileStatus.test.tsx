/**
 * The Missing and Linked badges, and Relink and Remove on a missing asset
 * (project folders PRD US7), through the real relink and delete hooks.
 */
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import mockTheme from "../../../__mocks__/themeMock";
import AssetFileStatus from "../AssetFileStatus";
import { useAssetStore } from "../../../stores/AssetStore";

jest.mock("../../../trpc/client", () => ({
  trpcClient: {
    assets: {
      get: { query: jest.fn() },
      delete: { mutate: jest.fn() },
      relinkExternal: { mutate: jest.fn() }
    }
  }
}));

const mockLocalPaths = { available: true };
jest.mock("../../../utils/localFile", () => ({
  canResolveLocalFilePaths: () => mockLocalPaths.available,
  getLocalFilePath: (file: File) => `/Users/me/footage/${file.name}`
}));

import { trpcClient } from "../../../trpc/client";

const deleteMutate = trpcClient.assets.delete.mutate as jest.Mock;
const relinkMutate = trpcClient.assets.relinkExternal.mutate as jest.Mock;
const getQuery = trpcClient.assets.get.query as jest.Mock;

const missing = {
  id: "a1",
  name: "fox.png",
  offline: true as const
};

function renderStatus(
  props: Partial<React.ComponentProps<typeof AssetFileStatus>> = {}
) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } }
  });
  useAssetStore.setState({ queryClient });
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={mockTheme}>
        <AssetFileStatus asset={missing} {...props} />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLocalPaths.available = true;
  getQuery.mockResolvedValue({ id: "a1", parent_id: "u1" });
  deleteMutate.mockResolvedValue({ deleted_asset_ids: ["a1"] });
  relinkMutate.mockResolvedValue({ id: "a1", name: "fox.png" });
});

describe("AssetFileStatus", () => {
  it("shows nothing for an asset whose file is where it should be", () => {
    renderStatus({ asset: { id: "a1", name: "fox.png" } });
    expect(screen.queryByTestId("asset-file-status")).not.toBeInTheDocument();
  });

  it("marks a linked asset Linked and offers no actions", () => {
    renderStatus({ asset: { id: "a1", name: "fox.png", linked: true } });
    expect(screen.getByTestId("asset-linked")).toHaveTextContent("Linked");
    expect(screen.queryByTestId("asset-media-missing")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
  });

  it("marks a missing asset Missing and relinks it to a picked file", async () => {
    const { container } = renderStatus();
    expect(screen.getByTestId("asset-media-missing")).toHaveTextContent("Missing");

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(["x"], "fox-v2.png", { type: "image/png" })] }
    });

    await waitFor(() =>
      expect(relinkMutate).toHaveBeenCalledWith({
        id: "a1",
        path: "/Users/me/footage/fox-v2.png"
      })
    );
  });

  it("removes a missing asset after confirmation and reports it", async () => {
    const onRemoved = jest.fn();
    renderStatus({ onRemoved });

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(deleteMutate).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent('Remove "fox.png"?');
    fireEvent.click(
      screen.getAllByRole("button", { name: "Remove" }).at(-1) as HTMLElement
    );

    await waitFor(() => expect(deleteMutate).toHaveBeenCalledWith({ id: "a1" }));
    await waitFor(() => expect(onRemoved).toHaveBeenCalled());
  });

  it("leaves Relink out where the app cannot read a file's location", () => {
    mockLocalPaths.available = false;
    const { container } = renderStatus();
    expect(container.querySelector('input[type="file"]')).toBeNull();
    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
  });

  it("hides the actions when asked to", () => {
    renderStatus({ showActions: false });
    expect(screen.getByTestId("asset-media-missing")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
  });
});
