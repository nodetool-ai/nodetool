import { createContext, useContext } from "react";

export interface MediaOverlayValue {
  // Set by NodeHistoryViewer to tell nested media renderers (ImageView in
  // particular) to skip their own hover toolbar and dimensions overlay, since
  // NodeHistoryViewer renders unified controls at a higher level.
  suppressed: boolean;
  // When provided (by NodeHistoryViewer), nested media renderers delegate
  // "open in fullscreen viewer" to this callback instead of opening their own
  // single-asset viewer — so the gallery shows the node's full generation
  // history rather than just the one image.
  onRequestOpenViewer?: () => void;
}

const MediaOverlayContext = createContext<MediaOverlayValue>({
  suppressed: false
});

export const MediaOverlaySuppressProvider = MediaOverlayContext.Provider;

export const useMediaOverlay = (): MediaOverlayValue =>
  useContext(MediaOverlayContext);
