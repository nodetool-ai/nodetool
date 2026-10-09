import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from "react";
import { useColorScheme, useTheme } from "@mui/material/styles";
import type { GameDocument, GameRenderFrame } from "@nodetool-ai/protocol/game.js";
import { projectedCamera } from "@nodetool-ai/game-renderer";

import { Box, EditorButton, FlexRow, SPACING, Z_INDEX } from "../../ui_primitives";
import { isMac } from "../../../utils/platform";
import { useGameCommandHandlers, useGameCommandShortcut } from "../shell/useGameCommands";
import { selectionDescendants, localTransform, selectionRoots, worldTransforms, hitEntityIcons, hitSprites, spriteHandle, spriteRotationAt, spriteScaleAt, worldPoint } from "./viewportGeometry";

interface GameViewportProps {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  frame: GameRenderFrame | null;
  document: GameDocument;
  sceneId?: string;
  playing: boolean;
  paused: boolean;
  active: boolean;
  selectedIds: readonly string[];
  highlightedIds: readonly string[];
  onSelect: (id: string, additive: boolean) => void;
  onSelectMany: (ids: string[], additive: boolean) => void;
  onMove: (id: string, x: number, y: number, gestureId?: number) => void;
  onMoves?: (moves: readonly { id: string; x: number; y: number }[], gestureId?: number) => void;
  onTransform: (id: string, set: { scaleX?: number; scaleY?: number; rotation?: number }, gestureId?: number) => void;
  onLight: (sceneId: string, index: number, set: { x?: number; y?: number; radius?: number }, gestureId?: number) => void;
  onGestureStart?: () => number;
  onGestureEnd?: (gestureId: number) => void;
  onCamera: (camera: { x: number; y: number; zoom: number }) => void;
  onViewportAspect: (aspect: number) => void;
  onKeyDown: (event: KeyboardEvent<HTMLCanvasElement>) => void;
  onKeyUp: (event: KeyboardEvent<HTMLCanvasElement>) => void;
  onBlur: () => void;
}

interface MoveDrag {
  kind: "move";
  entityId: string;
  startX: number;
  startY: number;
  entityX: number;
  entityY: number;
  entities: { id: string; x: number; y: number }[];
}
interface GizmoDrag { kind: "scale" | "rotate"; sprite: GameRenderFrame["sprites"][number] }
interface MarqueeDrag { kind: "marquee"; startX: number; startY: number; additive: boolean }
interface LightDrag { kind: "light_move" | "light_radius"; sceneId: string; index: number; x: number; y: number; radius: number; startX: number; startY: number }
type DragState = MoveDrag | GizmoDrag | MarqueeDrag | LightDrag;

interface PanState { pixelX: number; pixelY: number; cameraX: number; cameraY: number }

function point(event: { clientX: number; clientY: number }, canvas: HTMLCanvasElement): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const scale = Math.min(rect.width / canvas.width, rect.height / canvas.height);
  const insetX = (rect.width - canvas.width * scale) / 2;
  const insetY = (rect.height - canvas.height * scale) / 2;
  return {
    x: (event.clientX - rect.left - insetX) / scale,
    y: (event.clientY - rect.top - insetY) / scale
  };
}

