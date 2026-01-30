import {
  Application,
  Container,
  Graphics,
  Sprite,
  Text,
  Texture
} from "pixi.js";
import type { LayoutCanvasData, LayoutElement, SnapGuide } from "../../types";
import type { CanvasRenderer, Point, AABB, ExportOptions } from "../CanvasRenderer";
import { DEFAULT_PIXI_BACKGROUND, parseHexColor, snapToGrid, toRadians } from "./pixiUtils";

export interface PixiInteractionHandlers {
  onSelect?: (id: string, event: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => void;
  onDragStart?: (id: string) => void;
  onDragMove?: (id: string, x: number, y: number, width: number, height: number) => { x: number; y: number };
  onDragEnd?: (id: string, x: number, y: number) => void;
  onStageClick?: () => void;
}

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
  private gridNodes: Graphics[] = [];
  private guideNodes: Graphics[] = [];
  private selectionNodes: Graphics[] = [];
  private interactionHandlers: PixiInteractionHandlers | null = null;
  private interactionProvider: (() => PixiInteractionHandlers) | null = null;
  private dragState: { id: string; start: Point; startElement: Point } | null = null;

  async mount(container: HTMLElement): Promise<void> {
    this.container = container;
    const app = new Application();
    await app.init({
      width: container.clientWidth || 800,
      height: container.clientHeight || 600,
      backgroundColor: parseHexColor(DEFAULT_PIXI_BACKGROUND),
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
    this.root.eventMode = "static";
    this.root.on("pointertap", (event) => {
      if (event.target !== this.root) {
        return;
      }
      const handlers = this.interactionProvider ? this.interactionProvider() : this.interactionHandlers;
      handlers?.onStageClick?.();
    });
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
      this.app.renderer.background.color = parseHexColor(doc.backgroundColor ?? DEFAULT_PIXI_BACKGROUND);
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
    this.guideNodes = guides.map((guide) => {
      const line = new Graphics().setStrokeStyle({ width: 1, color: 0xff00ff, alpha: 1 });
      if (guide.type === "vertical") {
        line.moveTo(guide.position, guide.start);
        line.lineTo(guide.position, guide.end);
      } else {
        line.moveTo(guide.start, guide.position);
        line.lineTo(guide.end, guide.position);
      }
      this.guidesContainer?.addChild(line);
      return line;
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
    const grid = new Graphics().setStrokeStyle({ width: 1, color: lineColor, alpha: 0.4 });
    const width = snapToGrid(this.data.width, size);
    const height = snapToGrid(this.data.height, size);
    for (let x = 0; x <= width; x += size) {
      grid.moveTo(x, 0);
      grid.lineTo(x, height);
    }
    for (let y = 0; y <= height; y += size) {
      grid.moveTo(0, y);
      grid.lineTo(width, y);
    }
    this.gridNodes = [grid];
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
    this.interactionHandlers = null;
    this.dragState = null;
  }

  setInteractionHandlers(provider: () => PixiInteractionHandlers): void {
    this.interactionProvider = provider;
    this.interactionHandlers = provider();
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
    this.selectionNodes = [];
    this.data.elements.forEach((el) => {
      if (!this.selection.has(el.id)) {
        return;
      }
      const outline = new Graphics().setStrokeStyle({ width: 1, color: 0x4f46e5, alpha: 1 });
      outline.drawRect(el.x, el.y, el.width, el.height);
      this.selectionContainer?.addChild(outline);
      this.selectionNodes.push(outline);
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
        const fillColor = (element.properties as { fillColor?: string }).fillColor ?? DEFAULT_PIXI_BACKGROUND;
        rect.fill(parseHexColor(fillColor));
        rect.rect(0, 0, element.width, element.height);
        rect.position.set(element.x, element.y);
        rect.rotation = toRadians(element.rotation);
        rect.eventMode = "static";
        rect.cursor = "move";
        rect.on("pointerdown", (event) => {
          event.stopPropagation();
          this.dragState = {
            id: element.id,
            start: { x: event.global.x, y: event.global.y },
            startElement: { x: element.x, y: element.y }
          };
          const handlers = this.interactionProvider ? this.interactionProvider() : this.interactionHandlers;
          handlers?.onSelect?.(element.id, {
            shiftKey: event.shiftKey,
            ctrlKey: event.ctrlKey,
            metaKey: event.metaKey
          });
          handlers?.onDragStart?.(element.id);
        });
        rect.on("pointermove", (event) => {
          if (!this.dragState || this.dragState.id !== element.id) {
            return;
          }
          const dx = (event.global.x - this.dragState.start.x) / this.zoom;
          const dy = (event.global.y - this.dragState.start.y) / this.zoom;
          const nextX = this.dragState.startElement.x + dx;
          const nextY = this.dragState.startElement.y + dy;
          const handlers = this.interactionProvider ? this.interactionProvider() : this.interactionHandlers;
          handlers?.onDragMove?.(
            element.id,
            nextX,
            nextY,
            element.width,
            element.height
          );
        });
        rect.on("pointerup", (event) => {
          if (this.dragState?.id !== element.id) {
            return;
          }
          const dx = (event.global.x - this.dragState.start.x) / this.zoom;
          const dy = (event.global.y - this.dragState.start.y) / this.zoom;
          const handlers = this.interactionProvider ? this.interactionProvider() : this.interactionHandlers;
          handlers?.onDragEnd?.(
            element.id,
            this.dragState.startElement.x + dx,
            this.dragState.startElement.y + dy
          );
          this.dragState = null;
        });
        return rect;
      }
      case "ellipse": {
        const ellipse = new Graphics();
        const fillColor = (element.properties as { fillColor?: string }).fillColor ?? DEFAULT_PIXI_BACKGROUND;
        ellipse.fill(parseHexColor(fillColor));
        ellipse.ellipse(element.width / 2, element.height / 2, element.width / 2, element.height / 2);
        ellipse.position.set(element.x, element.y);
        ellipse.rotation = toRadians(element.rotation);
        ellipse.eventMode = "static";
        ellipse.cursor = "move";
        ellipse.on("pointerdown", (event) => {
          event.stopPropagation();
          this.dragState = {
            id: element.id,
            start: { x: event.global.x, y: event.global.y },
            startElement: { x: element.x, y: element.y }
          };
          const handlers = this.interactionProvider ? this.interactionProvider() : this.interactionHandlers;
          handlers?.onSelect?.(element.id, {
            shiftKey: event.shiftKey,
            ctrlKey: event.ctrlKey,
            metaKey: event.metaKey
          });
          handlers?.onDragStart?.(element.id);
        });
        ellipse.on("pointermove", (event) => {
          if (!this.dragState || this.dragState.id !== element.id) {
            return;
          }
          const dx = (event.global.x - this.dragState.start.x) / this.zoom;
          const dy = (event.global.y - this.dragState.start.y) / this.zoom;
          const handlers = this.interactionProvider ? this.interactionProvider() : this.interactionHandlers;
          handlers?.onDragMove?.(
            element.id,
            this.dragState.startElement.x + dx,
            this.dragState.startElement.y + dy,
            element.width,
            element.height
          );
        });
        ellipse.on("pointerup", (event) => {
          if (this.dragState?.id !== element.id) {
            return;
          }
          const dx = (event.global.x - this.dragState.start.x) / this.zoom;
          const dy = (event.global.y - this.dragState.start.y) / this.zoom;
          const handlers = this.interactionProvider ? this.interactionProvider() : this.interactionHandlers;
          handlers?.onDragEnd?.(
            element.id,
            this.dragState.startElement.x + dx,
            this.dragState.startElement.y + dy
          );
          this.dragState = null;
        });
        return ellipse;
      }
      case "line": {
        const strokeColor = (element.properties as { strokeColor?: string }).strokeColor ?? "#000000";
        const line = new Graphics().setStrokeStyle({ width: 2, color: parseHexColor(strokeColor), alpha: 1 });
        line.moveTo(0, element.height / 2);
        line.lineTo(element.width, element.height / 2);
        line.position.set(element.x, element.y);
        line.rotation = toRadians(element.rotation);
        line.eventMode = "static";
        line.cursor = "move";
        line.on("pointerdown", (event) => {
          event.stopPropagation();
          this.dragState = {
            id: element.id,
            start: { x: event.global.x, y: event.global.y },
            startElement: { x: element.x, y: element.y }
          };
          const handlers = this.interactionProvider ? this.interactionProvider() : this.interactionHandlers;
          handlers?.onSelect?.(element.id, {
            shiftKey: event.shiftKey,
            ctrlKey: event.ctrlKey,
            metaKey: event.metaKey
          });
          handlers?.onDragStart?.(element.id);
        });
        line.on("pointermove", (event) => {
          if (!this.dragState || this.dragState.id !== element.id) {
            return;
          }
          const dx = (event.global.x - this.dragState.start.x) / this.zoom;
          const dy = (event.global.y - this.dragState.start.y) / this.zoom;
          const handlers = this.interactionProvider ? this.interactionProvider() : this.interactionHandlers;
          handlers?.onDragMove?.(
            element.id,
            this.dragState.startElement.x + dx,
            this.dragState.startElement.y + dy,
            element.width,
            element.height
          );
        });
        line.on("pointerup", (event) => {
          if (this.dragState?.id !== element.id) {
            return;
          }
          const dx = (event.global.x - this.dragState.start.x) / this.zoom;
          const dy = (event.global.y - this.dragState.start.y) / this.zoom;
          const handlers = this.interactionProvider ? this.interactionProvider() : this.interactionHandlers;
          handlers?.onDragEnd?.(
            element.id,
            this.dragState.startElement.x + dx,
            this.dragState.startElement.y + dy
          );
          this.dragState = null;
        });
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
        text.rotation = toRadians(element.rotation);
        text.eventMode = "static";
        text.cursor = "move";
        text.on("pointerdown", (event) => {
          event.stopPropagation();
          this.dragState = {
            id: element.id,
            start: { x: event.global.x, y: event.global.y },
            startElement: { x: element.x, y: element.y }
          };
          const handlers = this.interactionProvider ? this.interactionProvider() : this.interactionHandlers;
          handlers?.onSelect?.(element.id, {
            shiftKey: event.shiftKey,
            ctrlKey: event.ctrlKey,
            metaKey: event.metaKey
          });
          handlers?.onDragStart?.(element.id);
        });
        text.on("pointermove", (event) => {
          if (!this.dragState || this.dragState.id !== element.id) {
            return;
          }
          const dx = (event.global.x - this.dragState.start.x) / this.zoom;
          const dy = (event.global.y - this.dragState.start.y) / this.zoom;
          const handlers = this.interactionProvider ? this.interactionProvider() : this.interactionHandlers;
          handlers?.onDragMove?.(
            element.id,
            this.dragState.startElement.x + dx,
            this.dragState.startElement.y + dy,
            element.width,
            element.height
          );
        });
        text.on("pointerup", (event) => {
          if (this.dragState?.id !== element.id) {
            return;
          }
          const dx = (event.global.x - this.dragState.start.x) / this.zoom;
          const dy = (event.global.y - this.dragState.start.y) / this.zoom;
          const handlers = this.interactionProvider ? this.interactionProvider() : this.interactionHandlers;
          handlers?.onDragEnd?.(
            element.id,
            this.dragState.startElement.x + dx,
            this.dragState.startElement.y + dy
          );
          this.dragState = null;
        });
        return text;
      }
      case "image": {
        const imageProps = element.properties as { source?: string };
        const texture = imageProps.source ? Texture.from(imageProps.source) : Texture.EMPTY;
        const sprite = new Sprite(texture);
        sprite.position.set(element.x, element.y);
        sprite.width = element.width;
        sprite.height = element.height;
        sprite.rotation = toRadians(element.rotation);
        sprite.eventMode = "static";
        sprite.cursor = "move";
        sprite.on("pointerdown", (event) => {
          event.stopPropagation();
          this.dragState = {
            id: element.id,
            start: { x: event.global.x, y: event.global.y },
            startElement: { x: element.x, y: element.y }
          };
          const handlers = this.interactionProvider ? this.interactionProvider() : this.interactionHandlers;
          handlers?.onSelect?.(element.id, {
            shiftKey: event.shiftKey,
            ctrlKey: event.ctrlKey,
            metaKey: event.metaKey
          });
          handlers?.onDragStart?.(element.id);
        });
        sprite.on("pointermove", (event) => {
          if (!this.dragState || this.dragState.id !== element.id) {
            return;
          }
          const dx = (event.global.x - this.dragState.start.x) / this.zoom;
          const dy = (event.global.y - this.dragState.start.y) / this.zoom;
          const handlers = this.interactionProvider ? this.interactionProvider() : this.interactionHandlers;
          handlers?.onDragMove?.(
            element.id,
            this.dragState.startElement.x + dx,
            this.dragState.startElement.y + dy,
            element.width,
            element.height
          );
        });
        sprite.on("pointerup", (event) => {
          if (this.dragState?.id !== element.id) {
            return;
          }
          const dx = (event.global.x - this.dragState.start.x) / this.zoom;
          const dy = (event.global.y - this.dragState.start.y) / this.zoom;
          const handlers = this.interactionProvider ? this.interactionProvider() : this.interactionHandlers;
          handlers?.onDragEnd?.(
            element.id,
            this.dragState.startElement.x + dx,
            this.dragState.startElement.y + dy
          );
          this.dragState = null;
        });
        return sprite;
      }
      case "group": {
        const group = new Graphics().setStrokeStyle({ width: 1, color: 0x999999, alpha: 1 });
        group.rect(0, 0, element.width, element.height);
        group.position.set(element.x, element.y);
        group.rotation = toRadians(element.rotation);
        group.eventMode = "static";
        group.cursor = "move";
        group.on("pointerdown", (event) => {
          event.stopPropagation();
          this.dragState = {
            id: element.id,
            start: { x: event.global.x, y: event.global.y },
            startElement: { x: element.x, y: element.y }
          };
          const handlers = this.interactionProvider ? this.interactionProvider() : this.interactionHandlers;
          handlers?.onSelect?.(element.id, {
            shiftKey: event.shiftKey,
            ctrlKey: event.ctrlKey,
            metaKey: event.metaKey
          });
          handlers?.onDragStart?.(element.id);
        });
        group.on("pointermove", (event) => {
          if (!this.dragState || this.dragState.id !== element.id) {
            return;
          }
          const dx = (event.global.x - this.dragState.start.x) / this.zoom;
          const dy = (event.global.y - this.dragState.start.y) / this.zoom;
          const handlers = this.interactionProvider ? this.interactionProvider() : this.interactionHandlers;
          handlers?.onDragMove?.(
            element.id,
            this.dragState.startElement.x + dx,
            this.dragState.startElement.y + dy,
            element.width,
            element.height
          );
        });
        group.on("pointerup", (event) => {
          if (this.dragState?.id !== element.id) {
            return;
          }
          const dx = (event.global.x - this.dragState.start.x) / this.zoom;
          const dy = (event.global.y - this.dragState.start.y) / this.zoom;
          const handlers = this.interactionProvider ? this.interactionProvider() : this.interactionHandlers;
          handlers?.onDragEnd?.(
            element.id,
            this.dragState.startElement.x + dx,
            this.dragState.startElement.y + dy
          );
          this.dragState = null;
        });
        return group;
      }
      default:
        return null;
    }
  }
}
