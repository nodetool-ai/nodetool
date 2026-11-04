import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import mockTheme from "../../../../__mocks__/themeMock";
import type { Asset, Message } from "../../../../stores/ApiTypes";
import ImageGenerationFeed from "../ImageGenerationFeed";
import { useMediaOverlay } from "../../../node/MediaOverlayContext";

jest.mock("../../../node/ImageView", () => ({
  __esModule: true,
  default: function MockImageView({ source }: { source: string }) {
    const { onRequestOpenViewer } = useMediaOverlay();
    return (
      <button type="button" onClick={onRequestOpenViewer}>
        {`open ${source}`}
      </button>
    );
  }
}));

jest.mock("../../../assets/AssetViewer", () => ({
  __esModule: true,
  default: ({
    asset,
    sortedAssets,
    detachedIds
  }: {
    asset: Asset;
    sortedAssets: Asset[];
    detachedIds: Set<string>;
  }) => (
    <div data-testid="viewer">
      {JSON.stringify({
        open: asset.id,
        strip: sortedAssets.map((item) => item.id),
        detached: [...detachedIds]
      })}
    </div>
  )
}));

jest.mock("../../../../providers/ContextMenuProvider", () => ({
  ContextMenuProvider: ({ children }: { children: React.ReactNode }) => children
}));

jest.mock("../../../../hooks/useResolvedMediaUri", () => ({
  useResolvedMediaUris: (locators: { uri?: string; asset_id?: string }[]) =>
    locators.map((locator) => locator.uri ?? `/stored/${locator.asset_id}`)
}));

jest.mock("../../../../hooks/assets/useAssetsForLocators", () => ({
  useAssetsForLocators: (locators: (string | null)[]) =>
    locators.map((locator) =>
      locator ? { id: locator.replace("asset://", "") } : undefined
    )
}));

const messages = [
  { id: "u1", role: "user", content: "fox" },
  {
    id: "a1",
    role: "assistant",
    content: [
      { type: "image_url", image: { type: "image", asset_id: "one" } },
      { type: "image_url", image: { type: "image", asset_id: "two" } },
      { type: "image_url", image: { type: "image", uri: "http://x/three.png" } }
    ]
  }
] as unknown as Message[];

describe("ImageGenerationFeed fullscreen", () => {
  it("opens on the clicked picture with the whole feed in the gallery", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ThemeProvider theme={mockTheme}>
          <ImageGenerationFeed messages={messages} status="connected" />
        </ThemeProvider>
      </QueryClientProvider>
    );

    fireEvent.click(screen.getByText("open /stored/two"));

    expect(JSON.parse(screen.getByTestId("viewer").textContent ?? "")).toEqual({
      open: "two",
      strip: ["one", "two", "u1-2"],
      detached: ["u1-2"]
    });
  });
});
