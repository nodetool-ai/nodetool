import type { LayoutCanvasData } from "./types";

export type PerfDatasetSize = 1000 | 5000 | 10000;

export const createPerfDataset = (
  count: PerfDatasetSize,
  width: number,
  height: number
): LayoutCanvasData => {
  const elements = Array.from({ length: count }, (_, index) => {
    const cols = Math.max(1, Math.round(Math.sqrt(count)));
    const size = 24;
    const gap = 8;
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = (col * (size + gap)) % Math.max(width - size, size);
    const y = (row * (size + gap)) % Math.max(height - size, size);
    return {
      id: `perf-${index}`,
      type: "rectangle" as const,
      x,
      y,
      width: size,
      height: size,
      rotation: 0,
      zIndex: index,
      visible: true,
      locked: false,
      name: `Perf ${index + 1}`,
      properties: {
        fillColor: index % 2 === 0 ? "#4a90d9" : "#48bb78",
        borderColor: "#2c5282",
        borderWidth: 1,
        borderRadius: 2,
        opacity: 1
      }
    };
  });

  return {
    type: "layout_canvas",
    width,
    height,
    backgroundColor: "#ffffff",
    elements,
    exposedInputs: []
  };
};
