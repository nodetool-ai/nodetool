import type { GameRenderFrame3D } from "@nodetool-ai/protocol";
import type { GameUiViewport } from "./layout.js";

/** The 3D HUD rectangle: the presentation's hudWidth by hudHeight, stretched over the viewport. */
export function gameUiViewport3D(frame: Pick<GameRenderFrame3D, "presentation">): GameUiViewport {
  return { width: frame.presentation.hudWidth, height: frame.presentation.hudHeight };
}
