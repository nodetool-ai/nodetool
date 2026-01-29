import {
  Application,
  Container,
  Graphics,
  Sprite,
  Text,
  Texture
} from "pixi.js";
import type { LayoutCanvasData, LayoutElement, SnapGuide } from "../types";
import type { CanvasRenderer, Point, AABB, ExportOptions } from "./CanvasRenderer";

const DEFAULT_BACKGROUND = "#ffffff";

const parseHexColor = (color: string): number => {
  return Number.parseInt(color.replace("#", ""), 16);
};

export default class PixiRenderer implements CanvasRenderer {
  private app: Application | null = null;
  private container: HTMLElement | null = null;
  private root: Container | null = null;
  private elementContainer: Container | null = null;
  private selectionContainer: Container | null = null;
  private guidesContainer: Container | null = null;
  private gridContainer: Container | null = null;
  private data: LayoutCanvasData | null = null;
  private selection = new Set<string>();
  private guides: SnapGuide[] = [];
  private gridEnabled = false;
  private gridSize = 10;
  private gridColor = "#e0e0e0";
  private pan: Point = { x: 0, y: 0 };
  private zoom = 1;

  async mount(container: HTMLElement): Promise<void> {
    this.container = container;
    const app = new Application();
    await app.init({
      width: container.clientWidth || 800,
      height: container.clientHeight || 600,
      backgroundColor: 0xffffff,
      preference: "webgpu",
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true
    });
    this.app = app;
    this.root = new Container();
    this.elementContainer = new Container();
    this.selectionContainer = new Container();
    this.guidesContainer = new Container();
    this.gridContainer = new Container();

    this.elementContainer.sortableChildren = true;

    this.root.addChild(this.gridContainer);
    this.root.addChild(this.elementContainer);
    this.root.addChild(this.selectionContainer);
    this.root.addChild(this.guidesContainer);
    app.stage.addChild(this.root);
    container.appendChild(app.canvas);

    this.applyCamera();
    this.renderDocument();
    this.renderSelection();
    this.setGrid(this.gridEnabled, this.gridSize, this.gridColor);
    this.setSnapGuides(this.guides);
  }

  resize(width: number, height: number): void {
    if (!this.app) {
      return;
    }
    this.app.renderer.resize(width, height);
  }

  setCamera(pan: Point, zoom: number): void {
    this.pan = pan;
    this.zoom = zoom;
    this.applyCamera();
  }

  setDocument(doc: LayoutCanvasData): void {
    this.data = doc;
    if (this.app) {
      this.app.renderer.background.color = parseHexColor(doc.backgroundColor ?? DEFAULT_BACKGROUND);
    }
    this.renderDocument();
    this.setGrid(this.gridEnabled, this.gridSize, this.gridColor);
  }

  setSelection(elementIds: string[]): void {
    this.selection = new Set(elementIds);
    this.renderSelection();
  }

  setSnapGuides(guides: SnapGuide[]): void {
    this.guides = guides;
    if (!this.guidesContainer) {
      return;
    }
    this.guidesContainer.removeChildren();
    guides.forEach((guide) => {
      const line = new Graphics();
      line.lineStyle({ color: 0xff00ff, width: 1, alpha: 1 });
      if (guide.type === "vertical") {
        line.moveTo(guide.position, guide.start);
        line.lineTo(guide.position, guide.end);
      } else {
        line.moveTo(guide.start, guide.position);
        line.lineTo(guide.end, guide.position);
      }
      this.guidesContainer?.addChild(line);
    });
  }

  setGrid(enabled: boolean, size: number, color: string): void {
    this.gridEnabled = enabled;
    this.gridSize = size;
    this.gridColor = color;
    if (!this.gridContainer || !this.data) {
      return;
    }
    this.gridContainer.removeChildren();
    if (!enabled) {
      return;
    }
    const lineColor = parseHexColor(color);
    const grid = new Graphics();
    grid.lineStyle({ color: lineColor, width: 1, alpha: 0.4 });
    for (let x = 0; x <= this.data.width; x += size) {
      grid.moveTo(x, 0);
      grid.lineTo(x, this.data.height);
    }
    for (let y = 0; y <= this.data.height; y += size) {
      grid.moveTo(0, y);
      grid.lineTo(this.data.width, y);
    }
    this.gridContainer.addChild(grid);
  }

  hitTest(_point: Point): string | null {
    return null;
  }

