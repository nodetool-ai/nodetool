import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useStore } from "zustand";
import { useTheme } from "@mui/material/styles";
import { BoxHelper, Box3, GridHelper, Matrix4, Object3D, OrthographicCamera, PerspectiveCamera, Raycaster, Vector2, Vector3 } from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { FlyControls } from "three/addons/controls/FlyControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { resolveGameInputBindings, type GameDocument3D, type GameRenderFrame3D } from "@nodetool-ai/protocol";
import { attachGameMouseInput } from "@nodetool-ai/game-renderer";
import type { GameDocumentOp3D } from "@nodetool-ai/game-runtime";
import type { GameRenderer3D } from "@nodetool-ai/game-renderer/browser3d";
import CenterFocusStrongOutlinedIcon from "@mui/icons-material/CenterFocusStrongOutlined";
import FlightOutlinedIcon from "@mui/icons-material/FlightOutlined";
import GridOnIcon from "@mui/icons-material/GridOn";
import GridViewOutlinedIcon from "@mui/icons-material/GridViewOutlined";
import LayersOutlinedIcon from "@mui/icons-material/LayersOutlined";
import MyLocationOutlinedIcon from "@mui/icons-material/MyLocationOutlined";
import OpenInFullIcon from "@mui/icons-material/OpenInFull";
import OpenWithIcon from "@mui/icons-material/OpenWith";
import PublicOutlinedIcon from "@mui/icons-material/PublicOutlined";
import SportsEsportsOutlinedIcon from "@mui/icons-material/SportsEsportsOutlined";
import ThreeSixtyIcon from "@mui/icons-material/ThreeSixty";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";
import VerticalAlignBottomOutlinedIcon from "@mui/icons-material/VerticalAlignBottomOutlined";
import { useGameViewportSettings3DStore, GAME_SNAP_LIMITS_3D } from "../../../stores/game/GameViewportSettings3DStore";
import {
  BORDER_RADIUS, Box, Caption, Divider, FlexColumn, FlexRow, FONT_SIZE_SANS, LabeledSwitch, Label, NumericField, Popover, SPACING,
  ToggleGroup, ToggleOption, ToolbarIconButton
} from "../../ui_primitives";
import DockPanelHeader from "../../dock/DockPanelHeader";
import { useGameCommandHandlers, useGameCommandShortcut } from "../shell/useGameCommands";
import {
  gameAxisViewPosition3D, gameGizmoPivot3D, gameGizmoSnaps3D, gameGroundOffset3D, gameGroupTransform3D, gameLocalTransform3D,
  gameSelectionRoots3D, gameSelectionWithDescendants3D, gameSurfaceHit3D, gameTransformFromMatrix3D, gameTransformMatrix3D,
  type GameAxisView3D, type GameGizmoEntry3D, type GameGizmoMode3D, type GameGizmoPivot3D
} from "../../../stores/game/gameGizmo3D";
import { createGameViewportOverlays3D, disposeGameViewportOverlays3D } from "./gameViewportOverlays3D";
import GameOrientationGizmo3D, { createGameCameraOrientation3D } from "./GameOrientationGizmo3D";
import type { GamePlaySession3D } from "../useGamePlaySession3D";

/** What a viewport edit did, for the undo label. `Ground` is Align to ground. */
export type GameViewportAction3D = "Move" | "Rotate" | "Scale" | "Ground";

const TOOLS: readonly { mode: GameGizmoMode3D; label: string; command: "tool.move" | "tool.rotate" | "tool.scale"; icon: ReactNode }[] = [
  { mode: "translate", label: "Move", command: "tool.move", icon: <OpenWithIcon fontSize="small" /> },
  { mode: "rotate", label: "Rotate", command: "tool.rotate", icon: <ThreeSixtyIcon fontSize="small" /> },
  { mode: "scale", label: "Scale", command: "tool.scale", icon: <OpenInFullIcon fontSize="small" /> }
];
const ACTIONS: Readonly<Record<GameGizmoMode3D, GameViewportAction3D>> = { translate: "Move", rotate: "Rotate", scale: "Scale" };
const PIVOT_LABELS: Readonly<Record<GameGizmoPivot3D, string>> = { center: "Selection centre", active: "Active entity", individual: "Individual origins" };
const AXIS_VIEWS: readonly { readonly view: GameAxisView3D; readonly command: string }[] = [
  { view: "front", command: "view.front" }, { view: "back", command: "view.back" }, { view: "right", command: "view.right" },
  { view: "left", command: "view.left" }, { view: "top", command: "view.top" }, { view: "bottom", command: "view.bottom" }
];
const HEADER_ICON_SX = { fontSize: FONT_SIZE_SANS.body, color: "text.secondary" } as const;
const FIELD_OF_VIEW = 60;
const NO_IDS: readonly string[] = [];

