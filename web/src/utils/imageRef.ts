export interface ImageRefLike {
  uri?: string;
  width?: number;
  height?: number;
  data?: unknown;
}

export const asImageRef = (value: unknown): ImageRefLike | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const v = value as Record<string, unknown>;
  return {
    uri: typeof v.uri === "string" ? v.uri : undefined,
    width: typeof v.width === "number" ? v.width : undefined,
    height: typeof v.height === "number" ? v.height : undefined,
    data: v.data
  };
};

export const unwrapOutput = (
  value: unknown,
  handle?: string | null
): unknown => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const v = value as Record<string, unknown>;
  if (handle && handle in v) return v[handle];
  if ("output" in v) return v.output;
  return value;
};
