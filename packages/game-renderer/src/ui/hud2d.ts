import type { GameRenderFrame } from "@nodetool-ai/protocol";
import { paintHud, type HudContext } from "../frame.js";
import { gameUiImageIds, paintGameUi, type GameUiPaintContext } from "./paint.js";
import type { GameUiViewport } from "./layout.js";

/** The 2D HUD rectangle: the frame's view at one HUD pixel per canvas pixel. */
export function gameUiViewport2D(frame: Pick<GameRenderFrame, "width" | "height" | "pixelsPerUnit">): GameUiViewport {
  return { width: frame.width * frame.pixelsPerUnit, height: frame.height * frame.pixelsPerUnit };
}

/** Loads the images a frame's HUD tree draws through a renderer's asset loader. */
export async function loadGameUiImages<I>(frame: Pick<GameRenderFrame, "ui">, load: (assetId: string) => Promise<I | null>): Promise<Map<string, I>> {
  const images = new Map<string, I>();
  await Promise.all(gameUiImageIds(frame.ui).map(async (assetId) => {
    const image = await load(assetId);
    if (image) { images.set(assetId, image); }
  }));
  return images;
}

/** Paints the 2D HUD: the widget tree, then the `hud` labels above it. `scale` is output pixels per HUD pixel. */
export function paintGameHud2D(context: HudContext & GameUiPaintContext, frame: GameRenderFrame, scale = 1,
  images?: ReadonlyMap<string, unknown>): void {
  if (frame.ui) { paintGameUi(context, frame.ui, gameUiViewport2D(frame), { scale, gameId: frame.gameId, images }); }
  paintHud(context, frame.hud, scale, frame.gameId);
}