interface GameViewport3DProps {
  readonly document: GameDocument3D;
  readonly host: GamePlaySession3D;
  /** Selected entity ids in selection order. The last one is the active entity. */
  readonly selectedIds?: readonly string[];
  readonly highlightedIds?: readonly string[];
  readonly sceneId: string;
  /** `additive` is true for Shift-, Ctrl- or Cmd-click, which toggles the entity in the selection. */
  readonly onSelect?: (id: string, additive: boolean) => void;
  readonly onSelectMany?: (ids: string[]) => void;
  readonly onOps?: (ops: GameDocumentOp3D[], gestureId?: number, action?: GameViewportAction3D) => void;
  readonly onGestureStart?: () => number;
  readonly onGestureEnd?: (gestureId: number) => void;
  readonly playerOnly?: boolean;
}

interface ViewportControls {
  readonly orbit: OrbitControls;
  readonly gizmo: TransformControls;
  readonly camera: PerspectiveCamera | OrthographicCamera;
  readonly target: Object3D;
  /** Half the orthographic view height at zoom 1. */
  readonly orthoHalfHeight: number;
}

/** Everything a gizmo drag needs, captured when the drag starts. */
interface GizmoDrag {
  readonly entries: readonly GameGizmoEntry3D[];
  readonly start: Matrix4;
  /** Each moving entity and the selected root that carries it. */
  readonly owner: ReadonlyMap<string, string>;
  readonly parentWorlds: ReadonlyMap<string, Matrix4 | null>;
  /** Entities outside the drag, which surface snapping lands on. */
  readonly statics: readonly Object3D[];
  /** From the selection's bottom centre to the gizmo, so surface snapping rests the selection on the surface. */
  readonly pivotToBottom: Vector3;
}

function sceneParents(document: GameDocument3D, sceneId: string): Map<string, string | undefined> {
  return new Map((document.scenes.find((scene) => scene.id === sceneId)?.entities ?? []).map((entity) => [entity.id, entity.parentId]));
}

function frameWorlds(frame: GameRenderFrame3D): Map<string, Matrix4> {
  return new Map(frame.entities.map((entity) => [entity.entityId, gameTransformMatrix3D(entity.transform)]));
}

/** Combined world bounds of the rendered entities. An entity without geometry counts as its origin. */
function entityBounds(renderer: GameRenderer3D, ids: Iterable<string>): Box3 | null {
  const bounds = new Box3();
  let found = false;
  for (const id of ids) {
    const object = renderer.getEntityObject(id);
    if (!object) { continue; }
    found = true;
    const box = new Box3().setFromObject(object);
    if (box.isEmpty()) { bounds.expandByPoint(object.getWorldPosition(new Vector3())); } else { bounds.union(box); }
  }
  return found ? bounds : null;
}

function staticObjects(renderer: GameRenderer3D, frame: GameRenderFrame3D, moving: ReadonlySet<string>): Object3D[] {
  return frame.entities.flatMap((entity) => {
    if (moving.has(entity.entityId)) { return []; }
    const object = renderer.getEntityObject(entity.entityId);
    return object ? [object] : [];
  });
}

