import type { sketch } from "@nodetool-ai/protocol/api-schemas";
import { serializeLayerData } from "../../components/sketch/serialization";

type ImageDocumentData = sketch.ImageDocumentData;

/**
 * Replace the first (blank) layer of a freshly-created sketch document with a
 * raster layer that references an existing image asset, so the standalone
 * editor opens with that image as its editable base layer.
 *
 * The layer `data` holds an `asset://{id}.{ext}` reference rather than inline
 * pixels: `Canvas2DRuntime.setLayerData` resolves the scheme and fetches the
 * bytes on load, so the persisted document stays tiny (no megabytes of base64)
 * and never trips the sketch autosave size guard. Once the user paints, the
 * live canvas is serialized to owned pixels on the next autosave.
 *
 * The reference MUST carry the file extension — the storage endpoint serves
 * files by name, so `/api/storage/{id}` (no extension) 404s while
 * `/api/storage/{id}.png` resolves. The caller passes the qualified URI.
 */
export function buildSeededImageDocument(
  base: ImageDocumentData,
  params: {
    imageUri: string;
    width: number;
    height: number;
    name: string;
    /** Ink for the drawing tools, chosen to show on the image. */
    ink?: string;
  }
): ImageDocumentData {
  const { imageUri, width, height, name, ink } = params;
  const bounds = { x: 0, y: 0, width, height };
  const layers = base.sketch.layers as Array<Record<string, unknown>>;
  const [firstLayer, ...rest] = layers;
  const seededLayer = {
    ...firstLayer,
    name,
    data: serializeLayerData(imageUri, bounds),
    contentBounds: bounds
  };
  const seededSketch: Record<string, unknown> = {
    ...base.sketch,
    layers: [seededLayer, ...rest]
  };
  if (ink) {
    seededSketch.toolSettings = inkToolSettings(ink);
  }
  return { ...base, sketch: seededSketch } as ImageDocumentData;
}

/** The drawing tools' colors set to one ink. Normalization fills the rest. */
function inkToolSettings(ink: string): Record<string, unknown> {
  return {
    brush: { color: ink },
    pencil: { color: ink },
    fill: { color: ink },
    shape: { strokeColor: ink },
    gradient: { startColor: ink }
  };
}
