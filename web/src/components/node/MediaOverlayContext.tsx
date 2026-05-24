import { createContext, useContext } from "react";

// Set by NodeHistoryViewer to tell nested media renderers (ImageView in
// particular) to skip their own hover toolbar and dimensions overlay, since
// NodeHistoryViewer renders unified controls at a higher level.
const MediaOverlayContext = createContext<{ suppressed: boolean }>({
  suppressed: false
});

export const MediaOverlaySuppressProvider = MediaOverlayContext.Provider;

export const useMediaOverlaySuppressed = (): boolean =>
  useContext(MediaOverlayContext).suppressed;