export default function GameViewport3D({ document, host, selectedIds = NO_IDS, highlightedIds = NO_IDS, sceneId, onSelect, onSelectMany, onOps,
  onGestureStart, onGestureEnd, playerOnly = false }: GameViewport3DProps) {
  const theme = useTheme();
  const settingsStore = useGameViewportSettings3DStore();
  const space = useStore(settingsStore, (state) => state.space);
  const pivot = useStore(settingsStore, (state) => state.pivot);
  const snap = useStore(settingsStore, (state) => state.snap);
  const increments = useStore(settingsStore, (state) => state.increments);
  const surfaceSnap = useStore(settingsStore, (state) => state.surfaceSnap);
  const orbitSelection = useStore(settingsStore, (state) => state.orbitSelection);
  const orthographic = useStore(settingsStore, (state) => state.orthographic);
  const [mode, setMode] = useState<GameGizmoMode3D>("translate");
  const [flyMode, setFlyMode] = useState(false);
  const [overlays, setOverlays] = useState(true);
  const [settingsAnchor, setSettingsAnchor] = useState<HTMLElement | null>(null);
  const orientation = useMemo(() => createGameCameraOrientation3D(), []);
  const cameraPoseRef = useRef({ position: [8, 7, 10], target: [0, 1, 0] });
  const controlsRef = useRef<ViewportControls | null>(null);
  const sceneEntityIds = useMemo(() => new Set(document.scenes.find((scene) => scene.id === sceneId)?.entities.map((entity) => entity.id)),
    [document, sceneId]);
  const sceneSelection = useMemo(() => selectedIds.filter((id) => sceneEntityIds.has(id)), [selectedIds, sceneEntityIds]);
  const activeId = sceneSelection.at(-1);
  const currentRef = useRef({ document, frame: host.frame, onOps, sceneId, onGestureStart, onGestureEnd, onSelect, onSelectMany,
    selectedIds: sceneSelection, mode, space, pivot, surfaceSnap });
  currentRef.current = { document, frame: host.frame, onOps, sceneId, onGestureStart, onGestureEnd, onSelect, onSelectMany,
    selectedIds: sceneSelection, mode, space, pivot, surfaceSnap };

  useEffect(() => {
    const renderer = host.rendererRef.current;
    const canvas = host.canvasRef.current;
    if (!renderer || !canvas || playerOnly || host.playDocument) { return; }
    const pose = cameraPoseRef.current;
    const distance = new Vector3().fromArray(pose.position).distanceTo(new Vector3().fromArray(pose.target));
    const orthoHalfHeight = Math.max(0.5, distance * Math.tan(FIELD_OF_VIEW * Math.PI / 360));
    const camera = orthographic ? new OrthographicCamera(-1, 1, 1, -1, 0.05, 2000)
      : new PerspectiveCamera(FIELD_OF_VIEW, canvas.width / canvas.height, 0.05, 2000);
    camera.position.fromArray(pose.position);
    const orbit = new OrbitControls(camera, canvas);
    orbit.target.fromArray(pose.target);
    orbit.update();
    orientation.set(camera.quaternion);
    renderer.setEditorCamera(camera);
    const grid = new GridHelper(40, 40);
    renderer.getScene().add(grid);
    let fly: FlyControls | null = null;
    if (flyMode) { orbit.enabled = false; }
    const gizmo = new TransformControls(camera, canvas);
    renderer.getScene().add(gizmo.getHelper());
    const target = new Object3D();
    renderer.getScene().add(target);
    controlsRef.current = { orbit, gizmo, camera, target, orthoHalfHeight };
    let gestureId: number | undefined;
    const endGesture = (): void => {
      const id = gestureId;
      gestureId = undefined;
      if (id !== undefined) { currentRef.current.onGestureEnd?.(id); }
    };
    let dragging = false;
    let dragStartMatrix: Matrix4 | null = null;
    let drag: GizmoDrag | null = null;
    let pending: GameDocumentOp3D[] | null = null;
    let preview: GameRenderFrame3D | null = null;
    const pointer = new Vector2();
    const raycaster = new Raycaster();
    const render = (): void => {
      const frame = preview ?? currentRef.current.frame;
      const aspect = canvas.width / canvas.height;
      if (camera instanceof PerspectiveCamera) { camera.aspect = aspect; }
      else {
        camera.top = orthoHalfHeight;
        camera.bottom = -orthoHalfHeight;
        camera.left = -orthoHalfHeight * aspect;
        camera.right = orthoHalfHeight * aspect;
      }
      camera.updateProjectionMatrix();
      if (frame) { void renderer.render(frame, 1).catch(() => undefined); }
    };
    const orbitChange = (): void => {
      cameraPoseRef.current = { position: camera.position.toArray(), target: orbit.target.toArray() };
      orientation.set(camera.quaternion);
      render();
    };
    const beginDrag = (): GizmoDrag | null => {
      const current = currentRef.current;
      if (!current.frame) { return null; }
      const parents = sceneParents(current.document, current.sceneId);
      const worlds = frameWorlds(current.frame);
      const roots = gameSelectionRoots3D(current.selectedIds, parents).filter((id) => worlds.has(id));
      if (roots.length === 0) { return null; }
      const rootSet = new Set(roots);
      const owner = new Map<string, string>();
      for (const id of gameSelectionWithDescendants3D(roots, parents)) {
        const seen = new Set<string>();
        let root: string | undefined = id;
        while (root !== undefined && !rootSet.has(root) && !seen.has(root)) { seen.add(root); root = parents.get(root); }
        if (root !== undefined && rootSet.has(root)) { owner.set(id, root); }
      }
      target.updateMatrix();
      const start = target.matrix.clone();
      const bounds = entityBounds(renderer, owner.keys());
      const bottom = bounds ? new Vector3(bounds.getCenter(new Vector3()).x, bounds.min.y, bounds.getCenter(new Vector3()).z) : target.position.clone();
      return {
        entries: roots.map((id) => ({ id, world: worlds.get(id) ?? new Matrix4() })),
        start,
        owner,
        parentWorlds: new Map(roots.map((id) => {
          const parent = parents.get(id);
          return [id, parent === undefined ? null : worlds.get(parent) ?? null];
        })),
        statics: staticObjects(renderer, current.frame, new Set(owner.keys())),
        pivotToBottom: target.position.clone().sub(bottom)
      };
    };
    const objectChange = (): void => {
      const current = currentRef.current;
      const frame = current.frame;
      if (!dragging || !drag || !frame) { return; }
      if (current.surfaceSnap && current.mode === "translate") {
        raycaster.setFromCamera(pointer, camera);
        const hit = gameSurfaceHit3D(raycaster, drag.statics);
        if (hit) { target.position.copy(hit).add(drag.pivotToBottom); }
      }
      target.updateMatrixWorld(true);
      const worlds = gameGroupTransform3D(drag.entries, drag.start, target.matrixWorld, current.pivot, current.space);
      const parentWorlds = drag.parentWorlds;
      pending = drag.entries.map((entry) => ({ op: "update_entity", scene_id: current.sceneId, entity_id: entry.id,
        set: { transform3d: gameLocalTransform3D(worlds.get(entry.id) ?? entry.world, parentWorlds.get(entry.id) ?? null) } }));
      const changes = new Map(drag.entries.map((entry) => [entry.id, (worlds.get(entry.id) ?? entry.world).clone()
        .multiply(entry.world.clone().invert())]));
      const owner = drag.owner;
      preview = { ...frame, entities: frame.entities.map((entity) => {
        const root = owner.get(entity.entityId);
        const change = root === undefined ? undefined : changes.get(root);
        if (!change) { return entity; }
        const updated = gameTransformFromMatrix3D(change.clone().multiply(gameTransformMatrix3D(entity.transform)));
        return { ...entity, transform: updated, previousTransform: updated };
      }) };
      render();
    };
    const cancelGesture = (): void => {
      pending = null;
      preview = null;
      drag = null;
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
        if (!wasDragging) {
          target.updateMatrix();
          dragStartMatrix = target.matrix.clone();
          drag = beginDrag();
        }
        gestureId ??= currentRef.current.onGestureStart?.();
        return;
      }
      try {
        if (pending && pending.length > 0) { currentRef.current.onOps?.(pending, gestureId, ACTIONS[currentRef.current.mode]); }
      } finally { pending = null; preview = null; drag = null; dragStartMatrix = null; endGesture(); }
    };
    const pointerDown = { x: 0, y: 0 };
    const down = (event: PointerEvent): void => { pointerDown.x = event.clientX; pointerDown.y = event.clientY; };
    const move = (event: PointerEvent): void => {
      const bounds = canvas.getBoundingClientRect();
      if (bounds.width > 0 && bounds.height > 0) {
        pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, 1 - (event.clientY - bounds.top) / bounds.height * 2);
      }
    };
    const up = (event: PointerEvent): void => {
      if (dragging || gizmo.axis || event.button !== 0 || Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 4) { return; }
      const bounds = canvas.getBoundingClientRect();
      const id = renderer.pick((event.clientX - bounds.left) / bounds.width * 2 - 1, 1 - (event.clientY - bounds.top) / bounds.height * 2);
      const additive = event.shiftKey || event.ctrlKey || event.metaKey;
      if (id) { currentRef.current.onSelect?.(id, additive); }
      else if (!additive) { currentRef.current.onSelectMany?.([]); }
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
    canvas.addEventListener("pointermove", move);
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
      canvas.removeEventListener("pointermove", move);
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
  }, [host.backend, host.canvasRef, host.rendererRef, host.playDocument, playerOnly, flyMode, orthographic, orientation]);

  useEffect(() => {
    const controls = controlsRef.current;
    const renderer = host.rendererRef.current;
    if (!controls || !renderer) { return; }
    const worlds = host.frame ? frameWorlds(host.frame) : new Map<string, Matrix4>();
    const entries = gameSelectionRoots3D(sceneSelection, sceneParents(document, sceneId))
      .flatMap((id) => { const world = worlds.get(id); return world ? [{ id, world }] : []; });
    if (entries.length === 0) { controls.gizmo.detach(); }
    else if (!controls.gizmo.dragging) {
      gameGizmoPivot3D(entries, activeId === undefined ? undefined : worlds.get(activeId), pivot).decompose(controls.target.position, controls.target.quaternion, controls.target.scale);
      controls.target.updateMatrixWorld(true);
      controls.gizmo.attach(controls.target);
    }
    controls.gizmo.setMode(mode);
    controls.gizmo.setSpace(space);
    const snaps = gameGizmoSnaps3D(snap, increments);
    controls.gizmo.setTranslationSnap(snaps.translate);
    controls.gizmo.setRotationSnap(snaps.rotate);
    controls.gizmo.setScaleSnap(snaps.scale);
    if (host.frame) { void renderer.render(host.frame, 1).catch(() => undefined); }
  }, [host.rendererRef, host.backend, host.frame, document, sceneId, sceneSelection, activeId, mode, space, pivot, snap, increments, orthographic]);

  useEffect(() => {
    const controls = controlsRef.current;
    const renderer = host.rendererRef.current;
    if (!orbitSelection || !controls || !renderer) { return; }
    const bounds = entityBounds(renderer, sceneSelection);
    if (!bounds) { return; }
    const offset = bounds.getCenter(new Vector3()).sub(controls.orbit.target);
    controls.orbit.target.add(offset);
    controls.camera.position.add(offset);
    controls.orbit.update();
  }, [host.rendererRef, host.backend, sceneSelection, orbitSelection, orthographic]);

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
    // A multi-selection outlines every selected entity, because the one gizmo does not show which entities it moves.
    const outlined = [...highlightedIds.map((id) => ({ id, color: theme.palette.primary.main })),
      ...(sceneSelection.length > 1 ? sceneSelection.map((id) => ({ id, color: theme.palette.primary.light })) : [])];
    const helpers = outlined.flatMap(({ id, color }) => {
      const object = renderer.getEntityObject(id);
      return object ? [new BoxHelper(object, color)] : [];
    });
    if (helpers.length > 0) { renderer.getScene().add(...helpers); }
    if (host.frame) { void renderer.render(host.frame, 1).catch(() => undefined); }
    return () => { for (const helper of helpers) { helper.removeFromParent(); helper.dispose(); } };
  }, [highlightedIds, sceneSelection, host.backend, host.frame, host.playDocument, host.rendererRef, playerOnly, theme.palette.primary.main,
    theme.palette.primary.light]);

  useEffect(() => {
    const canvas = host.canvasRef.current;
    if (!canvas || !host.playDocument || !host.playing) { return; }
    const mouseLook = resolveGameInputBindings(host.playDocument).look.some((binding) => binding.kind === "mouse");
    return attachGameMouseInput(canvas, host.inputRef.current, {
      active: () => host.playing,
      lookEnabled: () => mouseLook
    });
  }, [host.canvasRef, host.inputRef, host.playDocument, host.playing]);

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
    const renderer = host.rendererRef.current;
    const bounds = renderer ? entityBounds(renderer, sceneSelection) : null;
    if (!controls || !bounds) { return; }
    const center = bounds.getCenter(new Vector3());
    const size = bounds.getSize(new Vector3()).length();
    const distance = Math.max(2, size * 1.5);
    controls.orbit.target.copy(center);
    controls.camera.position.copy(center).add(new Vector3(distance, distance * 0.6, distance));
    if (controls.camera instanceof OrthographicCamera) {
      controls.camera.zoom = controls.orthoHalfHeight / Math.max(1, size * 0.75);
      controls.camera.updateProjectionMatrix();
    }
    controls.orbit.update();
  };
  const viewAlong = (view: GameAxisView3D): void => {
    const controls = controlsRef.current;
    if (!controls) { return; }
    const distance = Math.max(1, controls.camera.position.distanceTo(controls.orbit.target));
    controls.camera.position.copy(gameAxisViewPosition3D(view, controls.orbit.target, distance));
    controls.orbit.update();
  };
  const alignToGround = (): void => {
    const renderer = host.rendererRef.current;
    const frame = host.frame;
    if (!renderer || !frame) { return; }
    const parents = sceneParents(document, sceneId);
    const worlds = frameWorlds(frame);
    const roots = gameSelectionRoots3D(sceneSelection, parents);
    const statics = staticObjects(renderer, frame, gameSelectionWithDescendants3D(roots, parents));
    const ops = roots.flatMap((id): GameDocumentOp3D[] => {
      const world = worlds.get(id);
      const bounds = entityBounds(renderer, gameSelectionWithDescendants3D([id], parents));
      if (!world || !bounds) { return []; }
      const offset = gameGroundOffset3D(bounds, statics);
      if (Math.abs(offset) < 1e-6) { return []; }
      const parent = parents.get(id);
      const moved = new Matrix4().makeTranslation(0, offset, 0).multiply(world);
      return [{ op: "update_entity", scene_id: sceneId, entity_id: id,
        set: { transform3d: gameLocalTransform3D(moved, parent === undefined ? null : worlds.get(parent) ?? null) } }];
    });
    if (ops.length > 0) { onOps?.(ops, undefined, "Ground"); }
  };
  const settings = settingsStore.getState();
  const editing = !playerOnly && !host.playDocument;
  // Fly mode reads W, R and F as camera movement, so the editing shortcuts are off while it is on.
  const navigating = editing && !flyMode;
  const hasSelection = sceneSelection.length > 0;
  // Keys that change the selection, the tool or the gizmo frame would change what a drag in progress commits, so they
  // wait until the drag ends.
  const idle = (run: () => void) => (): void => { if (controlsRef.current?.gizmo.dragging !== true) { run(); } };
  useGameCommandHandlers({
    "view.frameSelection": { run: frameSelection, enabled: navigating && hasSelection },
    "view.toggleSnap": { run: idle(() => settings.toggle("snap")), enabled: editing },
    "tool.move": { run: idle(() => setMode("translate")), enabled: navigating },
    "tool.rotate": { run: idle(() => setMode("rotate")), enabled: navigating },
    "tool.scale": { run: idle(() => setMode("scale")), enabled: navigating },
    "tool.toggleSpace": { run: idle(settings.toggleSpace), enabled: navigating },
    "tool.cyclePivot": { run: idle(settings.cyclePivot), enabled: navigating },
    "tool.toggleSurfaceSnap": { run: idle(() => settings.toggle("surfaceSnap")), enabled: editing },
    "edit.selectAll": { run: idle(() => onSelectMany?.([...sceneEntityIds])), enabled: editing && Boolean(onSelectMany) },
    "edit.deselectAll": { run: idle(() => onSelectMany?.([])), enabled: editing && Boolean(onSelectMany) && hasSelection },
    "edit.alignToGround": { run: idle(alignToGround), enabled: editing && hasSelection },
    "view.orbitSelection": { run: () => settings.toggle("orbitSelection"), enabled: editing },
    "view.toggleOrthographic": { run: idle(() => settings.toggle("orthographic")), enabled: editing },
    ...Object.fromEntries(AXIS_VIEWS.map(({ view, command }) => [command, { run: () => viewAlong(view), enabled: navigating }]))
  });
  const toolShortcuts = { "tool.move": useGameCommandShortcut("tool.move"), "tool.rotate": useGameCommandShortcut("tool.rotate"),
    "tool.scale": useGameCommandShortcut("tool.scale") };
  const frameShortcut = useGameCommandShortcut("view.frameSelection");
  const snapShortcut = useGameCommandShortcut("view.toggleSnap");
  const spaceShortcut = useGameCommandShortcut("tool.toggleSpace");
  const groundShortcut = useGameCommandShortcut("edit.alignToGround");
  const projectionShortcut = useGameCommandShortcut("view.toggleOrthographic");

  const mouseLook = host.playDocument && resolveGameInputBindings(host.playDocument).look.some((binding) => binding.kind === "mouse");
  const hint = host.playDocument ? mouseLook
    ? "Use the game's controls. Click for mouse look, Esc to release it."
    : "Use the game's controls. Mouse buttons work without pointer capture."
    : flyMode ? "WASD to fly. R/F to rise and descend. Drag to look."
      : "Drag to orbit. Shift-drag to pan. Scroll to zoom. Shift-click adds to the selection.";
  return <FlexColumn sx={{ flex: 1, minHeight: 0, minWidth: 0 }}>
    {!playerOnly && <DockPanelHeader title="Viewport" label={host.playDocument ? "Game" : "Scene"}
      icon={host.playDocument ? <SportsEsportsOutlinedIcon sx={HEADER_ICON_SX} /> : <GridViewOutlinedIcon sx={HEADER_ICON_SX} />}>
      {editing && <>
        <FlexRow gap={SPACING.micro} align="center" role="group" aria-label="Transform mode">
          {TOOLS.map((tool) => <ToolbarIconButton key={tool.mode} icon={tool.icon} tooltip={tool.label} shortcut={toolShortcuts[tool.command]}
            aria-pressed={mode === tool.mode} active={mode === tool.mode} onClick={() => setMode(tool.mode)} />)}
        </FlexRow>
        <ToolbarIconButton icon={space === "local" ? <MyLocationOutlinedIcon fontSize="small" /> : <PublicOutlinedIcon fontSize="small" />}
          tooltip={space === "local" ? "Local space" : "World space"} ariaLabel="Local space" shortcut={spaceShortcut}
          aria-pressed={space === "local"} active={space === "local"} onClick={settings.toggleSpace} />
        <Divider orientation="vertical" flexItem sx={{ my: SPACING.sm, mx: SPACING.xs }} />
        <ToolbarIconButton icon={<GridOnIcon fontSize="small" />} tooltip="Snap" shortcut={snapShortcut} aria-pressed={snap} active={snap}
          onClick={() => settings.toggle("snap")} />
        <ToolbarIconButton icon={<TuneOutlinedIcon fontSize="small" />} tooltip="Gizmo settings" aria-haspopup="dialog"
          aria-expanded={Boolean(settingsAnchor)} onClick={(event) => setSettingsAnchor(event.currentTarget)} />
        <ToolbarIconButton icon={<VerticalAlignBottomOutlinedIcon fontSize="small" />} tooltip="Align to ground" shortcut={groundShortcut}
          onClick={alignToGround} disabled={!hasSelection} />
        <ToolbarIconButton icon={<LayersOutlinedIcon fontSize="small" />} tooltip="Overlays" aria-pressed={overlays} active={overlays} onClick={() => setOverlays((value) => !value)} />
        <Divider orientation="vertical" flexItem sx={{ my: SPACING.sm, mx: SPACING.xs }} />
        <ToolbarIconButton icon={<FlightOutlinedIcon fontSize="small" />} tooltip="Fly camera" aria-pressed={flyMode} active={flyMode} onClick={() => setFlyMode((value) => !value)} />
        <ToolbarIconButton icon={<CenterFocusStrongOutlinedIcon fontSize="small" />} tooltip="Frame selection" shortcut={frameShortcut} onClick={frameSelection} disabled={!hasSelection} />
        <Popover open={Boolean(settingsAnchor)} anchorEl={settingsAnchor} onClose={() => setSettingsAnchor(null)} placement="bottom-right"
          slotProps={{ paper: { role: "dialog", "aria-label": "Gizmo settings" } }}>
          <FlexColumn gap={SPACING.md} sx={{ p: SPACING.md }}>
            <FlexColumn gap={SPACING.xs}>
              <Label>Pivot</Label>
              <ToggleGroup exclusive size="small" aria-label="Pivot" value={pivot}
                onChange={(_event, value: unknown) => { if (value === "center" || value === "active" || value === "individual") { settings.setPivot(value); } }}>
                {(["center", "active", "individual"] as const).map((value) => <ToggleOption key={value} value={value}>{PIVOT_LABELS[value]}</ToggleOption>)}
              </ToggleGroup>
            </FlexColumn>
            <FlexColumn gap={SPACING.xs}>
              <Label>Snap increments</Label>
              <FlexRow gap={SPACING.sm}>
                <NumericField label="Move (m)" value={increments.translate} step={0.05} min={GAME_SNAP_LIMITS_3D.translate.min}
                  max={GAME_SNAP_LIMITS_3D.translate.max} onCommit={(value) => settings.setIncrement("translate", value)} />
                <NumericField label="Rotate (°)" value={increments.rotate} step={5} min={GAME_SNAP_LIMITS_3D.rotate.min}
                  max={GAME_SNAP_LIMITS_3D.rotate.max} onCommit={(value) => settings.setIncrement("rotate", value)} />
                <NumericField label="Scale" value={increments.scale} step={0.05} min={GAME_SNAP_LIMITS_3D.scale.min}
                  max={GAME_SNAP_LIMITS_3D.scale.max} onCommit={(value) => settings.setIncrement("scale", value)} />
              </FlexRow>
            </FlexColumn>
            <LabeledSwitch label="Surface snap" description="Move drags rest the selection on the surface under the pointer."
              checked={surfaceSnap} onChange={() => settings.toggle("surfaceSnap")} />
            <LabeledSwitch label="Orbit around selection" description="The camera turns around the selection when it changes."
              checked={orbitSelection} onChange={() => settings.toggle("orbitSelection")} />
          </FlexColumn>
        </Popover>
      </>}
    </DockPanelHeader>}
    <Box sx={{ position: "relative", flex: 1, minHeight: 0, minWidth: 0, bgcolor: "common.black" }}>
      <Box component="canvas" ref={host.canvasRef} data-game-undo-scope tabIndex={0} aria-label="3D game viewport"
        onKeyDown={(event) => {
          if (host.playDocument && host.playing) {
            host.inputRef.current.keyDown(event.code, event.key);
            if (host.inputRef.current.handlesKey(host.playDocument, event.code, event.key)) { event.preventDefault(); }
          }
        }}
        onKeyUp={(event) => host.inputRef.current.keyUp(event.code)}
        onBlur={() => host.inputRef.current.release()}
        onPointerDown={() => host.canvasRef.current?.focus()}
        onContextMenu={(event) => event.preventDefault()}
        sx={{ display: "block", width: "100%", height: "100%", touchAction: "none", outline: "none",
          "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: "-2px" } }} />
      {editing && <GameOrientationGizmo3D orientation={orientation} orthographic={orthographic} onView={viewAlong}
        onToggleProjection={() => settings.toggle("orthographic")} projectionShortcut={projectionShortcut} />}
      {!playerOnly && <Caption sx={{ position: "absolute", left: SPACING.md, bottom: SPACING.md, px: SPACING.sm, py: SPACING.micro,
        borderRadius: BORDER_RADIUS.sm, bgcolor: "background.paper", opacity: 0.85, pointerEvents: "none" }}>{hint}</Caption>}
    </Box>
    {playerOnly && host.playDocument && <Caption>{hint}</Caption>}
  </FlexColumn>;
}
