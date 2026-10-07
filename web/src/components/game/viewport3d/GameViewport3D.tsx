import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTheme } from "@mui/material/styles";
import { BoxHelper, Box3, GridHelper, Matrix4, Object3D, PerspectiveCamera, Quaternion, Vector3 } from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { FlyControls } from "three/addons/controls/FlyControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import type { GameDocument3D, GameRenderFrame3D, GameTransform3D } from "@nodetool-ai/protocol";
import type { GameDocumentOp3D } from "@nodetool-ai/game-runtime";
import CenterFocusStrongOutlinedIcon from "@mui/icons-material/CenterFocusStrongOutlined";
import FlightOutlinedIcon from "@mui/icons-material/FlightOutlined";
import GridOnIcon from "@mui/icons-material/GridOn";
import GridViewOutlinedIcon from "@mui/icons-material/GridViewOutlined";
import LayersOutlinedIcon from "@mui/icons-material/LayersOutlined";
import OpenInFullIcon from "@mui/icons-material/OpenInFull";
import OpenWithIcon from "@mui/icons-material/OpenWith";
import SportsEsportsOutlinedIcon from "@mui/icons-material/SportsEsportsOutlined";
import ThreeSixtyIcon from "@mui/icons-material/ThreeSixty";
import { BORDER_RADIUS, Box, Caption, Divider, FlexColumn, FlexRow, FONT_SIZE_SANS, SPACING, ToolbarIconButton } from "../../ui_primitives";
import { syncGameTransformTarget3D } from "../gameTransformTarget3D";
import GamePanelHeader from "../GamePanelHeader";
import { createGameViewportOverlays3D, disposeGameViewportOverlays3D } from "./gameViewportOverlays3D";
import type { GamePlaySession3D } from "../useGamePlaySession3D";

type TransformMode = "translate" | "rotate" | "scale";

const TOOLS: readonly { mode: TransformMode; label: string; key: string; code: string; icon: ReactNode }[] = [
  { mode: "translate", label: "Move", key: "W", code: "KeyW", icon: <OpenWithIcon fontSize="small" /> },
  { mode: "rotate", label: "Rotate", key: "E", code: "KeyE", icon: <ThreeSixtyIcon fontSize="small" /> },
  { mode: "scale", label: "Scale", key: "R", code: "KeyR", icon: <OpenInFullIcon fontSize="small" /> }
];
const HEADER_ICON_SX = { fontSize: FONT_SIZE_SANS.body, color: "text.secondary" } as const;

interface GameViewport3DProps {
  readonly document: GameDocument3D;
  readonly host: GamePlaySession3D;
  readonly selectedId?: string;
  readonly highlightedIds?: readonly string[];
  readonly sceneId: string;
  readonly onSelect?: (id: string) => void;
  readonly onOps?: (ops: GameDocumentOp3D[], gestureId?: number) => void;
  readonly onGestureStart?: () => number;
  readonly onGestureEnd?: (gestureId: number) => void;
  readonly playerOnly?: boolean;
}

function matrix(transform: GameTransform3D): Matrix4 {
  return new Matrix4().compose(new Vector3(transform.position.x, transform.position.y, transform.position.z),
    new Quaternion().fromArray(transform.rotation), new Vector3(transform.scale.x, transform.scale.y, transform.scale.z));
}

function transform(matrixValue: Matrix4): GameTransform3D {
  const position = new Vector3();
  const rotation = new Quaternion();
  const scale = new Vector3();
  matrixValue.decompose(position, rotation, scale);
  return { position: { x: position.x, y: position.y, z: position.z }, rotation: [rotation.x, rotation.y, rotation.z, rotation.w],
    scale: { x: scale.x, y: scale.y, z: scale.z } };
}