export default function GameViewport({ canvasRef, frame, document, sceneId, playing, paused, active, selectedIds, highlightedIds, onSelect, onSelectMany, onMove, onMoves, onTransform, onLight, onGestureStart, onGestureEnd, onCamera, onViewportAspect, onKeyDown, onKeyUp, onBlur }: GameViewportProps) {
  const gestureRef = useRef<number | null>(null);
  const gestureCallbacks = useRef({ onGestureStart, onGestureEnd });
  gestureCallbacks.current = { onGestureStart, onGestureEnd };
  const startGesture = () => {
    if (gestureRef.current === null) { gestureRef.current = gestureCallbacks.current.onGestureStart?.() ?? null; }
  };
  const endGesture = () => {
    const id = gestureRef.current;
    gestureRef.current = null;
    if (id !== null) { gestureCallbacks.current.onGestureEnd?.(id); }
  };
  const theme = useTheme();
  const mac = isMac();
  const { mode, systemMode } = useColorScheme();
  const colorMode = mode === "dark" || (mode === "system" && systemMode === "dark") ? "dark" : "light";
  const palette = theme.colorSchemes?.[colorMode]?.palette ?? theme.palette;
  const [showGrid, setShowGrid] = useState(false);
  const [snapToGrid, setSnapToGrid] = useState(true);
  useGameCommandHandlers({ "view.toggleSnap": { run: () => setSnapToGrid((value) => !value), enabled: !playing } });
  const snapShortcut = useGameCommandShortcut("view.toggleSnap");
  const [showSelection, setShowSelection] = useState(true);
  const [panTool, setPanTool] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [showColliders, setShowColliders] = useState(false);
  const [showLights, setShowLights] = useState(false);
  const [showBackgrounds, setShowBackgrounds] = useState(false);
  const [showCameraBounds, setShowCameraBounds] = useState(false);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const previewRef = useRef<{ entityId: string; x?: number; y?: number; rotation?: number; scaleX?: number; scaleY?: number } | null>(null);
  const marqueeRef = useRef<{ startX: number; startY: number; endX: number; endY: number } | null>(null);
  const lightPreviewRef = useRef<{ sceneId: string; index: number; x: number; y: number; radius: number } | null>(null);
  const panRef = useRef<PanState | null>(null);
  const spaceHeldRef = useRef(false);
  const scene = document.scenes.find((item) => item.id === (sceneId ?? document.entrySceneId)) ?? document.scenes[0];

  const transforms = scene ? worldTransforms(scene) : new Map<string, GameDocument["scenes"][number]["entities"][number]["transform2d"]>();

  const movingEntities = (id: string): { id: string; x: number; y: number }[] => {
    if (!scene) return [];
    return selectionRoots(scene, selectedIds.includes(id) ? selectedIds : [id]).flatMap(entity => {
      const transform = transforms.get(entity.id);
      return transform ? [{ id: entity.id, x: transform.x, y: transform.y }] : [];
    });
  };

  const paintOverlay = useCallback(() => {
    const overlay = overlayRef.current;
    if (!overlay || !frame) return;
    const context = overlay.getContext("2d");
    if (!context) return;
    const width = Math.round(frame.width * frame.pixelsPerUnit);
    const height = Math.round(frame.height * frame.pixelsPerUnit);
    if (overlay.width !== width || overlay.height !== height) {
      overlay.width = width;
      overlay.height = height;
    }
    context.clearRect(0, 0, width, height);
    const camera = projectedCamera(frame, 1);
    const scale = camera.zoom * frame.pixelsPerUnit;
    const project = (x: number, y: number) => ({ x: width / 2 + (x - camera.x) * scale,
      y: height / 2 - (y - camera.y) * scale });
    if (showGrid) {
      let step = 0.25;
      while (frame.width / frame.camera.zoom / step > 100) step *= 2;
      context.strokeStyle = palette.divider;
      context.lineWidth = 1;
      const left = frame.camera.x - frame.width / (2 * frame.camera.zoom);
      const right = frame.camera.x + frame.width / (2 * frame.camera.zoom);
      const bottom = frame.camera.y - frame.height / (2 * frame.camera.zoom);
      const top = frame.camera.y + frame.height / (2 * frame.camera.zoom);
      for (let x = Math.ceil(left / step) * step; x <= right; x += step) {
        const screen = project(x, 0).x;
        context.beginPath(); context.moveTo(screen, 0); context.lineTo(screen, height); context.stroke();
      }
      for (let y = Math.ceil(bottom / step) * step; y <= top; y += step) {
        const screen = project(0, y).y;
        context.beginPath(); context.moveTo(0, screen); context.lineTo(width, screen); context.stroke();
      }
    }
    const transforms = scene ? worldTransforms(scene) : new Map<string, GameDocument["scenes"][number]["entities"][number]["transform2d"]>();
    if (scene && showColliders) {
      for (const entity of scene.entities) {
        if (!entity.collider2d) continue;
        const category = Math.log2(entity.collider2d.category & -entity.collider2d.category);
        const colors = [palette.info.main, palette.warning.main,
          palette.success.main, palette.error.main];
        context.strokeStyle = colors[(Number.isFinite(category) ? category : 0) % colors.length];
        const transform = transforms.get(entity.id);
        if (!transform) continue;
        const center = project(transform.x, transform.y);
        context.save(); context.translate(center.x, center.y); context.rotate(-transform.rotation);
        context.strokeRect(-entity.collider2d.width * transform.scaleX * scale / 2,
          -entity.collider2d.height * transform.scaleY * scale / 2,
          entity.collider2d.width * transform.scaleX * scale,
          entity.collider2d.height * transform.scaleY * scale);
        context.restore();
      }
    }
    if (scene && showLights) {
      context.strokeStyle = palette.warning.main;
      for (const [index, original] of (scene.lighting?.points ?? []).entries()) {
        const light = lightPreviewRef.current?.sceneId === scene.id && lightPreviewRef.current.index === index
          ? lightPreviewRef.current : original;
        const center = project(light.x, light.y);
        context.beginPath(); context.arc(center.x, center.y, light.radius * scale, 0, Math.PI * 2); context.stroke();
        context.beginPath(); context.arc(center.x, center.y, 4, 0, Math.PI * 2); context.fillStyle = palette.warning.main; context.fill();
      }
    }
    if (scene && showBackgrounds) {
      context.strokeStyle = palette.secondary.main;
      for (const background of scene.backgrounds ?? []) {
        const origin = project(background.origin.x, background.origin.y);
        context.beginPath(); context.moveTo(origin.x - 6, origin.y); context.lineTo(origin.x + 6, origin.y);
        context.moveTo(origin.x, origin.y - 6); context.lineTo(origin.x, origin.y + 6); context.stroke();
      }
    }
    if (scene && showCameraBounds) {
      context.strokeStyle = palette.success.main;
      for (const entity of scene.entities) {
        if (!entity.camera2d) continue;
        const transform = transforms.get(entity.id);
        if (!transform) continue;
        const center = project(transform.x, transform.y);
        context.strokeRect(center.x - entity.camera2d.width * scale / 2, center.y - entity.camera2d.height * scale / 2,
          entity.camera2d.width * scale, entity.camera2d.height * scale);
      }
    }
    if (scene && !playing) {
      const visibleSprites = new Set(frame.sprites.map((sprite) => sprite.entityId));
      for (const entity of scene.entities) {
        if (visibleSprites.has(entity.id)) continue;
        const transform = transforms.get(entity.id);
        if (!transform) continue;
        const center = project(transform.x, transform.y);
        context.fillStyle = selectedIds.includes(entity.id) ? palette.warning.main : palette.text.secondary;
        context.fillRect(center.x - 4, center.y - 4, 8, 8);
      }
    }
    context.lineWidth = 2;
    const moveDrag = dragRef.current;
    const movedIds = scene && moveDrag?.kind === "move"
      ? selectionDescendants(scene, moveDrag.entities.map(entity => entity.id)) : new Set<string>();
    if (showSelection) for (const sprite of frame.sprites) {
      if (!selectedIds.includes(sprite.entityId) && !highlightedIds.includes(sprite.entityId)) continue;
      context.strokeStyle = selectedIds.includes(sprite.entityId) ? palette.warning.main : palette.info.main;
      const drag = dragRef.current;
      const movePreview = previewRef.current;
      const moving = drag?.kind === "move" && movePreview?.x !== undefined && movePreview.y !== undefined && movedIds.has(sprite.entityId);
      const preview = moving && drag?.kind === "move" && movePreview?.x !== undefined && movePreview.y !== undefined
        ? { x: sprite.x + movePreview.x - drag.entityX, y: sprite.y + movePreview.y - drag.entityY }
        : previewRef.current?.entityId === sprite.entityId ? previewRef.current : null;
      const current = { ...sprite, ...preview };
      const x = width / 2 + (current.x - frame.camera.x) * scale;
      const y = height / 2 - (current.y - frame.camera.y) * scale;
      context.save();
      context.translate(x, y);
      context.rotate(-current.rotation);
      context.strokeRect(-current.width * current.scaleX * scale / 2, -current.height * current.scaleY * scale / 2,
        current.width * current.scaleX * scale, current.height * current.scaleY * scale);
      context.restore();
      if (!paused && selectedIds.includes(sprite.entityId)) {
        const corner = spriteHandle(current, "scale");
        const rotate = spriteHandle(current, "rotate");
        const cornerX = width / 2 + (corner.x - frame.camera.x) * scale;
        const cornerY = height / 2 - (corner.y - frame.camera.y) * scale;
        const rotateX = width / 2 + (rotate.x - frame.camera.x) * scale;
        const rotateY = height / 2 - (rotate.y - frame.camera.y) * scale;
        context.fillStyle = palette.warning.main;
        context.fillRect(cornerX - 5, cornerY - 5, 10, 10);
        context.beginPath();
        context.arc(rotateX, rotateY, 5, 0, Math.PI * 2);
        context.fill();
      }
    }
    if (marqueeRef.current) {
      const start = project(marqueeRef.current.startX, marqueeRef.current.startY);
      const end = project(marqueeRef.current.endX, marqueeRef.current.endY);
      context.strokeStyle = palette.info.main;
      context.strokeRect(Math.min(start.x, end.x), Math.min(start.y, end.y), Math.abs(start.x - end.x), Math.abs(start.y - end.y));
    }
  }, [frame, scene, selectedIds, highlightedIds, showGrid, showColliders, showLights, showCameraBounds,
    showSelection, showBackgrounds, paused, playing,
    palette]);

  useEffect(() => { paintOverlay(); }, [paintOverlay]);
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
        onViewportAspect(entry.contentRect.width / entry.contentRect.height);
      }
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, [onViewportAspect]);

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!frame || (playing && !paused) || !active) return;
    const canvas = event.currentTarget;
    const pixel = point(event, canvas);
    canvasRef.current?.focus();
    if (event.button === 1 || event.button === 2 || spaceHeldRef.current || (panTool && event.button === 0)) {
      panRef.current = { pixelX: pixel.x, pixelY: pixel.y, cameraX: frame.camera.x, cameraY: frame.camera.y };
      setIsPanning(true);
      canvas.setPointerCapture(event.pointerId);
      return;
    }
    const world = worldPoint(pixel.x, pixel.y, frame, canvas.width, canvas.height);
    if (paused) {
      const hits = hitSprites(frame, world.x, world.y);
      const selectedIndex = hits.findIndex((sprite) => selectedIds.includes(sprite.entityId));
      const sprite = event.altKey && hits.length > 0 ? hits[(selectedIndex + 1) % hits.length] : hits[0];
      if (sprite) onSelect(sprite.entityId, event.shiftKey);
      return;
    }
    const scale = frame.camera.zoom * frame.pixelsPerUnit;
    if (showLights && scene?.lighting) {
      for (const [index, light] of scene.lighting.points.entries()) {
        const distance = Math.hypot((light.x - world.x) * scale, (light.y - world.y) * scale);
        const kind = distance <= 10 ? "light_move" : Math.abs(distance - light.radius * scale) <= 10 ? "light_radius" : null;
        if (!kind) continue;
        dragRef.current = { kind, sceneId: scene.id, index, x: light.x, y: light.y, radius: light.radius,
          startX: world.x, startY: world.y };
        startGesture();
        canvas.setPointerCapture(event.pointerId);
        return;
      }
    }
    for (const selected of frame.sprites.filter((sprite) => selectedIds.includes(sprite.entityId))) {
      for (const kind of ["rotate", "scale"] as const) {
        const handle = spriteHandle(selected, kind);
        const handleX = canvas.width / 2 + (handle.x - frame.camera.x) * scale;
        const handleY = canvas.height / 2 - (handle.y - frame.camera.y) * scale;
        if (Math.hypot(handleX - pixel.x, handleY - pixel.y) <= 10) {
          dragRef.current = { kind, sprite: selected };
          startGesture();
          canvas.setPointerCapture(event.pointerId);
          return;
        }
      }
    }
    const hits = hitSprites(frame, world.x, world.y);
    const selectedIndex = hits.findIndex((sprite) => selectedIds.includes(sprite.entityId));
    const sprite = event.altKey && hits.length > 0 ? hits[(selectedIndex + 1) % hits.length] : hits[0];
    if (!sprite) {
      const icons = scene ? hitEntityIcons(scene, frame, world.x, world.y) : [];
      const selectedIconIndex = icons.findIndex((entity) => selectedIds.includes(entity.id));
      const icon = event.altKey && icons.length > 0 ? icons[(selectedIconIndex + 1) % icons.length] : icons[0];
      if (icon) {
        if (!selectedIds.includes(icon.id) || event.shiftKey) onSelect(icon.id, event.shiftKey);
        if (event.altKey) return;
        dragRef.current = { kind: "move", entityId: icon.id, startX: world.x, startY: world.y,
          entityX: transforms.get(icon.id)?.x ?? icon.transform2d.x, entityY: transforms.get(icon.id)?.y ?? icon.transform2d.y, entities: movingEntities(icon.id) };
      } else {
        dragRef.current = { kind: "marquee", startX: world.x, startY: world.y, additive: event.shiftKey };
        marqueeRef.current = { startX: world.x, startY: world.y, endX: world.x, endY: world.y };
      }
      if (dragRef.current.kind === "move") { startGesture(); }
      canvas.setPointerCapture(event.pointerId);
      return;
    }
    if (!selectedIds.includes(sprite.entityId) || event.shiftKey) onSelect(sprite.entityId, event.shiftKey);
    if (event.altKey) return;
    dragRef.current = { kind: "move", entityId: sprite.entityId, startX: world.x, startY: world.y, entityX: sprite.x, entityY: sprite.y, entities: movingEntities(sprite.entityId) };
    startGesture();
    canvas.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!frame) return;
    const canvas = event.currentTarget;
    const pixel = point(event, canvas);
    if (panRef.current) {
      const scale = frame.camera.zoom * frame.pixelsPerUnit;
      onCamera({ x: panRef.current.cameraX - (pixel.x - panRef.current.pixelX) / scale,
        y: panRef.current.cameraY + (pixel.y - panRef.current.pixelY) / scale, zoom: frame.camera.zoom });
      return;
    }
    const drag = dragRef.current;
    if (!drag) return;
    const world = worldPoint(pixel.x, pixel.y, frame, canvas.width, canvas.height);
    if (drag.kind === "move") {
      let deltaX = world.x - drag.startX;
      let deltaY = world.y - drag.startY;
      if (event.shiftKey) {
        if (Math.abs(deltaX) >= Math.abs(deltaY)) deltaY = 0;
        else deltaX = 0;
      }
      previewRef.current = { entityId: drag.entityId, x: drag.entityX + deltaX, y: drag.entityY + deltaY };
    } else if (drag.kind === "scale") {
      previewRef.current = { entityId: drag.sprite.entityId, ...spriteScaleAt(drag.sprite, world.x, world.y, event.shiftKey) };
    } else if (drag.kind === "rotate") {
      previewRef.current = { entityId: drag.sprite.entityId,
        rotation: spriteRotationAt(drag.sprite, world.x, world.y, event.shiftKey) };
    } else if (drag.kind === "marquee") {
      marqueeRef.current = { startX: drag.startX, startY: drag.startY, endX: world.x, endY: world.y };
    } else if (drag.kind === "light_move") {
      lightPreviewRef.current = { sceneId: drag.sceneId, index: drag.index,
        x: drag.x + world.x - drag.startX, y: drag.y + world.y - drag.startY, radius: drag.radius };
    } else if (drag.kind === "light_radius") {
      lightPreviewRef.current = { sceneId: drag.sceneId, index: drag.index, x: drag.x, y: drag.y,
        radius: Math.max(0.01, Math.hypot(world.x - drag.x, world.y - drag.y)) };
    }
    paintOverlay();
  };

  const onPointerUp = () => {
    const drag = dragRef.current;
    const preview = previewRef.current;
    const marquee = marqueeRef.current;
    const lightPreview = lightPreviewRef.current;
    dragRef.current = null;
    previewRef.current = null;
    marqueeRef.current = null;
    lightPreviewRef.current = null;
    panRef.current = null;
    setIsPanning(false);
    try {
      if (drag?.kind === "move" && preview?.x !== undefined && preview.y !== undefined &&
          (preview.x !== drag.entityX || preview.y !== drag.entityY)) {
        const x = snapToGrid ? Math.round(preview.x * 4) / 4 : preview.x;
        const y = snapToGrid ? Math.round(preview.y * 4) / 4 : preview.y;
        const entities = new Map(scene?.entities.map(entity => [entity.id, entity]) ?? []);
        const moves: { id: string; x: number; y: number }[] = [];
        if (scene) for (const moved of drag.entities) {
          const entity = entities.get(moved.id);
          const transform = transforms.get(moved.id);
          if (!entity || !transform) continue;
          const local = localTransform(scene, entity.parentId, { ...transform,
            x: moved.x + x - drag.entityX, y: moved.y + y - drag.entityY }, transforms);
          moves.push({ id: moved.id, x: local.x, y: local.y });
        }
        if (moves.length && onMoves) { onMoves(moves, gestureRef.current ?? undefined); }
        else { for (const moved of moves) { onMove(moved.id, moved.x, moved.y, gestureRef.current ?? undefined); } }
      } else if (drag?.kind === "scale" && preview?.scaleX !== undefined && preview.scaleY !== undefined) {
        const entity = scene?.entities.find(entry => entry.id === drag.sprite.entityId);
        if (scene && entity) {
          const local = localTransform(scene, entity.parentId, { ...drag.sprite, scaleX: preview.scaleX, scaleY: preview.scaleY });
          onTransform(entity.id, { scaleX: local.scaleX, scaleY: local.scaleY }, gestureRef.current ?? undefined);
        }
      } else if (drag?.kind === "rotate" && preview?.rotation !== undefined) {
        const entity = scene?.entities.find(entry => entry.id === drag.sprite.entityId);
        if (scene && entity) {
          const local = localTransform(scene, entity.parentId, { ...drag.sprite, rotation: preview.rotation });
          onTransform(entity.id, { rotation: local.rotation }, gestureRef.current ?? undefined);
        }
      } else if (drag?.kind === "marquee" && marquee && frame) {
        const minX = Math.min(marquee.startX, marquee.endX);
        const maxX = Math.max(marquee.startX, marquee.endX);
        const minY = Math.min(marquee.startY, marquee.endY);
        const maxY = Math.max(marquee.startY, marquee.endY);
        const ids = new Set(frame.sprites.filter((sprite) => sprite.x >= minX && sprite.x <= maxX && sprite.y >= minY && sprite.y <= maxY)
          .map((sprite) => sprite.entityId));
        for (const entity of scene?.entities ?? []) {
          const transform = transforms.get(entity.id);
          if (transform && transform.x >= minX && transform.x <= maxX &&
              transform.y >= minY && transform.y <= maxY) ids.add(entity.id);
        }
        onSelectMany([...ids], drag.additive);
      } else if (drag?.kind === "light_move" && lightPreview) {
        onLight(drag.sceneId, drag.index, { x: lightPreview.x, y: lightPreview.y }, gestureRef.current ?? undefined);
      } else if (drag?.kind === "light_radius" && lightPreview) {
        onLight(drag.sceneId, drag.index, { radius: lightPreview.radius }, gestureRef.current ?? undefined);
      }
      paintOverlay();
    } finally { endGesture(); }
  };

  const onPointerCancel = () => {
    dragRef.current = null;
    previewRef.current = null;
    marqueeRef.current = null;
    lightPreviewRef.current = null;
    panRef.current = null;
    setIsPanning(false);
    endGesture();
    paintOverlay();
  };
  const cancelRef = useRef(onPointerCancel);
  cancelRef.current = onPointerCancel;
  useEffect(() => {
    const cancel = () => cancelRef.current();
    window.addEventListener("blur", cancel);
    return () => { window.removeEventListener("blur", cancel); cancel(); };
  }, []);

  return (
    <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, overflow: "auto", bgcolor: "background.default" }}>
      <Box ref={stageRef} sx={{ position: "relative", width: "100%", height: "100%" }}>
        {!playing && <FlexRow gap={SPACING.xs} wrap sx={{ position: "absolute", top: SPACING.xs, left: SPACING.xs, right: SPACING.xs, zIndex: Z_INDEX.raised }}>
          <EditorButton variant={panTool ? "contained" : "text"} aria-pressed={panTool}
            title={mac ? "Two-finger scroll or right/middle drag to pan. Pinch or Ctrl+scroll to zoom."
              : "Right/middle drag to pan. Mouse wheel zooms."}
            onClick={() => setPanTool((value) => !value)}>Pan</EditorButton>
          <EditorButton variant={showSelection ? "contained" : "text"} onClick={() => setShowSelection((value) => !value)}>Selection</EditorButton>
          <EditorButton variant={showGrid ? "contained" : "text"} onClick={() => setShowGrid((value) => !value)}>Grid</EditorButton>
          <EditorButton variant={snapToGrid ? "contained" : "text"} title={snapShortcut ? `Toggle snapping (${snapShortcut.join("+")})` : "Toggle snapping"}
            onClick={() => setSnapToGrid((value) => !value)}>Snap</EditorButton>
          <EditorButton variant={showColliders ? "contained" : "text"} onClick={() => setShowColliders((value) => !value)}>Colliders</EditorButton>
          <EditorButton variant={showLights ? "contained" : "text"} onClick={() => setShowLights((value) => !value)}>Lights</EditorButton>
          <EditorButton variant={showBackgrounds ? "contained" : "text"} onClick={() => setShowBackgrounds((value) => !value)}>Backgrounds</EditorButton>
          <EditorButton variant={showCameraBounds ? "contained" : "text"} onClick={() => setShowCameraBounds((value) => !value)}>Camera</EditorButton>
        </FlexRow>}
        <Box component="canvas" ref={canvasRef} width={512} height={288} aria-label="Game viewport" role="group" tabIndex={0}
          onKeyDown={(event) => {
            if (!playing && event.code === "Space") { event.preventDefault(); spaceHeldRef.current = true; }
            onKeyDown(event);
          }}
          onKeyUp={(event) => { if (event.code === "Space") spaceHeldRef.current = false; onKeyUp(event); }}
          onBlur={() => { spaceHeldRef.current = false; onPointerCancel(); onBlur(); }}
          sx={{ width: "100%", height: "100%", objectFit: "contain" }} />
        {(!playing || paused) && frame && <Box component="canvas" ref={overlayRef} width={Math.round(frame.width * frame.pixelsPerUnit)} height={Math.round(frame.height * frame.pixelsPerUnit)}
          aria-label="Game edit overlay" role="group"
          onContextMenu={(event) => event.preventDefault()}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel} onLostPointerCapture={onPointerCancel}
          onWheel={(event) => {
            if (!active) return;
            event.preventDefault();
            const canvas = event.currentTarget;
            if (mac && !event.ctrlKey && !event.metaKey) {
              const rect = canvas.getBoundingClientRect();
              const cssScale = Math.min(rect.width / canvas.width, rect.height / canvas.height);
              const wheelScale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1;
              const scale = cssScale * frame.camera.zoom * frame.pixelsPerUnit;
              onCamera({ x: frame.camera.x + event.deltaX * wheelScale / scale,
                y: frame.camera.y - event.deltaY * wheelScale / scale, zoom: frame.camera.zoom });
              return;
            }
            const pixel = point(event, canvas);
            const before = worldPoint(pixel.x, pixel.y, frame, canvas.width, canvas.height);
            const zoom = Math.min(4, Math.max(0.25, frame.camera.zoom * Math.exp(-event.deltaY * 0.001)));
            onCamera({ x: before.x - (pixel.x - canvas.width / 2) / (zoom * frame.pixelsPerUnit),
              y: before.y + (pixel.y - canvas.height / 2) / (zoom * frame.pixelsPerUnit), zoom });
          }}
          sx={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", touchAction: "none",
            cursor: isPanning ? "grabbing" : panTool ? "grab" : undefined }} />}
      </Box>
    </Box>
  );
}
