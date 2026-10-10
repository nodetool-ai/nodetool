/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject
} from "react";
import { registerComboCallback, useKeyPressedStore } from "../../stores/KeyPressedStore";
import type { ContextCommand } from "../../stores/CommandMenuStore";
import { useContextCommands } from "../../hooks/useContextCommands";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import {
  OrbitControls,
  Grid,
  TransformControls,
  GizmoHelper,
  GizmoViewport
} from "@react-three/drei";

import OpenWithIcon from "@mui/icons-material/OpenWith";
import ThreeDRotationIcon from "@mui/icons-material/ThreeDRotation";
import AspectRatioIcon from "@mui/icons-material/AspectRatio";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import ViewInArOutlinedIcon from "@mui/icons-material/ViewInArOutlined";
import LightbulbOutlinedIcon from "@mui/icons-material/LightbulbOutlined";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import SaveIcon from "@mui/icons-material/Save";
import PublicIcon from "@mui/icons-material/Public";
import ControlCameraIcon from "@mui/icons-material/ControlCamera";
import StraightenIcon from "@mui/icons-material/Straighten";
import KeyboardIcon from "@mui/icons-material/Keyboard";
import CircleIcon from "@mui/icons-material/Circle";
import FileUploadOutlinedIcon from "@mui/icons-material/FileUploadOutlined";

import {
  AlertBanner,
  Box,
  ConfirmDialog,
  Divider,
  EditorButton,
  EmptyState,
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  MenuItemPrimitive,
  Text,
  ToggleGroup,
  ToggleOption,
  ToolbarIconButton,
  Tooltip,
  UndoRedoButtons,
  CloseButton,
  BORDER_RADIUS,
  SPACING,
  Z_INDEX,
  getSpacingPx
} from "../ui_primitives";
import ReportBugButton from "../support/ReportBugButton";
import { deserializeDragData, DRAG_DATA_MIME } from "../../lib/dragdrop/serialization";
import { resolveStaticMediaUri } from "../../utils/resolveMediaUri";
import SceneOutliner, { type OutlinerAction } from "./SceneOutliner";
import PropertiesPanel from "./PropertiesPanel";
import Model3DChatPanel from "./Model3DChatPanel";
import EditorStatusBar from "./EditorStatusBar";
import AnimationBar from "./AnimationBar";
import ViewportHud from "./ViewportHud";
import { MenuButton } from "./MenuButton";
import { readViewPrefs, writeViewPrefs, type ViewPrefs } from "./viewPrefs";
import { createAnimationPreview } from "./animationPreview";
import { importModelFile, importModelUrl, isModelFileName } from "./importModel";
import ShortcutsDialog from "./ShortcutsDialog";
import ResizableSideDock from "../chat/assistant/ResizableSideDock";
import {
  buildSceneTree,
  clearScene,
  disposeObject,
  isLightTarget,
  replaceSceneContent
} from "./sceneTree";
import {
  createPrimitive,
  PRIMITIVE_LABELS,
  type PrimitiveKind
} from "./objectFactory";
import { exportSceneToGlb } from "./exportGltf";
import {
  bindTracksToUuids,
  cloneObjectDeep,
  computeSceneStats,
  nextAvailableName,
  removeStrayLightChildren,
  restoreEditorSettings,
  restoreHiddenFlags,
  restoreNodeNames,
  stampObjectIds,
  type LoadedGltfNames
} from "./sceneOps";
import { createEditorHistory, type EditorCommand } from "./editorHistory";
import {
  addObjectCommand,
  captureTransform,
  removeObject,
  reparentObject,
  setValueCommand,
  transformCommand,
  transformsEqual,
  type RecordEdit,
  type TransformSnapshot
} from "./editorCommands";
import {
  EDITOR_SHORTCUTS,
  shortcutKeys,
  withShortcut,
  type EditorAction
} from "./editorShortcuts";
import {
  CameraRig,
  CaptureBridge,
  GroundAxes,
  LightGizmos,
  SelectionBounds,
  StudioEnvironment,
  WireframeOverlay,
  captureModelOnly,
  isVisibleInTree,
  type CameraRequest,
  type CameraRequestInput,
  type CaptureHandles,
  type ViewPreset
} from "./ViewportHelpers";
import { useModel3DAgentTools } from "./useModel3DAgentTools";

type GizmoMode = "translate" | "rotate" | "scale";
type GizmoSpace = "world" | "local";

const LEFT_PANEL_WIDTH = 260;
const RIGHT_PANEL_WIDTH = 300;
// The assistant hosts a chat conversation, so it gets more room than the
// scene/properties panels.
const ASSISTANT_PANEL_WIDTH = 320;

/** Snap increments: world units, degrees, and scale factor. */
const SNAP = { translate: 0.25, rotateDeg: 15, scale: 0.1 } as const;

// Remembers whether the assistant panel was left open across editor sessions.
const ASSISTANT_OPEN_KEY = "model3d.assistantOpen";
const readAssistantOpen = (): boolean => {
  try {
    return localStorage.getItem(ASSISTANT_OPEN_KEY) === "true";
  } catch {
    return false;
  }
};

