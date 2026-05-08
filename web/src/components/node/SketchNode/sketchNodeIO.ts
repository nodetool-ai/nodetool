export interface SketchNodeImageRef {
  type: "image";
  uri: string;
  asset_id: string | null;
  data: null;
}

export const SKETCH_OUTPUT_LAYERS_HANDLE = "layers";

export const sketchNodeOutputImageTypeMetadata = {
  type: "image",
  type_args: [],
  optional: false
};

export const sketchNodeOutputImageListTypeMetadata = {
  type: "list",
  type_args: [sketchNodeOutputImageTypeMetadata],
  optional: false
};

export function getLayerInputHandleName(layerName: string): string {
  return `layer_in_${layerName}`;
}

export function getLayerOutputHandleName(layerName: string): string {
  return `layer_out_${layerName}`;
}

export function parseLayerInputHandleName(
  handleName: string | null | undefined
): string | null {
  if (!handleName || !handleName.startsWith("layer_in_")) {
    return null;
  }
  return handleName.slice("layer_in_".length) || null;
}

function isSketchNodeImageRef(value: unknown): value is SketchNodeImageRef {
  if (!value || typeof value !== "object") {
    return false;
  }
  const maybeImageRef = value as Partial<SketchNodeImageRef>;
  return (
    maybeImageRef.type === "image" &&
    typeof maybeImageRef.uri === "string" &&
    "asset_id" in maybeImageRef &&
    (typeof maybeImageRef.asset_id === "string" || maybeImageRef.asset_id === null) &&
    "data" in maybeImageRef &&
    maybeImageRef.data === null
  );
}

export function collectExposedLayerOutputRefs(
  outputProps: Record<string, unknown>
): SketchNodeImageRef[] {
  return Object.entries(outputProps)
    .filter(([key]) => key.startsWith("layer_out_"))
    .map(([, value]) => value)
    .filter(isSketchNodeImageRef);
}
