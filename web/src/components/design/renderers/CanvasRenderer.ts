import type { LayoutCanvasData, SnapGuide } from "../types";

export interface Point {
  x: number;
  y: number;
}

export interface AABB {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ExportOptions {
  scale?: number;
  backgroundColor?: string;
}

export interface CanvasRenderer {
  mount(container: HTMLElement): void;
  resize(width: number, height: number): void;
  setCamera(pan: Point, zoom: number): void;
  setDocument(doc: LayoutCanvasData): void;
  setSelection(elementIds: string[]): void;
  setSnapGuides(guides: SnapGuide[]): void;
  setGrid(enabled: boolean, size: number, color: string): void;
  hitTest(point: Point): string | null;
  getBounds(elementIds: string[]): AABB;
  exportPng(options: ExportOptions): Promise<Blob>;
  exportSvg(options: ExportOptions): Promise<string>;
  destroy(): void;
}