export default function GameViewport3D({ document, host, selectedId, highlightedIds = [], sceneId, onSelect, onOps, onGestureStart, onGestureEnd, playerOnly = false }: GameViewport3DProps) {
  const theme = useTheme();
  const [mode, setMode] = useState<TransformMode>("translate");
  const [snap, setSnap] = useState(true);
  const [flyMode, setFlyMode] = useState(false);
  const [overlays, setOverlays] = useState(true);
  const cameraPoseRef = useRef({ position: [8, 7, 10], target: [0, 1, 0] });
  const controlsRef = useRef<{ orbit: OrbitControls; gizmo: TransformControls; camera: PerspectiveCamera; target: Object3D } | null>(null);
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  const currentRef = useRef({ document, frame: host.frame, onOps, sceneId, onGestureStart, onGestureEnd });
  currentRef.current = { document, frame: host.frame, onOps, sceneId, onGestureStart, onGestureEnd };

  useEffect(() => {
    const renderer = host.rendererRef.current;
    const canvas = host.canvasRef.current;
    if (!renderer || !canvas || playerOnly || host.playDocument) { return; }
    const camera = new PerspectiveCamera(60, canvas.width / canvas.height, 0.05, 2000);
    camera.position.fromArray(cameraPoseRef.current.position);
    const orbit = new OrbitControls(camera, canvas);
    orbit.target.fromArray(cameraPoseRef.current.target);
    orbit.update();
    renderer.setEditorCamera(camera);
    const grid = new GridHelper(40, 40);
    renderer.getScene().add(grid);
    let fly: FlyControls | null = null;
    if (flyMode) { orbit.enabled = false; }
    const gizmo = new TransformControls(camera, canvas);
    renderer.getScene().add(gizmo.getHelper());
    const target = new Object3D();
    renderer.getScene().add(target);
    controlsRef.current = { orbit, gizmo, camera, target };
    let gestureId: number | undefined;
    const endGesture = (): void => {
      const id = gestureId;
      gestureId = undefined;
      if (id !== undefined) { currentRef.current.onGestureEnd?.(id); }
    };
    let dragging = false;
    let dragStartMatrix: Matrix4 | null = null;
    let pending: GameTransform3D | null = null;
    let preview: GameRenderFrame3D | null = null;
    const render = (): void => {
      const frame = preview ?? currentRef.current.frame;
      camera.aspect = canvas.width / canvas.height;
      camera.updateProjectionMatrix();
      if (frame) { void renderer.render(frame, 1).catch(() => undefined); }
    };
    const orbitChange = (): void => {
      cameraPoseRef.current = { position: camera.position.toArray(), target: orbit.target.toArray() };
      render();
    };
    const objectChange = (): void => {
      if (!dragging) { return; }
      const id = selectedRef.current;
      const object = gizmo.object;
      const current = currentRef.current;
      const frame = current.frame;
      if (!id || !object || !frame) { return; }
      object.updateMatrixWorld(true);
      const world = transform(object.matrixWorld);
      const definition = current.document.scenes.find((scene) => scene.id === current.sceneId)?.entities.find((entity) => entity.id === id);
      const parent = definition?.parentId ? frame.entities.find((entity) => entity.entityId === definition.parentId) : undefined;
      pending = parent ? transform(matrix(parent.transform).invert().multiply(matrix(world))) : world;
      const descendants = new Set([id]);
      const definitions = current.document.scenes.find((scene) => scene.id === current.sceneId)?.entities ?? [];
      const children = new Map<string, string[]>();
      for (const entity of definitions) {
        if (entity.parentId) {
          const siblings = children.get(entity.parentId) ?? [];
          siblings.push(entity.id);
          children.set(entity.parentId, siblings);
        }
      }
      const queue = [id];
      for (let cursor = 0; cursor < queue.length; cursor++) {
        for (const child of children.get(queue[cursor]) ?? []) { descendants.add(child); queue.push(child); }
      }
      const original = frame.entities.find((entity) => entity.entityId === id);
      const delta = original ? matrix(world).multiply(matrix(original.transform).invert()) : new Matrix4();
      preview = { ...frame, entities: frame.entities.map((entity) => {
        if (!descendants.has(entity.entityId)) { return entity; }
        const updated = entity.entityId === id ? world : transform(delta.clone().multiply(matrix(entity.transform)));
        return { ...entity, transform: updated, previousTransform: updated };
      }) };
      render();
    };
    const cancelGesture = (): void => {
      pending = null;
      preview = null;
      dragging = false;
      if (dragStartMatrix) {
        dragStartMatrix.decompose(target.position, target.quaternion, target.scale);
        target.updateMatrixWorld(true);
        dragStartMatrix = null;
      }
      endGesture();
      gizmo.dragging = false;
      render();
      orbit.enabled = !flyMode;
      if (fly) { fly.enabled = window.document.hasFocus() && window.document.activeElement === canvas; }
    };
    const draggingChange = (event: { value: unknown }): void => {
      const wasDragging = dragging;
      dragging = event.value === true;
      orbit.enabled = !dragging && !flyMode;
      if (fly) { fly.enabled = !dragging; }
      if (dragging) {
        if (!wasDragging) { target.updateMatrix(); dragStartMatrix = target.matrix.clone(); }
        gestureId ??= currentRef.current.onGestureStart?.();
        return;
      }
      try {
        if (pending && selectedRef.current) {
          currentRef.current.onOps?.([{ op: "update_entity", scene_id: currentRef.current.sceneId,
            entity_id: selectedRef.current, set: { transform3d: pending } }], gestureId);
        }
      } finally { pending = null; preview = null; dragStartMatrix = null; endGesture(); }
    };
    const pointerDown = { x: 0, y: 0 };
    const down = (event: PointerEvent): void => { pointerDown.x = event.clientX; pointerDown.y = event.clientY; };
    const up = (event: PointerEvent): void => {
      if (dragging || gizmo.axis || event.button !== 0 || Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 4) { return; }
      const bounds = canvas.getBoundingClientRect();
      const id = renderer.pick((event.clientX - bounds.left) / bounds.width * 2 - 1, 1 - (event.clientY - bounds.top) / bounds.height * 2);
      if (id) { onSelect?.(id); }
    };
    let request = 0;
    let previous = performance.now();
    const animate = (now: number): void => {
      fly?.update(Math.min((now - previous) / 1000, 0.1));
      previous = now;
      request = requestAnimationFrame(animate);
    };
    const focusFly = (): void => {
      if (!flyMode || fly) { return; }
      fly = new FlyControls(camera, canvas);
      fly.dragToLook = true;
      fly.movementSpeed = 8;
      fly.rollSpeed = 0.3;
      fly.addEventListener("change", orbitChange);
    };
    const blurFly = (): void => { fly?.dispose(); fly = null; };
    canvas.addEventListener("focus", focusFly);
    canvas.addEventListener("blur", blurFly);
    if (window.document.activeElement === canvas) { focusFly(); }
    if (flyMode) { request = requestAnimationFrame(animate); }
    orbit.addEventListener("change", orbitChange);
    gizmo.addEventListener("objectChange", objectChange);
    gizmo.addEventListener("dragging-changed", draggingChange);
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", cancelGesture);
    canvas.addEventListener("lostpointercapture", cancelGesture);
    canvas.addEventListener("blur", cancelGesture);
    window.addEventListener("blur", cancelGesture);
    render();
    return () => {
      cancelGesture();
      cancelAnimationFrame(request);
      blurFly();
      canvas.removeEventListener("focus", focusFly);
      canvas.removeEventListener("blur", blurFly);
      orbit.removeEventListener("change", orbitChange);
      gizmo.removeEventListener("objectChange", objectChange);
      gizmo.removeEventListener("dragging-changed", draggingChange);
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", cancelGesture);
      canvas.removeEventListener("lostpointercapture", cancelGesture);
      canvas.removeEventListener("blur", cancelGesture);
      window.removeEventListener("blur", cancelGesture);
      renderer.getScene().remove(grid, gizmo.getHelper(), target);
      grid.geometry.dispose();
      if (Array.isArray(grid.material)) { grid.material.forEach((material) => material.dispose()); } else { grid.material.dispose(); }
      gizmo.detach();
      gizmo.dispose();
      orbit.dispose();
      renderer.setEditorCamera(null);
      controlsRef.current = null;
    };
  }, [host.backend, host.canvasRef, host.rendererRef, host.playDocument, onSelect, playerOnly, flyMode]);

  useEffect(() => {
    const controls = controlsRef.current;
    const renderer = host.rendererRef.current;
    if (!controls || !renderer) { return; }
    const object = selectedId ? renderer.getEntityObject(selectedId) : null;
    if (syncGameTransformTarget3D(controls.target, object)) { controls.gizmo.attach(controls.target); } else { controls.gizmo.detach(); }
    controls.gizmo.setMode(mode);
    controls.gizmo.setTranslationSnap(snap ? 0.25 : null);
    controls.gizmo.setRotationSnap(snap ? Math.PI / 12 : null);
    controls.gizmo.setScaleSnap(snap ? 0.25 : null);
    if (host.frame) { void renderer.render(host.frame, 1).catch(() => undefined); }
  }, [host.rendererRef, host.backend, host.frame, selectedId, mode, snap]);


  useEffect(() => {
    const renderer = host.rendererRef.current;
    if (!renderer || !host.frame || host.playDocument || !overlays || playerOnly) { return; }
    const helpers = createGameViewportOverlays3D(document, host.frame);
    renderer.getScene().add(helpers);
    void renderer.render(host.frame, 1).catch(() => undefined);
    return () => disposeGameViewportOverlays3D(helpers);
  }, [document, host.frame, host.backend, host.playDocument, host.rendererRef, overlays, playerOnly]);

  useEffect(() => {
    const renderer = host.rendererRef.current;
    if (!renderer || host.playDocument || playerOnly) { return; }
    const helpers = highlightedIds.flatMap((id) => {
      const object = renderer.getEntityObject(id);
      return object ? [new BoxHelper(object, theme.palette.primary.main)] : [];
    });
    if (helpers.length > 0) { renderer.getScene().add(...helpers); }
    if (host.frame) { void renderer.render(host.frame, 1).catch(() => undefined); }
    return () => { for (const helper of helpers) { helper.removeFromParent(); helper.dispose(); } };
  }, [highlightedIds, host.backend, host.frame, host.playDocument, host.rendererRef, playerOnly, theme.palette.primary.main]);

  useEffect(() => {
    const canvas = host.canvasRef.current;
    if (!canvas || !host.playDocument) { return; }
    const lockChange = (): void => { if (window.document.pointerLockElement !== canvas) { host.inputRef.current.release(); } };
    window.document.addEventListener("pointerlockchange", lockChange);
    if (!host.playing && window.document.pointerLockElement === canvas) { window.document.exitPointerLock(); }
    return () => {
      window.document.removeEventListener("pointerlockchange", lockChange);
      if (window.document.pointerLockElement === canvas) { window.document.exitPointerLock(); }
    };
  }, [host.canvasRef, host.inputRef, host.playDocument, host.playing]);

  const frameSelection = (): void => {
    const controls = controlsRef.current;
    const object = selectedId ? host.rendererRef.current?.getEntityObject(selectedId) : null;
    if (!controls || !object) { return; }
    const bounds = new Box3().setFromObject(object);
    const center = bounds.isEmpty() ? object.getWorldPosition(new Vector3()) : bounds.getCenter(new Vector3());
    const distance = Math.max(2, bounds.getSize(new Vector3()).length() * 1.5);
    controls.orbit.target.copy(center);
    controls.camera.position.copy(center).add(new Vector3(distance, distance * 0.6, distance));
    controls.orbit.update();
  };

  const editing = !playerOnly && !host.playDocument;
  const hint = host.playDocument ? "WASD or arrows to move. Space to jump. Click to capture the mouse, Esc to release it."
    : flyMode ? "WASD to fly. R/F to rise and descend. Drag to look." : "Drag to orbit. Shift-drag to pan. Scroll to zoom.";
  return <FlexColumn sx={{ flex: 1, minHeight: 0, minWidth: 0 }}>
    {!playerOnly && <GamePanelHeader title={host.playDocument ? "Game" : "Scene"}
      icon={host.playDocument ? <SportsEsportsOutlinedIcon sx={HEADER_ICON_SX} /> : <GridViewOutlinedIcon sx={HEADER_ICON_SX} />}>
      {editing && <>
        <FlexRow gap={SPACING.micro} align="center" role="group" aria-label="Transform mode">
          {TOOLS.map((tool) => <ToolbarIconButton key={tool.mode} icon={tool.icon} tooltip={tool.label} shortcut={[tool.key]}
            aria-pressed={mode === tool.mode} active={mode === tool.mode} onClick={() => setMode(tool.mode)} />)}
        </FlexRow>
        <Divider orientation="vertical" flexItem sx={{ my: SPACING.sm, mx: SPACING.xs }} />
        <ToolbarIconButton icon={<GridOnIcon fontSize="small" />} tooltip="Snap" aria-pressed={snap} active={snap} onClick={() => setSnap((value) => !value)} />
        <ToolbarIconButton icon={<LayersOutlinedIcon fontSize="small" />} tooltip="Overlays" aria-pressed={overlays} active={overlays} onClick={() => setOverlays((value) => !value)} />
        <ToolbarIconButton icon={<FlightOutlinedIcon fontSize="small" />} tooltip="Fly camera" aria-pressed={flyMode} active={flyMode} onClick={() => setFlyMode((value) => !value)} />
        <ToolbarIconButton icon={<CenterFocusStrongOutlinedIcon fontSize="small" />} tooltip="Frame selection" shortcut={["F"]} onClick={frameSelection} disabled={!selectedId} />
      </>}
    </GamePanelHeader>}
    <Box sx={{ position: "relative", flex: 1, minHeight: 0, minWidth: 0, bgcolor: "common.black" }}>
      <Box component="canvas" ref={host.canvasRef} data-game-undo-scope tabIndex={0} aria-label="3D game viewport"
        onKeyDown={(event) => {
          if (host.playDocument) {
            host.inputRef.current.keyDown(event.code);
            if (["KeyW", "KeyA", "KeyS", "KeyD", "KeyR", "Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) { event.preventDefault(); }
          }
          else if (event.code === "KeyF" && !flyMode) { event.preventDefault(); frameSelection(); }
          else if ((event.ctrlKey || event.metaKey) && event.code === "KeyZ") { event.preventDefault(); }
          else if (!flyMode && !event.ctrlKey && !event.metaKey && !event.altKey) {
            const tool = TOOLS.find((entry) => entry.code === event.code);
            if (tool) { event.preventDefault(); setMode(tool.mode); }
          }
        }}
        onKeyUp={(event) => host.inputRef.current.keyUp(event.code)}
        onBlur={() => host.inputRef.current.release()}
        onPointerDown={(event) => {
          const canvas = host.canvasRef.current;
          canvas?.focus();
          if (!canvas || !host.playDocument || !host.playing) { return; }
          if (window.document.pointerLockElement === canvas) { host.inputRef.current.keyDown(`Mouse${event.button}`); return; }
          void canvas.requestPointerLock()?.catch(() => undefined);
        }}
        onPointerUp={(event) => host.inputRef.current.keyUp(`Mouse${event.button}`)}
        onPointerMove={(event) => {
          if (host.playDocument && (window.document.pointerLockElement === host.canvasRef.current || event.buttons === 2)) {
            host.inputRef.current.look(event.movementX, event.movementY);
          }
        }}
        onContextMenu={(event) => event.preventDefault()}
        sx={{ display: "block", width: "100%", height: "100%", touchAction: "none", outline: "none",
          "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: "-2px" } }} />
      {!playerOnly && <Caption sx={{ position: "absolute", left: SPACING.md, bottom: SPACING.md, px: SPACING.sm, py: SPACING.micro,
        borderRadius: BORDER_RADIUS.sm, bgcolor: "background.paper", opacity: 0.85, pointerEvents: "none" }}>{hint}</Caption>}
    </Box>
    {playerOnly && host.playDocument && <Caption>{hint}</Caption>}
  </FlexColumn>;
}
