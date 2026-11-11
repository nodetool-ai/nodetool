import { act, render } from "@testing-library/react";

import HidePanelOnAssetOpen from "../HidePanelOnAssetOpen";
import {
  AssetGridStoreProvider,
  useAssetGridStoreApi
} from "../../../stores/AssetGridStore";
import { usePanelStore } from "../../../stores/PanelStore";
import type { Asset } from "../../../stores/ApiTypes";
import type { AssetGridStoreApi } from "../../../stores/AssetGridStore";

const asset = { id: "a1", name: "cat.png", content_type: "image/png" } as Asset;

describe("HidePanelOnAssetOpen", () => {
  let store: AssetGridStoreApi | null = null;
  const CaptureStore = () => {
    store = useAssetGridStoreApi();
    return null;
  };

  const renderInLibrary = () =>
    render(
      <AssetGridStoreProvider persistKey="asset-grid-storage:hide-panel-test">
        <CaptureStore />
        <HidePanelOnAssetOpen />
      </AssetGridStoreProvider>
    );

  beforeEach(() => {
    usePanelStore.getState().setVisibility(true);
  });

  it("leaves the panel open while no asset is open", () => {
    renderInLibrary();
    expect(usePanelStore.getState().panel.isVisible).toBe(true);
  });

  it("hides the panel once an asset opens in the viewer", () => {
    renderInLibrary();
    act(() => store?.getState().setOpenAsset(asset));
    expect(usePanelStore.getState().panel.isVisible).toBe(false);
    act(() => store?.getState().setOpenAsset(null));
  });
});
