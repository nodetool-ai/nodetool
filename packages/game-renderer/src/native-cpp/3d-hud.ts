import { CanvasTexture, Color, Mesh, MeshBasicMaterial, OrthographicCamera, PlaneGeometry, Scene, SRGBColorSpace, Vector2, Vector4,
  type WebGLRenderer } from "three";
import type { NativeFrame3D, NativeGame3dDocument } from "@nodetool-ai/protocol/native-game";
import { gameFontFamily } from "../fonts.js";
import { paintGameUi } from "../ui/paint.js";
import type { NativeAssetBroker } from "./contracts.js";

export interface NativeHud3DOptions {
  readonly assets: NativeAssetBroker;
  readonly document?: NativeGame3dDocument;
  readonly signal?: AbortSignal;
}
export interface NativeHud3D {
  /** Paints committed native widgets onto the output canvas after scene post-processing. */
  render(renderer: WebGLRenderer, frame: NativeFrame3D): void;
  contextRestored(): void;
  dispose(): void;
}

/** Private, owned font faces load from verified manifest bytes before the first widget can be painted. */
export async function createNativeHud3D(options: NativeHud3DOptions): Promise<NativeHud3D> {
  const gameId = options.document?.id ?? "native-game";
  const fonts: FontFace[] = [];
  try {
    options.signal?.throwIfAborted();
    for (const entry of options.assets.entries) {
      if (entry.kind !== "font") { continue; }
      options.signal?.throwIfAborted();
      if (entry.size < 1 || entry.size > 16 * 1024 * 1024) { throw new Error(`Native HUD font exceeds its byte budget: ${entry.id}`); }
      try {
        const bytes = options.assets.verifiedRange(entry.id, 0, entry.size);
        const face = await new FontFace(gameFontFamily(gameId, entry.id), Uint8Array.from(bytes).buffer).load();
        options.signal?.throwIfAborted();
        document.fonts.add(face); fonts.push(face);
      } catch (error) {
        options.signal?.throwIfAborted();
        throw new Error(`Native HUD font ${entry.id} could not load: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
      }
    }
  } catch (error) {
    for (const face of fonts) { document.fonts.delete(face); }
    throw error;
  }
  const canvas = document.createElement("canvas"), context = canvas.getContext("2d");
  if (!context) {
    for (const face of fonts) { document.fonts.delete(face); }
    throw new Error("Native HUD Canvas2D context is unavailable");
  }
  const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace;
  const geometry = new PlaneGeometry(2, 2);
  const material = new MeshBasicMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
  const scene = new Scene(); scene.add(new Mesh(geometry, material));
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 2); camera.position.z = 1;
  const bufferSize = new Vector2(), viewport = new Vector4(), clearColor = new Color();
  let disposed = false, previousUi: NativeFrame3D["ui"], previousKey: string | undefined;
  return {
    render(renderer, frame) {
      if (disposed) { throw new Error("Native HUD is disposed"); }
      if (!frame.ui?.nodes.length) { return; }
      renderer.getDrawingBufferSize(bufferSize);
      const presentation = frame.presentation ?? options.document?.presentation;
      const width = Math.max(1, Math.round(presentation?.hudWidth ?? 1280));
      const height = Math.max(1, Math.round(presentation?.hudHeight ?? 720));
      const sized = canvas.width === width && canvas.height === height;
      if (!sized || previousUi !== frame.ui) {
        // A committed UI object is reused between simulation ticks. Compare content only when it changes.
        const key = JSON.stringify([width, height, frame.ui]);
        if (!sized || previousKey !== key) {
          if (!sized) { canvas.width = width; canvas.height = height; }
          context.clearRect(0, 0, width, height);
          paintGameUi(context, frame.ui, { width, height }, { gameId });
          texture.needsUpdate = true;
        }
        previousUi = frame.ui; previousKey = key;
      }
      const target = renderer.getRenderTarget(), cubeFace = renderer.getActiveCubeFace(), mipLevel = renderer.getActiveMipmapLevel();
      const autoClear = renderer.autoClear, scissorTest = renderer.getScissorTest();
      const outputColorSpace = renderer.outputColorSpace;
      const clearAlpha = renderer.getClearAlpha(); renderer.getClearColor(clearColor);
      renderer.getViewport(viewport);
      try {
        renderer.setRenderTarget(null);
        const ratio = renderer.getPixelRatio();
        renderer.setViewport(0, 0, bufferSize.x / ratio, bufferSize.y / ratio);
        renderer.setScissorTest(false); renderer.autoClear = false;
        renderer.outputColorSpace = SRGBColorSpace;
        renderer.render(scene, camera);
      } finally {
        renderer.outputColorSpace = outputColorSpace; renderer.autoClear = autoClear; renderer.setViewport(viewport); renderer.setScissorTest(scissorTest);
        renderer.setRenderTarget(target, cubeFace, mipLevel);
        renderer.setClearColor(clearColor, clearAlpha);
      }
    },
    contextRestored() { if (!disposed) { texture.needsUpdate = true; } },
    dispose() {
      if (disposed) { return; }
      disposed = true; scene.clear(); geometry.dispose(); material.dispose(); texture.dispose();
      canvas.width = 1; canvas.height = 1;
      for (const face of fonts.splice(0)) { document.fonts.delete(face); }
    }
  };
}
