import {
  Application,
  Container,
  Graphics,
  RAD_TO_DEG,
  Rectangle,
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
  onTransformEnd?: (
    id: string,
    attrs: { x: number; y: number; width: number; height: number; rotation: number }
  ) => void;
  onStageClick?: () => void;
}

type ResizeHandle =
  | "nw"
  | "n"
  | "ne"
  | "e"
  | "se"
  | "s"
  | "sw"
  | "w";

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
  private selectionOutline: Graphics | null = null;
  private selectionHandles: Graphics | null = null;
  private interactionHandlers: PixiInteractionHandlers | null = null;
  private interactionProvider: (() => PixiInteractionHandlers) | null = null;
  private dragState: { id: string; start: Point; startElement: Point } | null = null;
  private selectionRect: Graphics | null = null;
  private marqueeStart: Point | null = null;
  private elementNodes = new Map<string, Container | Graphics | Sprite | Text>();
  private resizeState:
    | {
        id: string;
        handle: ResizeHandle;
        startBounds: Rectangle;
        startPointer: Point;
        rotation: number;
      }
    | null = null;

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
    this.selectionOutline = new Graphics();
    this.selectionHandles = new Graphics();

    this.elementContainer.sortableChildren = true;
    this.elementContainer.eventMode = "static";
    this.elementContainer.interactiveChildren = true;
    this.selectionOutline.eventMode = "none";
    this.selectionHandles.eventMode = "passive";
    this.selectionHandles.interactiveChildren = true;

    this.root.addChild(this.gridContainer);
    this.root.addChild(this.elementContainer);
    this.root.addChild(this.selectionContainer);
    this.root.addChild(this.guidesContainer);
    this.selectionContainer.addChild(this.selectionOutline);
    this.selectionContainer.addChild(this.selectionHandles);
    this.app.stage.eventMode = "static";
    this.root.eventMode = "static";
    this.root.hitArea = new Rectangle(0, 0, container.clientWidth || 800, container.clientHeight || 600);
    this.root.on("pointertap", (event) => {
      if (event.target !== this.root) {
        return;
      }
      const handlers = this.interactionProvider ? this.interactionProvider() : this.interactionHandlers;
      handlers?.onStageClick?.();
    });
    this.root.on("pointerdown", (event) => {
      if (event.target !== this.root) {
        return;
      }
      const local = this.root.toLocal(event.global);
      this.marqueeStart = { x: local.x, y: local.y };
      const rect = new Graphics()
        .rect(0, 0, 1, 1)
        .fill({ color: 0x4f46e5, alpha: 0.1 });
      rect.stroke({ width: 1, color: 0x4f46e5, alpha: 1 });
      rect.position.set(this.marqueeStart.x, this.marqueeStart.y);
      this.selectionRect = rect;
      this.selectionContainer?.addChild(rect);
    });
    this.root.on("pointermove", (event) => {
      if (!this.marqueeStart || !this.selectionRect) {
        return;
      }
      const local = this.root?.toLocal(event.global) ?? event.global;
      const x = Math.min(this.marqueeStart.x, local.x);
      const y = Math.min(this.marqueeStart.y, local.y);
      const width = Math.abs(local.x - this.marqueeStart.x);
      const height = Math.abs(local.y - this.marqueeStart.y);
      this.selectionRect.clear();
      this.selectionRect
        .rect(0, 0, width, height)
        .fill({ color: 0x4f46e5, alpha: 0.1 });
      this.selectionRect.stroke({ width: 1, color: 0x4f46e5, alpha: 1 });
      this.selectionRect.position.set(x, y);
    });
    this.root.on("pointerup", (event) => {
      if (!this.marqueeStart || !this.selectionRect) {
        return;
      }
      const local = this.root?.toLocal(event.global) ?? event.global;
      const x = Math.min(this.marqueeStart.x, local.x);
      const y = Math.min(this.marqueeStart.y, local.y);
      const width = Math.abs(local.x - this.marqueeStart.x);
      const height = Math.abs(local.y - this.marqueeStart.y);
      const selectionBounds = new Rectangle(x, y, width, height);
      const hits: string[] = [];
      this.data?.elements.forEach((element) => {
        const elementBounds = new Rectangle(element.x, element.y, element.width, element.height);
        if (selectionBounds.intersects(elementBounds)) {
          hits.push(element.id);
        }
      });
      if (hits.length > 0) {
        const handlers = this.interactionProvider ? this.interactionProvider() : this.interactionHandlers;
        hits.forEach((id, index) => {
          handlers?.onSelect?.(id, { shiftKey: index > 0, ctrlKey: false, metaKey: false });
        });
      }
      this.selectionContainer?.removeChild(this.selectionRect);
      this.selectionRect.destroy();
      this.selectionRect = null;
      this.marqueeStart = null;
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
    if (this.root) {
      this.root.hitArea = new Rectangle(0, 0, width, height);
    }
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
      const line = new Graphics();
      if (guide.type === "vertical") {
        line.moveTo(guide.position, guide.start);
        line.lineTo(guide.position, guide.end);
      } else {
        line.moveTo(guide.start, guide.position);
        line.lineTo(guide.end, guide.position);
      }
      line.stroke({ width: 1, color: 0xff00ff, alpha: 1 });
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
    const grid = new Graphics();
    const scale = Math.max(this.zoom, 0.01);
    let step = size;
    while (step * scale < 16) {
      step *= 2;
    }
    const width = snapToGrid(this.data.width, size);
    const height = snapToGrid(this.data.height, size);
    for (let x = 0; x <= width; x += step) {
      grid.moveTo(x, 0);
      grid.lineTo(x, height);
    }
    for (let y = 0; y <= height; y += step) {
      grid.moveTo(0, y);
      grid.lineTo(width, y);
    }
    grid.stroke({ width: 1, color: lineColor, alpha: 0.4 });
    this.gridNodes = [grid];
    this.gridContainer.addChild(grid);
  }

  hitTest(_point: Point): string | null {
    if (!this.root || !this.elementContainer) {
      return null;
    }
    const global = this.root.toGlobal(_point);
    const children = [...this.elementContainer.children].sort(
      (a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0)
    );
    for (let i = children.length - 1; i >= 0; i -= 1) {
      const child = children[i];
      const bounds = child.getBounds();
      if (bounds.contains(global.x, global.y)) {
        return child.name || null;
      }
    }
    return null;
  }

  getBounds(elementIds: string[]): AABB {
    if (!this.data || elementIds.length === 0) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }
    const bounds = new Rectangle();
    this.data.elements
      .filter((el) => elementIds.includes(el.id))
      .forEach((el) => {
        bounds.enlarge(new Rectangle(el.x, el.y, el.width, el.height));
      });
    return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
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
    this.elementNodes.clear();
    this.data.elements
      .filter((el) => el.visible)
      .forEach((element) => {
        const node = this.createElementNode(element);
        if (node) {
          node.zIndex = element.zIndex;
          node.name = element.id;
          this.elementContainer?.addChild(node);
          this.elementNodes.set(element.id, node);
        }
      });
    this.elementContainer.sortChildren();
  }

  private renderSelection(): void {
    if (!this.selectionContainer || !this.data || !this.selectionOutline || !this.selectionHandles) {
      return;
    }
    this.selectionOutline.clear();
    this.selectionHandles.removeChildren();
    this.selectionHandles.clear();
    if (this.selection.size === 0) {
      return;
    }
    const bounds = new Rectangle();
    this.selection.forEach((id) => {
      const node = this.elementNodes.get(id);
      if (!node) {
        return;
      }
      const localBounds = node.getBounds(this.root);
      bounds.enlarge(localBounds);
    });
    this.selectionOutline
      .rect(bounds.x, bounds.y, bounds.width, bounds.height)
      .stroke({ width: 1, color: 0x4f46e5, alpha: 1 });
    const handleSize = 8;
    const half = handleSize / 2;
    const positions: Array<{ x: number; y: number; handle: ResizeHandle }> = [
      { x: bounds.x, y: bounds.y, handle: "nw" },
      { x: bounds.x + bounds.width / 2, y: bounds.y, handle: "n" },
      { x: bounds.x + bounds.width, y: bounds.y, handle: "ne" },
      { x: bounds.x, y: bounds.y + bounds.height / 2, handle: "w" },
      { x: bounds.x + bounds.width, y: bounds.y + bounds.height / 2, handle: "e" },
      { x: bounds.x, y: bounds.y + bounds.height, handle: "sw" },
      { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height, handle: "s" },
      { x: bounds.x + bounds.width, y: bounds.y + bounds.height, handle: "se" }
    ];
    positions.forEach((position) => {
      const handle = new Graphics();
      handle
        .rect(position.x - half, position.y - half, handleSize, handleSize)
        .fill(0xffffff)
        .stroke({ width: 1, color: 0x4f46e5, alpha: 1 });
      handle.eventMode = "static";
      handle.cursor = this.getHandleCursor(position.handle);
      handle.on("pointerdown", (event) => {
        event.stopPropagation();
        const rotation = this.data?.elements.find((el) => el.id === Array.from(this.selection)[0])?.rotation ?? 0;
        this.resizeState = {
          id: Array.from(this.selection)[0],
          handle: position.handle,
          startBounds: bounds.clone(),
          startPointer: { x: event.global.x, y: event.global.y },
          rotation
        };
      });
      handle.on("pointermove", (event) => {
      if (!this.resizeState || this.resizeState.handle !== position.handle) {
        return;
      }
      if (!(event.buttons & 1)) {
        this.resizeState = null;
        return;
      }
      const handlers = this.interactionProvider ? this.interactionProvider() : this.interactionHandlers;
      const next = this.calculateResizeBounds(bounds, this.resizeState, event.global);
      handlers?.onTransformEnd?.(this.resizeState.id, {
        x: next.x,
          y: next.y,
          width: next.width,
          height: next.height,
          rotation: this.resizeState.rotation
        });
      });
      const endResize = (event: { global: Point }) => {
        if (!this.resizeState || this.resizeState.handle !== position.handle) {
          return;
        }
        const handlers = this.interactionProvider ? this.interactionProvider() : this.interactionHandlers;
        const next = this.calculateResizeBounds(bounds, this.resizeState, event.global);
        handlers?.onTransformEnd?.(this.resizeState.id, {
          x: next.x,
          y: next.y,
          width: next.width,
          height: next.height,
          rotation: this.resizeState.rotation
        });
        this.resizeState = null;
      };
      handle.on("pointerup", endResize);
      handle.on("pointerupoutside", endResize);
      this.selectionHandles?.addChild(handle);
    });
    const rotationHandle = new Graphics()
      .rect(bounds.x + bounds.width / 2 - half, bounds.y - handleSize * 2, handleSize, handleSize)
      .fill(0xffffff)
      .stroke({ width: 1, color: 0x4f46e5, alpha: 1 });
    rotationHandle.eventMode = "static";
    rotationHandle.cursor = "crosshair";
    rotationHandle.on("pointerdown", (event) => {
      event.stopPropagation();
      const rotation = this.data?.elements.find((el) => el.id === Array.from(this.selection)[0])?.rotation ?? 0;
      const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
      this.resizeState = {
        id: Array.from(this.selection)[0],
        handle: "n",
        startBounds: bounds.clone(),
        startPointer: { x: event.global.x, y: event.global.y },
        rotation: rotation + this.getRotationAngle(center, event.global)
      };
    });
    rotationHandle.on("pointermove", (event) => {
      if (!this.resizeState) {
        return;
      }
      if (!(event.buttons & 1)) {
        this.resizeState = null;
        return;
      }
      const handlers = this.interactionProvider ? this.interactionProvider() : this.interactionHandlers;
      const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
      const angle = this.getRotationAngle(center, event.global);
      const rotation = this.snapRotation(angle - this.resizeState.rotation);
      handlers?.onTransformEnd?.(this.resizeState.id, {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        rotation
      });
    });
    rotationHandle.on("pointerup", () => {
      this.resizeState = null;
    });
    this.selectionHandles?.addChild(rotationHandle);
  }

  private getHandleCursor(handle: ResizeHandle): string {
    switch (handle) {
      case "n":
      case "s":
        return "ns-resize";
      case "e":
      case "w":
        return "ew-resize";
      case "ne":
      case "sw":
        return "nesw-resize";
      case "nw":
      case "se":
        return "nwse-resize";
      default:
        return "default";
    }
  }

  private calculateResizeBounds(
    current: Rectangle,
    state: {
      handle: ResizeHandle;
      startBounds: Rectangle;
      startPointer: Point;
    },
    pointer: Point
  ): Rectangle {
    const dx = (pointer.x - state.startPointer.x) / this.zoom;
    const dy = (pointer.y - state.startPointer.y) / this.zoom;
    let { x, y, width, height } = state.startBounds;
    if (state.handle.includes("e")) {
      width = Math.max(1, width + dx);
    }
    if (state.handle.includes("s")) {
      height = Math.max(1, height + dy);
    }
    if (state.handle.includes("w")) {
      const nextWidth = Math.max(1, width - dx);
      x += width - nextWidth;
      width = nextWidth;
    }
    if (state.handle.includes("n")) {
      const nextHeight = Math.max(1, height - dy);
      y += height - nextHeight;
      height = nextHeight;
    }
    const next = new Rectangle();
    next.x = x;
    next.y = y;
    next.width = width;
    next.height = height;
    return next;
  }

  private getRotationAngle(center: Point, pointer: Point): number {
    const angle = Math.atan2(pointer.y - center.y, pointer.x - center.x);
    return angle * RAD_TO_DEG;
  }

  private snapRotation(rotation: number): number {
    const step = 15;
    return Math.round(rotation / step) * step;
  }

  private applyCamera(): void {
    if (!this.root) {
      return;
    }
    this.root.position.set(this.pan.x, this.pan.y);
    this.root.scale.set(this.zoom);
    this.root.pivot.set(0, 0);
  }

  private createElementNode(element: LayoutElement): Container | Graphics | Sprite | Text | null {
    switch (element.type) {
      case "rectangle": {
        const rect = new Graphics();
        const fillColor = (element.properties as { fillColor?: string }).fillColor ?? DEFAULT_PIXI_BACKGROUND;
        rect.rect(0, 0, element.width, element.height);
        rect.fill(parseHexColor(fillColor));
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
          if (!(event.buttons & 1)) {
            this.dragState = null;
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
        rect.on("pointerupoutside", (event) => {
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
        ellipse.ellipse(element.width / 2, element.height / 2, element.width / 2, element.height / 2);
        ellipse.fill(parseHexColor(fillColor));
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
          if (!(event.buttons & 1)) {
            this.dragState = null;
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
        ellipse.on("pointerupoutside", (event) => {
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
        const line = new Graphics();
        line.moveTo(0, element.height / 2);
        line.lineTo(element.width, element.height / 2);
        line.stroke({ width: 2, color: parseHexColor(strokeColor), alpha: 1 });
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
          if (!(event.buttons & 1)) {
            this.dragState = null;
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
        line.on("pointerupoutside", (event) => {
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
        const group = new Graphics();
        group.rect(0, 0, element.width, element.height);
        group.stroke({ width: 1, color: 0x999999, alpha: 1 });
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
