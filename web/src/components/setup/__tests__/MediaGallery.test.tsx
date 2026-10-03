import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import mockTheme from "../../../__mocks__/themeMock";
import { useAssetStore } from "../../../stores/AssetStore";
import type { Asset } from "../../../stores/ApiTypes";

// The viewer itself needs the router and the asset explorer. What the gallery
// decides is what it opens on, what it pages through, and in which order.
jest.mock("../../assets/AssetViewer", () => ({
  __esModule: true,
  default: ({
    asset,
    sortedAssets,
    captions,
    detachedIds,
    onClose
  }: {
    asset: Asset;
    sortedAssets: Asset[];
    captions: Record<string, string>;
    detachedIds: ReadonlySet<string>;
    onClose: () => void;
  }) => (
    <div role="dialog" aria-label="Gallery">
      <p data-testid="current">{captions[asset.id]}</p>
      <ol aria-label="Strip">
        {sortedAssets.map((item) => (
          <li key={item.id}>
            {`${captions[item.id]} ${item.content_type} ${item.get_url}${
              detachedIds.has(item.id) ? " detached" : ""
            }`}
          </li>
        ))}
      </ol>
      <button type="button" onClick={onClose}>
        Close gallery
      </button>
    </div>
  )
}));

import {
  GalleryExpandButton,
  GalleryFrame,
  MEDIA_GALLERY_HOST_CLASS,
  MediaGalleryProvider
} from "../MediaGallery";

const libraryAsset = (id: string): Asset => ({
  id,
  user_id: "user",
  parent_id: null,
  name: `${id}.png`,
  content_type: "image/png",
  workflow_id: null,
  created_at: "",
  get_url: `https://storage.test/${id}.png`,
  thumb_url: `https://storage.test/${id}_thumb.jpg`
});

const renderView = (view: React.ReactNode) =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ThemeProvider theme={mockTheme}>
        <MediaGalleryProvider>{view}</MediaGalleryProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );

beforeEach(() => {
  useAssetStore.setState({
    get: jest.fn(async (id: string) => libraryAsset(id))
  });
});

it("opens on the clicked item and pages through every item in the view in page order", async () => {
  const user = userEvent.setup();
  renderView(
    <>
      <div className={MEDIA_GALLERY_HOST_CLASS}>
        <GalleryExpandButton
          locator="https://samples.test/noir.mp4"
          kind="video"
          caption="Noir"
        />
      </div>
      <GalleryFrame locator="asset://still-1" kind="image" caption="Still one">
        <span>still</span>
      </GalleryFrame>
      <GalleryFrame
        locator={{ uri: "asset://still-1", asset_id: "still-1" }}
        kind="image"
        caption="Still one again"
      >
        <span>same still</span>
      </GalleryFrame>
      <GalleryFrame locator="asset://still-2" kind="image" caption="Still two">
        <span>another still</span>
      </GalleryFrame>
    </>
  );

  await user.click(
    screen.getByRole("button", { name: "View Still two fullscreen" })
  );

  const gallery = await screen.findByRole("dialog", { name: "Gallery" });
  expect(within(gallery).getByTestId("current")).toHaveTextContent(
    "Still two"
  );
  const strip = within(gallery)
    .getAllByRole("listitem")
    .map((item) => item.textContent);
  // A shipped sample has no library row, so it gets a stand-in; the same
  // asset shown twice is one item.
  expect(strip).toEqual([
    "Noir video/mp4 https://samples.test/noir.mp4 detached",
    "Still one image/png https://storage.test/still-1.png",
    "Still two image/png https://storage.test/still-2.png"
  ]);

  await user.click(within(gallery).getByRole("button", { name: "Close gallery" }));
  expect(screen.queryByRole("dialog", { name: "Gallery" })).not.toBeInTheDocument();
});

it("leaves the tile around the media unclicked", async () => {
  const user = userEvent.setup();
  const pickTile = jest.fn();
  renderView(
    // A tile that picks itself on a click anywhere, as setup cards do.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div className={MEDIA_GALLERY_HOST_CLASS} onClick={pickTile}>
      <GalleryExpandButton locator="asset://still-1" kind="image" caption="Still" />
    </div>
  );

  await user.click(screen.getByRole("button", { name: "View Still fullscreen" }));

  expect(await screen.findByRole("dialog", { name: "Gallery" })).toBeInTheDocument();
  expect(pickTile).not.toHaveBeenCalled();
});

it("shows no expand control outside a gallery", () => {
  render(
    <ThemeProvider theme={mockTheme}>
      <GalleryFrame locator="asset://still-1" kind="image" caption="Still">
        <span>still</span>
      </GalleryFrame>
    </ThemeProvider>
  );
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
