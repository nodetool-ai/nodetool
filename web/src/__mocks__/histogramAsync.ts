export async function computeHistogramAsync(): Promise<{
  r: Uint32Array;
  g: Uint32Array;
  b: Uint32Array;
  luminance: Uint32Array;
  pixelCount: number;
}> {
  return {
    r: new Uint32Array(256),
    g: new Uint32Array(256),
    b: new Uint32Array(256),
    luminance: new Uint32Array(256),
    pixelCount: 0
  };
}
