// Keep decoded SVGs beside their sampling buffers so transforms redraw the
// source geometry instead of magnifying the buffer's pixels.
const vectorSources = new WeakMap<HTMLCanvasElement, HTMLImageElement>();

export function setVectorSource(
  canvas: HTMLCanvasElement,
  source: HTMLImageElement | null
): void {
  if (source) {
    vectorSources.set(canvas, source);
  } else {
    vectorSources.delete(canvas);
  }
}

export function getVectorSourceImage(
  canvas: HTMLCanvasElement
): HTMLImageElement | undefined {
  return vectorSources.get(canvas);
}
