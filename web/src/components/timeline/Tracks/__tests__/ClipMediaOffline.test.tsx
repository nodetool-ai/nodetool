/**
 * The "Media offline" badge on a clip whose in-place file is missing, and the
 * Relink action that points the asset at a file the creator picks.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import mockTheme from "../../../../__mocks__/themeMock";

const mockGetAsset = jest.fn();
jest.mock("../../../../stores/AssetStore", () => ({
  useAssetStore: <T,>(
    sel: (s: { get: typeof mockGetAsset; add: () => void }) => T
  ) => sel({ get: mockGetAsset, add: () => {} })
}));

const mockRelink = jest.fn();
jest.mock("../../../../trpc/client", () => ({
  trpcClient: {
    assets: {
      relinkExternal: {
        mutate: (input: unknown) => mockRelink(input)
      }
    }
  }
}));

let mockCanResolve = true;
jest.mock("../../../../utils/localFile", () => ({
  canResolveLocalFilePaths: () => mockCanResolve,
  getLocalFilePath: (file: File) => `/media/moved/${file.name}`
}));

import { ClipMediaOffline } from "../ClipMediaOffline";

const offlineAsset = {
  id: "a1",
  get_url: "/api/storage/u1/a1.mp4",
  offline: true,
  metadata: { external_size: 10, external_mtime: 1 }
};

function renderBadge() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={mockTheme}>
        <ClipMediaOffline assetId="a1" />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

describe("ClipMediaOffline", () => {
  beforeEach(() => {
    mockGetAsset.mockReset();
    mockRelink.mockReset();
    mockCanResolve = true;
  });

  it("renders nothing while the asset's file is online", async () => {
    mockGetAsset.mockResolvedValue({ ...offlineAsset, offline: false });
    renderBadge();
    await waitFor(() => expect(mockGetAsset).toHaveBeenCalledWith("a1"));
    expect(screen.queryByTestId("clip-media-offline")).not.toBeInTheDocument();
  });

  it("shows the badge and relinks to the picked file under the same id", async () => {
    mockGetAsset
      .mockResolvedValueOnce(offlineAsset)
      .mockResolvedValue({ ...offlineAsset, offline: false });
    mockRelink.mockResolvedValue({ ...offlineAsset, offline: false });

    const { container } = renderBadge();
    expect(await screen.findByText("Media offline")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Relink/ })).toBeInTheDocument();

    const input = container.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(["x"], "clip.mp4")] }
    });

    await waitFor(() =>
      expect(mockRelink).toHaveBeenCalledWith({
        id: "a1",
        path: "/media/moved/clip.mp4"
      })
    );
    // The relink bumps the asset's revision, which reads it again: online.
    await waitFor(() =>
      expect(screen.queryByTestId("clip-media-offline")).not.toBeInTheDocument()
    );
    expect(mockGetAsset).toHaveBeenCalledTimes(2);
  });

  it("offers no Relink where the file's location cannot be read", async () => {
    mockCanResolve = false;
    mockGetAsset.mockResolvedValue(offlineAsset);
    renderBadge();
    expect(await screen.findByText("Media offline")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Relink/ })).toBeNull();
  });
});
