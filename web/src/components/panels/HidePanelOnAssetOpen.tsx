import { useEffect } from "react";

import { useAssetGridStore } from "../../stores/AssetGridStore";
import { usePanelStore } from "../../stores/PanelStore";

/**
 * Opening an asset from the library hands the screen to the asset viewer, so
 * the left panel hides the way it does after a document opens. Render it
 * inside the library's AssetGridStoreProvider.
 */
const HidePanelOnAssetOpen = () => {
  const isAssetOpen = useAssetGridStore((state) => state.openAsset !== null);
  const setVisibility = usePanelStore((state) => state.setVisibility);
  useEffect(() => {
    if (isAssetOpen) {
      setVisibility(false);
    }
  }, [isAssetOpen, setVisibility]);
  return null;
};

export default HidePanelOnAssetOpen;