  getBounds(elementIds: string[]): AABB {
    if (!this.data || elementIds.length === 0) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }
    const elements = this.data.elements.filter((el) => elementIds.includes(el.id));
    const minX = Math.min(...elements.map((el) => el.x));
    const minY = Math.min(...elements.map((el) => el.y));
    const maxX = Math.max(...elements.map((el) => el.x + el.width));
    const maxY = Math.max(...elements.map((el) => el.y + el.height));
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  async exportPng(_options: ExportOptions): Promise<Blob> {
    if (!this.app) {
      return new Blob();
    }
    const canvas = this.app.canvas;
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob ?? new Blob()), "image/png");
    });
  }

  async exportSvg(): Promise<string> {
    return "";
  }

  destroy(): void {
    if (this.app) {
      this.app.destroy(true);
    }
    this.container?.querySelector("canvas")?.remove();
    this.app = null;
    this.root = null;
    this.elementContainer = null;
    this.selectionContainer = null;
    this.guidesContainer = null;
    this.gridContainer = null;
    this.container = null;
    this.data = null;
  }

  private renderDocument(): void {
    if (!this.elementContainer || !this.data) {
      return;
    }
    this.elementContainer.removeChildren();
    this.data.elements
      .filter((el) => el.visible)
      .forEach((element) => {
        const node = this.createElementNode(element);
        if (node) {
          node.zIndex = element.zIndex;
          this.elementContainer?.addChild(node);
        }
      });
    this.elementContainer.sortChildren();
  }

  private renderSelection(): void {
    if (!this.selectionContainer || !this.data) {
      return;
    }
    this.selectionContainer.removeChildren();
    this.data.elements.forEach((el) => {
      if (!this.selection.has(el.id)) {
        return;
      }
      const outline = new Graphics();
      outline.lineStyle({ color: 0x4f46e5, width: 1 });
      outline.drawRect(el.x, el.y, el.width, el.height);
      this.selectionContainer?.addChild(outline);
    });
  }

  private applyCamera(): void {
    if (!this.root) {
      return;
    }
    this.root.position.set(this.pan.x, this.pan.y);
    this.root.scale.set(this.zoom);
  }

  private createElementNode(element: LayoutElement): Container | Graphics | Sprite | Text | null {
    switch (element.type) {
      case "rectangle": {
        const rect = new Graphics();
        const fillColor = (element.properties as { fillColor?: string }).fillColor ?? DEFAULT_BACKGROUND;
        rect.beginFill(parseHexColor(fillColor));
        rect.drawRect(element.x, element.y, element.width, element.height);
        rect.endFill();
        return rect;
      }
      case "ellipse": {
        const ellipse = new Graphics();
        const fillColor = (element.properties as { fillColor?: string }).fillColor ?? DEFAULT_BACKGROUND;
        ellipse.beginFill(parseHexColor(fillColor));
        ellipse.drawEllipse(
          element.x + element.width / 2,
          element.y + element.height / 2,
          element.width / 2,
          element.height / 2
        );
        ellipse.endFill();
        return ellipse;
      }
      case "line": {
        const line = new Graphics();
        const strokeColor = (element.properties as { strokeColor?: string }).strokeColor ?? "#000000";
        line.lineStyle({ color: parseHexColor(strokeColor), width: 2 });
        line.moveTo(element.x, element.y + element.height / 2);
        line.lineTo(element.x + element.width, element.y + element.height / 2);
        return line;
      }
      case "text": {
        const textProps = element.properties as { content?: string; fontSize?: number; color?: string };
        const text = new Text({
          text: textProps.content ?? "",
          style: {
            fontSize: textProps.fontSize ?? 16,
            fill: textProps.color ?? "#000000"
          }
        });
        text.position.set(element.x, element.y);
        return text;
      }
      case "image": {
        const imageProps = element.properties as { source?: string };
        const texture = imageProps.source ? Texture.from(imageProps.source) : Texture.EMPTY;
        const sprite = new Sprite(texture);
        sprite.position.set(element.x, element.y);
        sprite.width = element.width;
        sprite.height = element.height;
        return sprite;
      }
      case "group": {
        const group = new Graphics();
        group.lineStyle({ color: 0x999999, width: 1 });
        group.drawRect(element.x, element.y, element.width, element.height);
        return group;
      }
      default:
        return null;
    }
  }
}