const styles = (theme: Theme) =>
  css({
    "&": {
      width: "100%",
      height: "100%",
      minHeight: 0,
      backgroundColor: theme.vars.palette.grey[900]
    },
    ".editor-toolbar": {
      padding: `${getSpacingPx(SPACING.sm)} ${getSpacingPx(SPACING.lg)}`,
      gap: getSpacingPx(SPACING.sm),
      alignItems: "center",
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: theme.vars.palette.background.paper,
      flexShrink: 0,
      flexWrap: "wrap",
      minHeight: 44
    },
    ".editor-title": {
      maxWidth: "240px",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },
    ".editor-body": {
      flex: 1,
      minHeight: 0
    },
    ".side-panel": {
      flexShrink: 0,
      minHeight: 0,
      backgroundColor: theme.vars.palette.background.paper,
      borderRight: `1px solid ${theme.vars.palette.divider}`
    },
    ".side-panel.left": { width: `${LEFT_PANEL_WIDTH}px` },
    ".side-panel.right": {
      width: `${RIGHT_PANEL_WIDTH}px`,
      borderRight: "none",
      borderLeft: `1px solid ${theme.vars.palette.divider}`
    },
    ".panel-header": {
      padding: `${getSpacingPx(SPACING.sm)} ${getSpacingPx(SPACING.lg)}`,
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      flexShrink: 0,
      minHeight: 36,
      boxSizing: "border-box"
    },
    ".panel-title": {
      textTransform: "uppercase",
      letterSpacing: "0.06em",
      color: theme.vars.palette.text.secondary
    },
    ".panel-body": {
      flex: 1,
      minHeight: 0,
      display: "flex",
      flexDirection: "column"
    },
    ".canvas-wrap": {
      flex: 1,
      minWidth: 0,
      position: "relative",
      overflow: "hidden",
      background: `radial-gradient(ellipse at 50% 35%, ${theme.vars.palette.grey[800]} 0%, ${theme.vars.palette.grey[900]} 75%)`
    },
    ".viewport-hud": {
      position: "absolute",
      top: getSpacingPx(SPACING.md),
      left: getSpacingPx(SPACING.md),
      zIndex: Z_INDEX.raised,
      padding: getSpacingPx(SPACING.micro),
      gap: getSpacingPx(SPACING.micro),
      alignItems: "center",
      borderRadius: BORDER_RADIUS.md,
      border: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: `rgba(${theme.vars.palette.background.defaultChannel} / 0.72)`,
      backdropFilter: "blur(8px)"
    },
    ".viewport-banner": {
      position: "absolute",
      top: getSpacingPx(SPACING.md),
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: Z_INDEX.dropdown,
      maxWidth: "70%"
    },
    ".animation-bar": {
      position: "absolute",
      left: getSpacingPx(SPACING.md),
      // Leave room for the axis widget in the bottom-right corner.
      right: 160,
      bottom: getSpacingPx(SPACING.md),
      zIndex: Z_INDEX.raised,
      padding: `${getSpacingPx(SPACING.micro)} ${getSpacingPx(SPACING.md)}`,
      borderRadius: BORDER_RADIUS.md,
      border: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: `rgba(${theme.vars.palette.background.defaultChannel} / 0.72)`,
      backdropFilter: "blur(8px)"
    },
    ".drop-hint": {
      position: "absolute",
      inset: getSpacingPx(SPACING.md),
      zIndex: Z_INDEX.overlay,
      pointerEvents: "none",
      borderRadius: BORDER_RADIUS.lg,
      border: `2px dashed ${theme.vars.palette.primary.main}`,
      backgroundColor: `rgba(${theme.vars.palette.primary.mainChannel} / 0.08)`
    },
    ".dirty-dot": {
      fontSize: "var(--fontSizeSmaller)",
      color: theme.vars.palette.warning.main
    },
    ".overlay": {
      position: "absolute",
      inset: 0,
      zIndex: Z_INDEX.overlay,
      backgroundColor: theme.vars.palette.c_scrim
    }
  });

interface OrbitControlsLike {
  target: THREE.Vector3;
}

const isOrbitControlsLike = (obj: unknown): obj is OrbitControlsLike =>
  obj !== null &&
  typeof obj === "object" &&
  "target" in obj &&
  (obj as OrbitControlsLike).target instanceof THREE.Vector3;

/**
 * An externally driven camera pose, in orbit terms around a target point.
 * Set by a host that renders the editor as a picture rather than as an
 * editor — the demo harness drives one value per video frame.
 */
export interface Model3DCameraPose {
  /** Horizontal angle in degrees, 0 looking down −Z. */
  azimuthDeg: number;
  /** Vertical angle in degrees above the horizon. */
  elevationDeg: number;
  /** Distance from the target. */
  distance: number;
  /** Point the camera looks at. Defaults to the origin. */
  target?: [number, number, number];
}

/**
 * Places the camera from a {@link Model3DCameraPose} on every render. Mounted
 * only when a pose is supplied, and then in place of `OrbitControls` — the two
 * would fight over the same camera.
 */
const PosedCamera = ({ pose }: { pose: Model3DCameraPose }) => {
  const { camera, invalidate } = useThree();

  useEffect(() => {
    const target = new THREE.Vector3(...(pose.target ?? [0, 0, 0]));
    const azimuth = THREE.MathUtils.degToRad(pose.azimuthDeg);
    const elevation = THREE.MathUtils.degToRad(pose.elevationDeg);
    const horizontal = Math.cos(elevation) * pose.distance;
    camera.position.set(
      target.x + Math.sin(azimuth) * horizontal,
      target.y + Math.sin(elevation) * pose.distance,
      target.z + Math.cos(azimuth) * horizontal
    );
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    invalidate();
  });

  return null;
};

/** Publishes the orbit controls' target so new objects spawn where the user looks. */
const OrbitTargetBridge = ({
  targetRef
}: {
  targetRef: MutableRefObject<THREE.Vector3 | null>;
}) => {
  const { controls } = useThree();
  useEffect(() => {
    targetRef.current = isOrbitControlsLike(controls) ? controls.target : null;
    return () => {
      targetRef.current = null;
    };
  }, [controls, targetRef]);
  return null;
};

const ADD_MENU_GROUPS: { title: string; kinds: PrimitiveKind[] }[] = [
  { title: "Mesh", kinds: ["box", "sphere", "plane", "cylinder", "cone", "torus"] },
  { title: "Light", kinds: ["directionalLight", "pointLight", "spotLight"] },
  { title: "Other", kinds: ["empty"] }
];

interface Model3DEditorProps {
  url: string;
  name?: string;
  onSave: (blob: Blob) => Promise<void> | void;
  onClose: () => void;
  /**
   * Drive the camera from outside instead of from the user's mouse. Replaces
   * `OrbitControls` while set; leave it undefined for an interactive editor.
   */
  cameraPose?: Model3DCameraPose;
  /**
   * Skip the environment map and light the scene with lamps only. Video
   * renders use this to keep the lighting of earlier recordings.
   */
  offlineLighting?: boolean;
  /**
   * Whether this editor is the visible workspace tab. Only the active editor
   * receives the agent's ui_3d_* tool calls. Defaults to true for hosts that
   * mount a single editor.
   */
  active?: boolean;
  /** Told whenever the scene gains or loses unsaved edits. */
  onDirtyChange?: (dirty: boolean) => void;
  /**
   * The file was written from elsewhere while this editor had unsaved
   * edits. The editor warns that a save would replace that change.
   */
  externallyChanged?: boolean;
  /** Reopen the file from storage, discarding the unsaved edits. */
  onReloadExternal?: () => void;
  onDismissExternal?: () => void;
}

