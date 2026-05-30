import type { sketch } from "@nodetool-ai/protocol/api-schemas";
import { serializeLayerData } from "../../components/sketch/serialization";

type ImageDocumentData = sketch.ImageDocumentData;

/**
 * Replace the first (blank) layer of a freshly-created sketch document with a
 * raster layer that references an existing image asset, so the standalone
 * editor opens with that image as its editable base layer.
 *
 * The layer `data` holds an `asset://{id}` reference rather than inline pixels:
 * `Canvas2DRuntime.setLayerData` resolves the scheme and fetches the bytes on
 * load, so the persisted document stays tiny (no megabytes of base64) and never
 * trips the sketch autosave size guard. Once the user paints, the live canvas
 * is serialized to owned pixels on the next autosave.
 */
export function buildSeededImageDocument(
  base: ImageDocumentData,
  params: { assetId: string; width: number; height: number; name: string }
): ImageDocumentData {
  const { assetId, width, height, name } = params;
  const bounds = { x: 0, y: 0, width, height };
  const layers = base.sketch.layers as Array<Record<string, unknown>>;
  const [firstLayer, ...rest] = layers;
  const seededLayer = {
    ...firstLayer,
    name,
    data: serializeLayerData(`asset://${assetId}`, bounds),
    contentBounds: bounds
  };
  return {
    ...base,
    sketch: {
      ...base.sketch,
      layers: [seededLayer, ...rest]
    }
  } as ImageDocumentData;
}