const Model3DEditor = ({
  url,
  name,
  onSave,
  onClose,
  cameraPose,
  offlineLighting = false,
  active = true,
  onDirtyChange,
  externallyChanged = false,
  onReloadExternal,
  onDismissExternal
}: Model3DEditorProps) => {
  const theme = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);

  // Persistent group that owns all editable content and is exported on save.
  const rootRef = useRef<THREE.Group>(null);
  if (rootRef.current === null) {
    const group = new THREE.Group();
    group.name = "Scene";
    rootRef.current = group;
  }
  const root = rootRef.current;
  // Clips from the loaded file, written back on save so it keeps them.
  const [animationClips, setAnimationClips] = useState<THREE.AnimationClip[]>([]);
  const preview = useMemo(
    () => createAnimationPreview(root, animationClips),
    [root, animationClips]
  );
  const [previewActive, setPreviewActive] = useState(false);
  // Remounting the animation bar resets its controls after the editor stops
  // the preview itself.
  const [previewEpoch, setPreviewEpoch] = useState(0);
  const stopPreview = useCallback(() => {
    if (preview.isActive()) {
      preview.stop();
      setPreviewActive(false);
      setPreviewEpoch((e) => e + 1);
    }
  }, [preview]);

  const historyRef = useRef<ReturnType<typeof createEditorHistory> | null>(null);
  if (historyRef.current === null) {
    historyRef.current = createEditorHistory();
  }
  const history = historyRef.current;
  const [savedRevision, setSavedRevision] = useState(() => history.revision());

  const [tick, setTick] = useState(0);
  const [selectedUuid, setSelectedUuid] = useState<string | null>(null);
  const [gizmoMode, setGizmoMode] = useState<GizmoMode>("translate");
  const [gizmoSpace, setGizmoSpace] = useState<GizmoSpace>("world");
  const [viewPrefs, setViewPrefs] = useState<ViewPrefs>(readViewPrefs);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [cameraRequest, setCameraRequest] = useState<CameraRequest | null>(null);
  const [showAssistant, setShowAssistant] = useState<boolean>(readAssistantOpen);
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // Holding Ctrl (or Cmd) inverts the snap toggle while dragging, as in Unity.
  const modifierHeld = useKeyPressedStore(
    (state) => state.pressedKeys.has("control") || state.pressedKeys.has("meta")
  );
  const snapActive = viewPrefs.snap !== modifierHeld;

  const toggleAssistant = useCallback(() => {
    setShowAssistant((open) => {
      const next = !open;
      try {
        localStorage.setItem(ASSISTANT_OPEN_KEY, String(next));
      } catch {
        // Persistence is best-effort; ignore storage failures.
      }
      return next;
    });
  }, []);

  const togglePref = useCallback((key: keyof ViewPrefs) => {
    setViewPrefs((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      writeViewPrefs(next);
      return next;
    });
  }, []);

  const bump = useCallback(() => setTick((t) => t + 1), []);
  // A gizmo drag changes only the dragged object's transform. It refreshes
  // the Inspector alone, so the outliner, stats and wireframe are not rebuilt
  // on every pointer move.
  const [dragTick, setDragTick] = useState(0);
  const bumpDrag = useCallback(() => setDragTick((t) => t + 1), []);
  const nonce = useRef(0);
  const requestCamera = useCallback(
    (request: CameraRequestInput) => {
      nonce.current += 1;
      setCameraRequest({ ...request, nonce: nonce.current });
    },
    []
  );

  // --- History ---------------------------------------------------------------

  const pushCommand = useCallback(
    (command: EditorCommand) => {
      history.push(command);
      bump();
    },
    [history, bump]
  );

  // Every edit first ends the animation preview. Stopping it puts back the
  // rest pose it recorded, so a transform set during playback would otherwise
  // be undone by the next stop or save while history still lists it.
  const record: RecordEdit = useCallback(
    (edit) => {
      stopPreview();
      const before = edit.get();
      const same = edit.equals ? edit.equals(before, edit.value) : Object.is(before, edit.value);
      if (same) {
        edit.release?.(edit.value);
        return;
      }
      edit.set(edit.value);
      pushCommand(
        setValueCommand(edit.label, edit.set, before, edit.value, edit.mergeKey, edit.release)
      );
    },
    [pushCommand, stopPreview]
  );

  const undo = useCallback(() => {
    stopPreview();
    if (history.undo()) {
      bump();
    }
  }, [history, bump, stopPreview]);

  const redo = useCallback(() => {
    stopPreview();
    if (history.redo()) {
      bump();
    }
  }, [history, bump, stopPreview]);

  const revision = history.revision();
  const isDirty = revision !== savedRevision;
  void tick;

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);
  // Closing the editor discards its edits, so nothing is unsaved any more.
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  // Mirror of selectedUuid for the tool-bridge handler, which is registered once
  // with stable callbacks and must read the latest selection without re-registering.
  const selectedUuidRef = useRef<string | null>(null);
  useEffect(() => {
    selectedUuidRef.current = selectedUuid;
  }, [selectedUuid]);

  const orbitTargetRef = useRef<THREE.Vector3 | null>(null);

  // Live render handles published by <CaptureBridge> for screenshot capture.
  const captureRef = useRef<CaptureHandles | null>(null);
  const captureView = useCallback((): string => {
    const capture = captureRef.current;
    if (!capture) {
      throw new Error("3D viewport is not ready to capture yet.");
    }
    return captureModelOnly(
      capture,
      root,
      new THREE.Color(theme.palette.grey[900])
    );
  }, [root, theme]);

  // Load the GLB/GLTF into the editor root once per URL.
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);

    const loader = new GLTFLoader();
    loader.load(
      url,
      (gltf) => {
        if (cancelled) {
          disposeObject(gltf.scene);
          return;
        }
        bindTracksToUuids(gltf.animations, gltf.scene);
        if (gltf.parser) {
          restoreNodeNames(gltf as unknown as LoadedGltfNames);
          stampObjectIds(gltf as unknown as LoadedGltfNames);
        }
        removeStrayLightChildren(gltf.scene);
        restoreHiddenFlags(gltf.scene);
        restoreEditorSettings(gltf.scene);
        replaceSceneContent(root, gltf.scene);
        setAnimationClips(gltf.animations);
        setPreviewActive(false);
        history.clear();
        setSavedRevision(history.revision());
        setSelectedUuid(null);
        setIsLoading(false);
        requestCamera({ kind: "frameAll", instant: true });
        bump();
      },
      undefined,
      (error) => {
        if (cancelled) {
          return;
        }
        setIsLoading(false);
        setLoadError(
          error instanceof Error
            ? error.message
            : "Failed to load 3D model. Only .glb/.gltf are supported."
        );
      }
    );

    return () => {
      cancelled = true;
      // Release GPU resources for the current scene on URL change/unmount.
      history.clear();
      clearScene(root);
      setAnimationClips([]);
    };
  }, [url, root, bump, history, requestCamera]);

  const treeNodes = useMemo(() => {
    void tick;
    return buildSceneTree(root);
  }, [root, tick]);

  const stats = useMemo(() => {
    void tick;
    return computeSceneStats(root);
  }, [root, tick]);

  const selectedObject = useMemo(() => {
    void tick;
    if (!selectedUuid) {
      return null;
    }
    return root.getObjectByProperty("uuid", selectedUuid) ?? null;
  }, [root, selectedUuid, tick]);

  const takenNames = useCallback((): Set<string> => {
    const names = new Set<string>();
    root.traverse((child) => names.add(child.name));
    return names;
  }, [root]);

  // --- Scene edits -----------------------------------------------------------

  const addPrimitiveObject = useCallback(
    (kind: PrimitiveKind, name?: string): THREE.Object3D => {
      const obj = createPrimitive(kind);
      obj.name = nextAvailableName(name?.trim() || PRIMITIVE_LABELS[kind], takenNames());
      // New objects appear where the user is looking, resting on the ground.
      const target = orbitTargetRef.current;
      if (target) {
        obj.position.x += target.x;
        obj.position.z += target.z;
      }
      if (obj instanceof THREE.Mesh) {
        obj.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(obj);
        obj.position.y += -box.min.y;
      }
      root.add(obj);
      pushCommand(addObjectCommand(`Add ${PRIMITIVE_LABELS[kind]}`, obj, root));
      setSelectedUuid(obj.uuid);
      return obj;
    },
    [root, takenNames, pushCommand]
  );

  const deleteObject = useCallback(
    (obj: THREE.Object3D) => {
      if (obj === root) {
        return;
      }
      const command = removeObject(`Delete ${obj.name || obj.type}`, obj);
      if (command) {
        pushCommand(command);
      }
      if (selectedUuidRef.current === obj.uuid) {
        setSelectedUuid(null);
      }
    },
    [root, pushCommand]
  );

  const duplicateObject = useCallback(
    (obj: THREE.Object3D): THREE.Object3D | null => {
      const parent = obj.parent;
      if (!parent || obj === root) {
        return null;
      }
      // Copy the rest pose, not the animated frame on screen.
      stopPreview();
      const copy = cloneObjectDeep(obj);
      copy.name = nextAvailableName(obj.name || obj.type, takenNames());
      parent.add(copy);
      // Keep the copy next to its source in the scene list.
      const children = parent.children;
      children.splice(children.indexOf(copy), 1);
      children.splice(children.indexOf(obj) + 1, 0, copy);
      pushCommand(addObjectCommand(`Duplicate ${obj.name || obj.type}`, copy, parent));
      setSelectedUuid(copy.uuid);
      return copy;
    },
    [root, takenNames, pushCommand, stopPreview]
  );

  // --- Import ----------------------------------------------------------------

  const [importError, setImportError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const placeImport = useCallback(
    (group: THREE.Object3D) => {
      group.name = nextAvailableName(group.name, takenNames());
      root.add(group);
      // Centre the model on the point the camera orbits, resting on the ground.
      group.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(group);
      if (!box.isEmpty()) {
        const center = box.getCenter(new THREE.Vector3());
        const target = orbitTargetRef.current ?? new THREE.Vector3();
        group.position.x += target.x - center.x;
        group.position.z += target.z - center.z;
        group.position.y -= box.min.y;
      }
      pushCommand(addObjectCommand(`Import ${group.name}`, group, root));
      setSelectedUuid(group.uuid);
      requestCamera({ kind: "focus", uuid: group.uuid });
    },
    [root, takenNames, pushCommand, requestCamera]
  );

  const runImport = useCallback(
    async (load: () => Promise<THREE.Object3D>) => {
      setIsImporting(true);
      setImportError(null);
      try {
        placeImport(await load());
      } catch (error) {
        setImportError(error instanceof Error ? error.message : "The model could not be read.");
      } finally {
        setIsImporting(false);
      }
    },
    [placeImport]
  );

  const handleImportFiles = useCallback(
    (files: FileList | File[]) => {
      const models = Array.from(files).filter((file) => isModelFileName(file.name));
      if (models.length === 0) {
        setImportError("Only .glb and .gltf files can be added to the scene.");
        return;
      }
      for (const file of models) {
        void runImport(() => importModelFile(file));
      }
    },
    [runImport]
  );

  const acceptsDrop = (e: React.DragEvent): boolean =>
    e.dataTransfer.types.includes("Files") || e.dataTransfer.types.includes(DRAG_DATA_MIME);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (acceptsDrop(e)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      setDropActive(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      setDropActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDropActive(false);
      const dragData = deserializeDragData(e.dataTransfer);
      if (dragData?.type === "asset") {
        const asset = dragData.payload;
        const assetUrl = resolveStaticMediaUri(asset.get_url);
        if (!assetUrl || !isModelFileName(asset.name)) {
          setImportError(`${asset.name} is not a .glb or .gltf model.`);
          return;
        }
        void runImport(() => importModelUrl(assetUrl, asset.name));
        return;
      }
      if (e.dataTransfer.files.length > 0) {
        handleImportFiles(e.dataTransfer.files);
      }
    },
    [runImport, handleImportFiles]
  );

  const setVisible = useCallback(
    (obj: THREE.Object3D, visible: boolean) =>
      record({
        label: visible ? "Show" : "Hide",
        get: () => obj.visible,
        set: (v) => {
          obj.visible = v;
        },
        value: visible
      }),
    [record]
  );

  const renameObject = useCallback(
    (obj: THREE.Object3D, next: string) =>
      record({
        label: "Rename",
        get: () => obj.name,
        set: (v) => {
          obj.name = v;
        },
        value: next
      }),
    [record]
  );

  const reparent = useCallback(
    (uuid: string, parentUuid: string | null) => {
      const obj = root.getObjectByProperty("uuid", uuid);
      const parent = parentUuid ? root.getObjectByProperty("uuid", parentUuid) : root;
      if (!obj || !parent || obj.parent === parent) {
        return;
      }
      stopPreview();
      const command = reparentObject(
        `Parent ${obj.name || obj.type}`,
        obj,
        parent,
        parent.children.length
      );
      if (command) {
        pushCommand(command);
      }
    },
    [root, pushCommand, stopPreview]
  );

  // --- Selection actions -------------------------------------------------------

  const handleDelete = useCallback(() => {
    if (selectedObject) {
      deleteObject(selectedObject);
    }
  }, [selectedObject, deleteObject]);

  const handleDuplicate = useCallback(() => {
    if (selectedObject) {
      duplicateObject(selectedObject);
    }
  }, [selectedObject, duplicateObject]);

  const handleToggleHidden = useCallback(() => {
    if (selectedObject) {
      setVisible(selectedObject, !selectedObject.visible);
    }
  }, [selectedObject, setVisible]);

  const handleUnhideAll = useCallback(() => {
    const hidden: THREE.Object3D[] = [];
    root.traverse((node) => {
      if (node !== root && !node.visible && !isLightTarget(node)) {
        hidden.push(node);
      }
    });
    if (hidden.length === 0) {
      return;
    }
    hidden.forEach((node) => {
      node.visible = true;
    });
    pushCommand({
      label: "Show all",
      undo: () => hidden.forEach((node) => (node.visible = false)),
      redo: () => hidden.forEach((node) => (node.visible = true))
    });
  }, [root, pushCommand]);

  const handleToggleVisible = useCallback(
    (uuid: string) => {
      const obj = root.getObjectByProperty("uuid", uuid);
      if (obj) {
        setVisible(obj, !obj.visible);
      }
    },
    [root, setVisible]
  );

  const handleRename = useCallback(
    (uuid: string, next: string) => {
      const obj = root.getObjectByProperty("uuid", uuid);
      if (obj && next.trim()) {
        renameObject(obj, next.trim());
      }
    },
    [root, renameObject]
  );

  const handleOutlinerAction = useCallback(
    (action: OutlinerAction, uuid: string) => {
      const obj = root.getObjectByProperty("uuid", uuid);
      if (!obj) {
        return;
      }
      switch (action) {
        case "duplicate":
          duplicateObject(obj);
          break;
        case "delete":
          deleteObject(obj);
          break;
        case "focus":
          requestCamera({ kind: "focus", uuid });
          break;
        case "toggleVisible":
          setVisible(obj, !obj.visible);
          break;
        case "unparent":
          reparent(uuid, null);
          break;
        default:
          break;
      }
    },
    [root, duplicateObject, deleteObject, requestCamera, setVisible, reparent]
  );

  const focusSelection = useCallback(() => {
    if (selectedUuidRef.current) {
      requestCamera({ kind: "focus", uuid: selectedUuidRef.current });
    } else {
      requestCamera({ kind: "frameAll" });
    }
  }, [requestCamera]);

  const frameAll = useCallback(() => requestCamera({ kind: "frameAll" }), [requestCamera]);
  const setView = useCallback(
    (view: ViewPreset) => requestCamera({ kind: "view", view }),
    [requestCamera]
  );

  // --- Gizmo -------------------------------------------------------------------

  const dragStart = useRef<{ object: THREE.Object3D; before: TransformSnapshot } | null>(null);
  // Releasing a gizmo drag over empty space fires a "missed" click; ignore it.
  const lastDragEnd = useRef(0);

  const handleGizmoDown = useCallback(() => {
    if (selectedObject) {
      dragStart.current = { object: selectedObject, before: captureTransform(selectedObject) };
      setIsDragging(true);
    }
  }, [selectedObject]);

  const handleGizmoUp = useCallback(() => {
    const start = dragStart.current;
    dragStart.current = null;
    lastDragEnd.current = performance.now();
    setIsDragging(false);
    if (!start) {
      return;
    }
    const after = captureTransform(start.object);
    if (!transformsEqual(start.before, after)) {
      const verb = gizmoMode === "translate" ? "Move" : gizmoMode === "rotate" ? "Rotate" : "Scale";
      pushCommand(
        transformCommand(`${verb} ${start.object.name || start.object.type}`, start.object, start.before, after)
      );
    }
  }, [gizmoMode, pushCommand]);

  const handleSceneClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    // The raycaster hits hidden meshes too. Leave the event to the next hit,
    // so a hidden object is not selected and does not block the one behind it.
    if (!isVisibleInTree(e.object)) {
      return;
    }
    e.stopPropagation();
    // A drag that orbited the camera is not a click. Neither is a press on
    // the gizmo: it is not part of the scene, so the click reaches the
    // object behind the handle.
    if (e.delta > 4 || performance.now() - lastDragEnd.current < 250) {
      return;
    }
    setSelectedUuid(e.object.uuid);
  }, []);

  const handlePointerMissed = useCallback(() => {
    if (performance.now() - lastDragEnd.current < 250) {
      return;
    }
    setSelectedUuid(null);
  }, []);

  // --- Save / close ------------------------------------------------------------

  const savingRef = useRef(false);
  // While the model loads, or after it failed to load, the scene is empty.
  // Saving then would overwrite the file with nothing.
  const canSave = !isLoading && !loadError;
  const handleSave = useCallback(async () => {
    if (savingRef.current || !canSave) {
      return;
    }
    savingRef.current = true;
    setIsSaving(true);
    setSaveError(null);
    const savingRevision = history.revision();
    // Save the rest pose, not the animation frame on screen.
    stopPreview();
    try {
      const blob = await exportSceneToGlb(root, animationClips);
      await onSave(blob);
      setSavedRevision(savingRevision);
    } catch (error) {
      console.error("[Model3DEditor] Failed to export GLB:", error);
      setSaveError(
        error instanceof Error ? error.message : "Failed to export model"
      );
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }, [root, onSave, history, stopPreview, animationClips, canSave]);

  const requestClose = useCallback(() => {
    if (isDirty) {
      setConfirmCloseOpen(true);
    } else {
      onClose();
    }
  }, [isDirty, onClose]);

  // --- Agent tools ---------------------------------------------------------------

  useModel3DAgentTools({
    active,
    root,
    history,
    selectedUuidRef,
    setSelectedUuid,
    pushCommand,
    beforeEdit: stopPreview,
    refresh: bump,
    addPrimitive: addPrimitiveObject,
    deleteObject,
    duplicateObject,
    setVisible,
    renameObject,
    requestCamera,
    captureView
  });

  // --- Shortcuts -------------------------------------------------------------------

  const actions = useMemo<Record<EditorAction, () => void>>(
    () => ({
      undo,
      redo,
      save: () => void handleSave(),
      translate: () => setGizmoMode("translate"),
      rotate: () => setGizmoMode("rotate"),
      scale: () => setGizmoMode("scale"),
      toggleSpace: () => setGizmoSpace((s) => (s === "world" ? "local" : "world")),
      toggleSnap: () => togglePref("snap"),
      duplicate: handleDuplicate,
      delete: handleDelete,
      deselect: () => setSelectedUuid(null),
      focusSelection,
      frameAll,
      hide: handleToggleHidden,
      unhideAll: handleUnhideAll,
      viewFront: () => setView("front"),
      viewBack: () => setView("back"),
      viewRight: () => setView("right"),
      viewLeft: () => setView("left"),
      viewTop: () => setView("top"),
      viewBottom: () => setView("bottom"),
      toggleGrid: () => togglePref("grid"),
      toggleWireframe: () => togglePref("wireframe"),
      showShortcuts: () => setShortcutsOpen(true)
    }),
    [
      undo,
      redo,
      handleSave,
      togglePref,
      handleDuplicate,
      handleDelete,
      focusSelection,
      frameAll,
      handleToggleHidden,
      handleUnhideAll,
      setView
    ]
  );

  // The store's shared gate replaces this handler's own "am I typing?" check.
  // `target` skips these bindings while the editor sits in an inert background
  // workspace tab, so its keys reach the visible tab instead.
  const getContainer = useCallback(() => containerRef.current, []);
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  useEffect(() => {
    const releases = EDITOR_SHORTCUTS.flatMap((shortcut) =>
      shortcut.combos.map((combo) =>
        registerComboCallback(combo, {
          callback: () => actionsRef.current[shortcut.action](),
          // Tool keys must not swallow typing elsewhere; Ctrl combos do.
          preventDefault: combo.includes("+"),
          // Ctrl+S saves from inside an Inspector field too, instead of
          // falling through to the browser's "Save page" dialog.
          allowInInputs: shortcut.action === "save",
          target: getContainer
        })
      )
    );
    return () => releases.forEach((release) => release());
  }, [getContainer]);

  // The same actions, listed in the Cmd+K menu while this tab is on screen.
  const menuCommands = useMemo<ContextCommand[]>(
    () =>
      EDITOR_SHORTCUTS.filter((shortcut) => shortcut.action !== "deselect").map(
        (shortcut) => ({
          id: shortcut.action,
          label: shortcut.label,
          keywords: [shortcut.group],
          shortcut: shortcut.keys.join("+"),
          run: () => actionsRef.current[shortcut.action]()
        })
      ),
    []
  );
  useContextCommands("3D Model", menuCommands, active && !cameraPose);

  // --- Render ------------------------------------------------------------------------

  const statusHint = useMemo(() => {
    if (previewActive) {
      return "Animation preview · the gizmo is hidden · press stop to return to the rest pose and edit";
    }
    if (isDragging) {
      return snapActive
        ? `Snapping to ${gizmoMode === "rotate" ? `${SNAP.rotateDeg}°` : gizmoMode === "scale" ? SNAP.scale : `${SNAP.translate} units`} · release Ctrl to move freely`
        : "Hold Ctrl to snap";
    }
    if (selectedObject) {
      const tool = gizmoMode === "translate" ? "Move" : gizmoMode === "rotate" ? "Rotate" : "Scale";
      return `${tool} (${gizmoSpace}) · drag the gizmo, hold Ctrl to snap · F focus · Ctrl+D duplicate · Del delete`;
    }
    return "Click to select · drag to orbit · right-drag to pan · scroll to zoom · press ? for shortcuts";
  }, [previewActive, isDragging, snapActive, gizmoMode, gizmoSpace, selectedObject]);

  const palette = useMemo(
    () => ({
      accent: theme.palette.primary.main,
      x: theme.palette.error.main,
      y: theme.palette.success.main,
      z: theme.palette.info.main,
      gridCell: theme.palette.grey[800],
      gridSection: theme.palette.grey[600],
      wire: theme.palette.grey[100]
    }),
    [theme]
  );

  const gizmoPalette = useMemo(
    // The light icons are DOM elements, so they can use the theme's CSS
    // variables and follow the active color scheme.
    () => ({
      accent: theme.vars.palette.primary.main,
      surface: theme.vars.palette.background.paper,
      border: theme.vars.palette.divider
    }),
    [theme]
  );

  const selectLight = useCallback((uuid: string) => setSelectedUuid(uuid), []);

  const interactive = !cameraPose;
  const undoLabel = history.undoLabel();
  const redoLabel = history.redoLabel();

  const loadErrorContext = useMemo(
    () => ({
      source: "operation-failure" as const,
      summary: "3D model failed to load in the 3D editor",
      errorText: loadError ?? undefined
    }),
    [loadError]
  );
  const saveErrorContext = useMemo(
    () => ({
      source: "operation-failure" as const,
      summary: "3D model failed to save from the 3D editor",
      errorText: saveError ?? undefined
    }),
    [saveError]
  );

  return (
    <FlexColumn
      ref={containerRef}
      css={styles(theme)}
      className="model-3d-editor"
      fullWidth
      fullHeight
    >
      <FlexRow className="editor-toolbar" fullWidth>
        <FlexRow align="center" gap={SPACING.xs} sx={{ minWidth: 0 }}>
          <Text size="small" weight={600} className="editor-title" title={name}>
            {name || "3D Model"}
          </Text>
          {isDirty && (
            <Tooltip title="Unsaved changes">
              <CircleIcon className="dirty-dot" aria-label="Unsaved changes" />
            </Tooltip>
          )}
        </FlexRow>
        <Divider orientation="vertical" flexItem />
        <UndoRedoButtons
          canUndo={history.canUndo()}
          canRedo={history.canRedo()}
          onUndo={undo}
          onRedo={redo}
          size="small"
          undoTooltip={withShortcut(undoLabel ? `Undo ${undoLabel}` : "Undo", "undo")}
          redoTooltip={withShortcut(redoLabel ? `Redo ${redoLabel}` : "Redo", "redo")}
        />
        <Divider orientation="vertical" flexItem />
        <ToggleGroup
          size="small"
          exclusive
          value={gizmoMode}
          onChange={(_e, value) => value && setGizmoMode(value as GizmoMode)}
        >
          <ToggleOption value="translate" size="small" aria-label="Move tool">
            <Tooltip title={withShortcut("Move", "translate")}>
              <OpenWithIcon fontSize="small" />
            </Tooltip>
          </ToggleOption>
          <ToggleOption value="rotate" size="small" aria-label="Rotate tool">
            <Tooltip title={withShortcut("Rotate", "rotate")}>
              <ThreeDRotationIcon fontSize="small" />
            </Tooltip>
          </ToggleOption>
          <ToggleOption value="scale" size="small" aria-label="Scale tool">
            <Tooltip title={withShortcut("Scale", "scale")}>
              <AspectRatioIcon fontSize="small" />
            </Tooltip>
          </ToggleOption>
        </ToggleGroup>
        <ToolbarIconButton
          icon={gizmoSpace === "world" ? <PublicIcon fontSize="small" /> : <ControlCameraIcon fontSize="small" />}
          tooltip={withShortcut(
            gizmoSpace === "world" ? "World space: gizmo follows the scene axes" : "Local space: gizmo follows the object",
            "toggleSpace"
          )}
          onClick={actions.toggleSpace}
          size="small"
          ariaLabel={`Transform space: ${gizmoSpace}`}
        />
        <ToolbarIconButton
          icon={<StraightenIcon fontSize="small" />}
          tooltip={withShortcut(
            `Snapping ${viewPrefs.snap ? "on" : "off"}: ${SNAP.translate} units, ${SNAP.rotateDeg}°, ${SNAP.scale} scale. Hold Ctrl to invert`,
            "toggleSnap"
          )}
          onClick={actions.toggleSnap}
          active={viewPrefs.snap}
          size="small"
          ariaLabel="Toggle snapping"
        />
        <Divider orientation="vertical" flexItem />
        <MenuButton label="Add" icon={<AddIcon />} tooltip="Add an object at the view center">
          {(close) =>
            ADD_MENU_GROUPS.flatMap((group, groupIndex) =>
              group.kinds.map((kind, index) => (
                <MenuItemPrimitive
                  key={kind}
                  label={PRIMITIVE_LABELS[kind]}
                  dividerBefore={groupIndex > 0 && index === 0}
                  icon={
                    group.title === "Light" ? (
                      <LightbulbOutlinedIcon fontSize="small" />
                    ) : (
                      <ViewInArOutlinedIcon fontSize="small" />
                    )
                  }
                  onClick={() => {
                    addPrimitiveObject(kind);
                    close();
                  }}
                />
              ))
            ).concat(
              <MenuItemPrimitive
                key="import"
                label="Import model…"
                dividerBefore
                icon={<FileUploadOutlinedIcon fontSize="small" />}
                onClick={() => {
                  fileInputRef.current?.click();
                  close();
                }}
              />
            )
          }
        </MenuButton>
        <input
          ref={fileInputRef}
          type="file"
          accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
          multiple
          hidden
          aria-label="Import model file"
          onChange={(e) => {
            if (e.target.files) {
              handleImportFiles(e.target.files);
            }
            e.target.value = "";
          }}
        />
        <ToolbarIconButton
          icon={<ContentCopyIcon fontSize="small" />}
          tooltip="Duplicate"
          shortcut={shortcutKeys("duplicate")}
          onClick={handleDuplicate}
          disabled={!selectedObject}
          size="small"
        />
        <ToolbarIconButton
          icon={<DeleteOutlineIcon fontSize="small" />}
          tooltip="Delete"
          shortcut={shortcutKeys("delete")}
          onClick={handleDelete}
          disabled={!selectedObject}
          size="small"
        />
        <FlexRow sx={{ marginLeft: "auto" }} gap={SPACING.xs} align="center">
          <ToolbarIconButton
            icon={<KeyboardIcon fontSize="small" />}
            tooltip="Keyboard shortcuts"
          shortcut={shortcutKeys("showShortcuts")}
            onClick={actions.showShortcuts}
            size="small"
          />
          <ToolbarIconButton
            icon={<AutoAwesomeIcon fontSize="small" />}
            tooltip={showAssistant ? "Hide assistant" : "Show assistant"}
            onClick={toggleAssistant}
            active={showAssistant}
            size="small"
          />
          <Tooltip title={withShortcut(isDirty ? "Save changes" : "No unsaved changes", "save")}>
            <span>
              <EditorButton
                density="compact"
                variant={isDirty ? "contained" : "outlined"}
                startIcon={<SaveIcon />}
                onClick={() => void handleSave()}
                disabled={isSaving || !canSave}
              >
                {isSaving ? "Saving…" : "Save"}
              </EditorButton>
            </span>
          </Tooltip>
          <CloseButton onClick={requestClose} tooltip="Close editor" />
        </FlexRow>
      </FlexRow>

      <FlexRow className="editor-body" fullWidth>
        <FlexColumn className="side-panel left" fullHeight>
          <FlexRow className="panel-header" align="center" justify="space-between">
            <Text size="smaller" weight={600} className="panel-title">
              Scene
            </Text>
            <Text size="smaller" color="secondary">
              {stats.objects} {stats.objects === 1 ? "object" : "objects"}
            </Text>
          </FlexRow>
          <div className="panel-body">
            <SceneOutliner
              nodes={treeNodes}
              selectedUuid={selectedUuid}
              onSelect={setSelectedUuid}
              onToggleVisible={handleToggleVisible}
              onRename={handleRename}
              onReparent={reparent}
              onAction={handleOutlinerAction}
            />
          </div>
        </FlexColumn>

        <div
          className={dropActive ? "canvas-wrap drop-active" : "canvas-wrap"}
          onDragOver={interactive ? handleDragOver : undefined}
          onDragLeave={interactive ? handleDragLeave : undefined}
          onDrop={interactive ? handleDrop : undefined}
        >
          {interactive && !loadError && (
            <ViewportHud
              className="viewport-hud"
              prefs={viewPrefs}
              canFocus={!!selectedObject}
              onView={setView}
              onFrameAll={frameAll}
              onFocus={focusSelection}
              onTogglePref={togglePref}
            />
          )}
          {importError && (
            <Box className="viewport-banner">
              <AlertBanner severity="warning" compact onClose={() => setImportError(null)}>
                Import failed: {importError}
              </AlertBanner>
            </Box>
          )}
          {dropActive && (
            <FlexColumn className="drop-hint" align="center" justify="center">
              <Text>Drop a .glb or .gltf model to add it to the scene</Text>
            </FlexColumn>
          )}
          {externallyChanged && !saveError && (
            <Box className="viewport-banner">
              <AlertBanner
                severity="warning"
                compact
                action={
                  <FlexRow gap={SPACING.xs}>
                    <EditorButton density="compact" variant="text" onClick={onDismissExternal}>
                      Keep editing
                    </EditorButton>
                    <EditorButton density="compact" variant="outlined" onClick={onReloadExternal}>
                      Reload
                    </EditorButton>
                  </FlexRow>
                }
              >
                This model was changed outside the editor. Reload to see that change and lose your unsaved edits, or save to replace it.
              </AlertBanner>
            </Box>
          )}
          {saveError && (
            <Box className="viewport-banner">
              <AlertBanner
                severity="error"
                compact
                onClose={() => setSaveError(null)}
                action={<ReportBugButton context={saveErrorContext} size="small" />}
              >
                Save failed: {saveError}
              </AlertBanner>
            </Box>
          )}
          {loadError ? (
            <FlexColumn fullWidth fullHeight align="center" justify="center" gap={SPACING.md}>
              <EmptyState
                variant="error"
                title="This model could not be opened"
                description={loadError}
              />
              <ReportBugButton context={loadErrorContext} variant="outlined" />
            </FlexColumn>
          ) : (
            <Canvas
              // Background workspace tabs stay mounted at opacity 0. Rendering
              // them at full frame rate would spend GPU time on nothing.
              frameloop={active ? "always" : "never"}
              camera={{ position: [3, 2, 3], fov: 50 }}
              gl={{ preserveDrawingBuffer: true, alpha: true, antialias: true }}
              onPointerMissed={handlePointerMissed}
            >
              <ambientLight intensity={offlineLighting ? 1.6 : 0.25} />
              <directionalLight position={[5, 8, 5]} intensity={offlineLighting ? 2.4 : 0.8} />
              {offlineLighting ? (
                <directionalLight position={[-6, 3, -4]} intensity={1.1} />
              ) : (
                <StudioEnvironment />
              )}
              {viewPrefs.grid && (
                <>
                  <Grid
                    position={[0, -0.001, 0]}
                    args={[20, 20]}
                    cellSize={0.5}
                    cellThickness={0.6}
                    cellColor={palette.gridCell}
                    sectionSize={2}
                    sectionThickness={1}
                    sectionColor={palette.gridSection}
                    fadeDistance={40}
                    fadeStrength={1.5}
                    infiniteGrid
                  />
                  <GroundAxes xColor={palette.x} zColor={palette.z} />
                </>
              )}
              <primitive object={root} onClick={handleSceneClick} />
              {interactive && (
                <>
                  <SelectionBounds object={selectedObject} color={palette.accent} />
                  {viewPrefs.wireframe && (
                    <WireframeOverlay root={root} tick={tick} color={palette.wire} />
                  )}
                  {viewPrefs.lightIcons && (
                    <LightGizmos
                      root={root}
                      tick={tick}
                      selectedUuid={selectedUuid}
                      palette={gizmoPalette}
                      onSelect={selectLight}
                    />
                  )}
                </>
              )}
              {interactive && selectedObject && !previewActive && (
                <TransformControls
                  object={selectedObject}
                  mode={gizmoMode}
                  space={gizmoSpace}
                  size={0.9}
                  translationSnap={snapActive ? SNAP.translate : null}
                  rotationSnap={snapActive ? THREE.MathUtils.degToRad(SNAP.rotateDeg) : null}
                  scaleSnap={snapActive ? SNAP.scale : null}
                  onMouseDown={handleGizmoDown}
                  onMouseUp={handleGizmoUp}
                  onObjectChange={bumpDrag}
                />
              )}
              {cameraPose ? (
                <PosedCamera pose={cameraPose} />
              ) : (
                <>
                  <OrbitControls makeDefault enableDamping={false} />
                  <OrbitTargetBridge targetRef={orbitTargetRef} />
                  <CameraRig root={root} request={cameraRequest} />
                  <GizmoHelper alignment="bottom-right" margin={[72, 72]}>
                    <GizmoViewport
                      axisColors={[palette.x, palette.y, palette.z]}
                      labelColor={theme.palette.common.black}
                    />
                  </GizmoHelper>
                </>
              )}
              <CaptureBridge targetRef={captureRef} />
            </Canvas>
          )}
          {!loadError && !isLoading && animationClips.length > 0 && (
            <AnimationBar
              key={previewEpoch}
              className="animation-bar"
              preview={preview}
              onActiveChange={setPreviewActive}
            />
          )}
          {(isSaving || isLoading || isImporting) && (
            <FlexColumn className="overlay" align="center" justify="center" gap={SPACING.md}>
              <LoadingSpinner />
              <Text color="primary">
                {isSaving ? "Saving…" : isImporting ? "Importing model…" : "Loading model…"}
              </Text>
            </FlexColumn>
          )}
        </div>

        <FlexColumn className="side-panel right" fullHeight>
          <FlexRow className="panel-header" align="center">
            <Text size="smaller" weight={600} className="panel-title">
              Inspector
            </Text>
          </FlexRow>
          <PropertiesPanel object={selectedObject} tick={tick + dragTick} record={record} />
        </FlexColumn>

        {/* Kept mounted (toggled via display) so the chat connection and
            scroll state survive hiding the panel. */}
        <div style={{ display: showAssistant ? "contents" : "none" }}>
          <ResizableSideDock
            storageKey="model3d_assistant"
            defaultWidth={ASSISTANT_PANEL_WIDTH}
            ariaLabel="Resize 3D assistant"
          >
            <FlexRow className="panel-header" justify="space-between" align="center">
              <FlexRow gap={SPACING.xs} align="center">
                <AutoAwesomeIcon fontSize="small" />
                <Text size="smaller" weight={600} className="panel-title">
                  Assistant
                </Text>
              </FlexRow>
              <CloseButton
                onClick={() => toggleAssistant()}
                tooltip="Hide assistant"
              />
            </FlexRow>
            <div className="panel-body">
              <Model3DChatPanel />
            </div>
          </ResizableSideDock>
        </div>
      </FlexRow>

      <EditorStatusBar
        selection={
          selectedObject
            ? { name: selectedObject.name || selectedObject.type, type: selectedObject.type }
            : null
        }
        hint={statusHint}
        stats={stats}
      />

      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <ConfirmDialog
        open={confirmCloseOpen}
        onClose={() => setConfirmCloseOpen(false)}
        onConfirm={() => {
          setConfirmCloseOpen(false);
          onClose();
        }}
        title="Discard unsaved changes?"
        content="Closing the editor now loses the edits made since the last save."
        confirmText="Discard and close"
        cancelText="Keep editing"
      />
    </FlexColumn>
  );
};

export default memo(Model3DEditor);
