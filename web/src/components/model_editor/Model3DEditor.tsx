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
import { useTranslation } from "react-i18next";
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
import AddIcon from "@mui/icons-material/AddOutlined";
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
import FileUploadOutlinedIcon from "@mui/icons-material/FileUploadOutlined";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import PhotoCameraOutlinedIcon from "@mui/icons-material/PhotoCameraOutlined";
import CameraEnhanceOutlinedIcon from "@mui/icons-material/CameraEnhanceOutlined";
import AutoFixHighOutlinedIcon from "@mui/icons-material/AutoFixHighOutlined";

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
  PanelHeader,
  BORDER_RADIUS,
  SPACING,
  StatusDot,
  Z_INDEX,
  getSpacingPx
} from "../ui_primitives";
import ReportBugButton from "../support/ReportBugButton";
import { deserializeDragData, DRAG_DATA_MIME } from "../../lib/dragdrop/serialization";
import { resolveMediaUri, resolveStaticMediaUri } from "../../utils/resolveMediaUri";
import { TransformWithWorkflowView } from "../assets/TransformWithWorkflowDialog";
import {
  blobToDataUri,
  type TransformApplyAction,
  type TransformSource
} from "../assets/transformWorkflow";
import SceneOutliner, { type OutlinerAction } from "./SceneOutliner";
import PropertiesPanel from "./PropertiesPanel";
import Model3DChatPanel from "./Model3DChatPanel";
import AiRenderPanel, { type ShotCamera, type ViewportCapture } from "./AiRenderPanel";
import ShotFrameOverlay from "./ShotFrameOverlay";
import {
  DEFAULT_SHOT,
  frameRect,
  parseShotSettings,
  type CapturePass,
  type ShotSettings
} from "./aiRender";
import BlenderRenderPanel from "./BlenderRenderPanel";
import { makeViewCamera, type BlenderCameraMode } from "./blenderRender";
import EditorStatusBar from "./EditorStatusBar";
import ViewportContextMenu from "./ViewportContextMenu";
import AnimationBar from "./AnimationBar";
import ViewportHud from "./ViewportHud";
import { MenuButton } from "./MenuButton";
import { readViewPrefs, writeViewPrefs, type ViewPrefs } from "./viewPrefs";
import { createAnimationPreview } from "./animationPreview";
import {
  IMPORT_ACCEPT,
  MODEL_FORMATS_LABEL,
  importModelFile,
  importModelUrl,
  isModelFileName,
  modelNameFromFile
} from "./importModel";
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
  type PrimitiveKind
} from "./objectFactory";
import { exportSceneToGlb, exportSceneToGltf } from "./exportGltf";
import { EXPORT_FORMATS, exportFileName, exportModel, type ExportFormat } from "./exportModel";
import { saveBlobAsFile } from "../../utils/downloadResponse";
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
  FollowSelection,
  GroundAxes,
  LightGizmos,
  SelectionBounds,
  StudioEnvironment,
  ShotLensRig,
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

const AI_RENDER_OPEN_KEY = "model3d.aiRenderOpen";
const readAiRenderOpen = (): boolean => {
  try {
    return localStorage.getItem(AI_RENDER_OPEN_KEY) === "true";
  } catch {
    return false;
  }
};

const AI_RENDER_SHOT_KEY = "model3d.aiRender.shot";
const readShot = (): ShotSettings => {
  try {
    const raw = localStorage.getItem(AI_RENDER_SHOT_KEY);
    return raw ? parseShotSettings(JSON.parse(raw)) : DEFAULT_SHOT;
  } catch {
    return DEFAULT_SHOT;
  }
};

const BLENDER_RENDER_OPEN_KEY = "model3d.blenderRenderOpen";
const readBlenderRenderOpen = (): boolean => {
  try {
    return localStorage.getItem(BLENDER_RENDER_OPEN_KEY) === "true";
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
      // Position only: FloatingToolbar draws the surface.
      zIndex: Z_INDEX.raised
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
  const { t, i18n } = useTranslation();
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
  const [showAiRender, setShowAiRender] = useState<boolean>(readAiRenderOpen);
  const [shot, setShot] = useState<ShotSettings>(readShot);
  const [showBlenderRender, setShowBlenderRender] = useState<boolean>(readBlenderRenderOpen);
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

  const toggleAiRender = useCallback(() => {
    setShowAiRender((open) => {
      const next = !open;
      try {
        localStorage.setItem(AI_RENDER_OPEN_KEY, String(next));
      } catch {
        // Persistence is best-effort; ignore storage failures.
      }
      return next;
    });
  }, []);

  const shotLabel = [
    shot.aspect === "viewport" ? t("i18n-cont-model-editor-11.aiRender.shot.aspectViewport") : shot.aspect,
    shot.lens === "free"
      ? t("i18n-cont-model-editor-11.aiRender.shot.lensFree")
      : t("i18n-cont-model-editor-11.aiRender.shot.lensMm", { mm: shot.lens })
  ].join(" · ");

  const changeShot = useCallback((next: ShotSettings) => {
    setShot(next);
    try {
      localStorage.setItem(AI_RENDER_SHOT_KEY, JSON.stringify(next));
    } catch {
      // Persistence is best-effort; ignore storage failures.
    }
  }, []);

  const toggleBlenderRender = useCallback(() => {
    setShowBlenderRender((open) => {
      const next = !open;
      try {
        localStorage.setItem(BLENDER_RENDER_OPEN_KEY, String(next));
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
  const captureView = useCallback(
    (pass: CapturePass = "shaded"): string => {
      const capture = captureRef.current;
      if (!capture) {
        throw new Error(t("i18n-cont-model-editor-11.modelEditor.errors.captureNotReady"));
      }
      return captureModelOnly(
        capture,
        root,
        new THREE.Color(theme.palette.grey[900]),
        pass
      );
    },
    [root, theme, t]
  );
  const captureForAi = useCallback(
    (pass: CapturePass): ViewportCapture => {
      const capture = captureRef.current;
      if (!capture) {
        throw new Error(t("i18n-cont-model-editor-11.modelEditor.errors.captureNotReady"));
      }
      const canvas = capture.gl.domElement;
      const crop = frameRect(canvas.width, canvas.height, shot.aspect);
      const image = captureModelOnly(
        capture,
        root,
        new THREE.Color(theme.palette.grey[900]),
        pass,
        crop
      );
      return { image, width: crop.width, height: crop.height };
    },
    [root, theme, t, shot.aspect]
  );
  const viewAspect = useCallback((): number => {
    const canvas = captureRef.current?.gl.domElement;
    return canvas && canvas.height > 0 ? canvas.width / canvas.height : 1;
  }, []);
  // The scene as Blender renders it: hidden objects left out, and for the
  // `view` camera a copy of the viewport camera written as the first camera.
  const exportForBlender = useCallback(
    (camera: BlenderCameraMode, aspect: number): Promise<Blob> => {
      const leadingNodes: THREE.Object3D[] = [];
      if (camera === "view") {
        const capture = captureRef.current;
        if (!capture) {
          return Promise.reject(new Error(t("i18n-cont-model-editor-11.modelEditor.errors.captureNotReady")));
        }
        leadingNodes.push(makeViewCamera(capture.camera, root, aspect));
      }
      return exportSceneToGltf(root, animationClips, { onlyVisible: true, leadingNodes });
    },
    [root, animationClips, t]
  );

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
            : t("i18n-cont-model-editor-11.modelEditor.errors.loadUnsupported")
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
  }, [url, root, bump, history, requestCamera, t]);

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
      obj.name = nextAvailableName(name?.trim() || t(`i18n-cont-model-editor-11.modelEditor.primitives.${kind}`), takenNames());
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
      pushCommand(addObjectCommand(t("i18n-cont-model-editor-11.modelEditor.history.add", { name: t(`i18n-cont-model-editor-11.modelEditor.primitives.${kind}`) }), obj, root));
      setSelectedUuid(obj.uuid);
      return obj;
    },
    [root, takenNames, pushCommand, t]
  );

  const deleteObject = useCallback(
    (obj: THREE.Object3D) => {
      if (obj === root) {
        return;
      }
      const command = removeObject(t("i18n-cont-model-editor-11.modelEditor.history.delete", { name: obj.name || obj.type }), obj);
      if (command) {
        pushCommand(command);
      }
      if (selectedUuidRef.current === obj.uuid) {
        setSelectedUuid(null);
      }
    },
    [root, pushCommand, t]
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
      pushCommand(addObjectCommand(t("i18n-cont-model-editor-11.modelEditor.history.duplicate", { name: obj.name || obj.type }), copy, parent));
      setSelectedUuid(copy.uuid);
      return copy;
    },
    [root, takenNames, pushCommand, stopPreview, t]
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
      pushCommand(addObjectCommand(t("i18n-cont-model-editor-11.modelEditor.history.import", { name: group.name }), group, root));
      setSelectedUuid(group.uuid);
      requestCamera({ kind: "focus", uuid: group.uuid });
    },
    [root, takenNames, pushCommand, requestCamera, t]
  );

  // Several files import one after another under one overlay, which stays
  // until the last one is placed.
  const runImport = useCallback(
    async (loads: (() => Promise<THREE.Object3D>)[]) => {
      setIsImporting(true);
      setImportError(null);
      const errors: string[] = [];
      for (const load of loads) {
        try {
          placeImport(await load());
        } catch (error) {
          errors.push(error instanceof Error ? error.message : t("i18n-cont-model-editor-11.modelEditor.errors.readModel"));
        }
      }
      setImportError(errors.length > 0 ? errors.join(" ") : null);
      setIsImporting(false);
    },
    [placeImport, t]
  );

  // Files picked with a model that are not models themselves (an .mtl, a
  // .bin, textures) are handed to every model so its references resolve.
  const handleImportFiles = useCallback(
    (files: FileList | File[]) => {
      const all = Array.from(files);
      const models = all.filter((file) => isModelFileName(file.name));
      const companions = all.filter((file) => !isModelFileName(file.name));
      if (models.length === 0) {
        setImportError(t("i18n-cont-model-editor-11.modelEditor.errors.chooseModelFile", { formats: MODEL_FORMATS_LABEL }));
        return;
      }
      void runImport(models.map((file) => () => importModelFile(file, companions)));
    },
    [runImport, t]
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
          setImportError(t("i18n-cont-model-editor-11.modelEditor.errors.notModelFile", { name: asset.name, formats: MODEL_FORMATS_LABEL }));
          return;
        }
        void runImport([() => importModelUrl(assetUrl, asset.name)]);
        return;
      }
      if (dragData?.type === "example-model") {
        const model = dragData.payload;
        const modelUrl = resolveStaticMediaUri(model.uri);
        if (modelUrl) {
          void runImport([() => importModelUrl(modelUrl, model.file)]);
        }
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
        label: t(visible ? "i18n-cont-model-editor-11.modelEditor.actions.show" : "i18n-cont-model-editor-11.modelEditor.actions.hide"),
        get: () => obj.visible,
        set: (v) => {
          obj.visible = v;
        },
        value: visible
      }),
    [record, t]
  );

  const renameObject = useCallback(
    (obj: THREE.Object3D, next: string) =>
      record({
        label: t("i18n-cont-model-editor-11.modelEditor.actions.rename"),
        get: () => obj.name,
        set: (v) => {
          obj.name = v;
        },
        value: next
      }),
    [record, t]
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
        t("i18n-cont-model-editor-11.modelEditor.history.parent", { name: obj.name || obj.type }),
        obj,
        parent,
        parent.children.length
      );
      if (command) {
        pushCommand(command);
      }
    },
    [root, pushCommand, stopPreview, t]
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
      label: t("i18n-cont-model-editor-11.modelEditor.actions.showAll"),
      undo: () => hidden.forEach((node) => (node.visible = false)),
      redo: () => hidden.forEach((node) => (node.visible = true))
    });
  }, [root, pushCommand, t]);

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
  const followSelection = useCallback(
    (uuid: string) => requestCamera({ kind: "follow", uuid }),
    [requestCamera]
  );
  const setView = useCallback(
    (view: ViewPreset) => requestCamera({ kind: "view", view }),
    [requestCamera]
  );
  const shotCamera = useMemo<ShotCamera>(
    () => ({
      view: setView,
      frameAll,
      current: () => {
        const camera = captureRef.current?.camera;
        const target = orbitTargetRef.current;
        if (!camera || !target) {
          return null;
        }
        const { position } = camera;
        return {
          position: [position.x, position.y, position.z],
          target: [target.x, target.y, target.z]
        };
      },
      restore: (pose) => requestCamera({ kind: "pose", ...pose })
    }),
    [setView, frameAll, requestCamera]
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
      const verb = t(`i18n-cont-model-editor-11.modelEditor.tools.${gizmoMode}`);
      pushCommand(
        transformCommand(t("i18n-cont-model-editor-11.modelEditor.history.transform", { verb, name: start.object.name || start.object.type }), start.object, start.before, after)
      );
    }
  }, [gizmoMode, pushCommand, t]);

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

  // A right-click on an object opens the viewport menu. A right-drag pans the
  // camera, so the menu opens on release, and only when the pointer stayed put.
  const rightPress = useRef<{ uuid: string; x: number; y: number } | null>(null);
  const [viewportMenu, setViewportMenu] = useState<{ x: number; y: number } | null>(null);
  const closeViewportMenu = useCallback(() => setViewportMenu(null), []);

  const handleScenePointerDown = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (e.nativeEvent.button !== 2 || !isVisibleInTree(e.object)) {
      return;
    }
    e.stopPropagation();
    rightPress.current = { uuid: e.object.uuid, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY };
  }, []);

  const handleScenePointerUp = useCallback((e: ThreeEvent<PointerEvent>) => {
    const press = rightPress.current;
    if (e.nativeEvent.button !== 2 || !press || !isVisibleInTree(e.object)) {
      return;
    }
    e.stopPropagation();
    rightPress.current = null;
    const { clientX: x, clientY: y } = e.nativeEvent;
    if (press.uuid !== e.object.uuid || Math.hypot(x - press.x, y - press.y) > 4) {
      return;
    }
    setSelectedUuid(press.uuid);
    setViewportMenu({ x, y });
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
        error instanceof Error ? error.message : t("i18n-cont-model-editor-11.modelEditor.errors.exportModel")
      );
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }, [root, onSave, history, stopPreview, animationClips, canSave, t]);

  // --- Export ------------------------------------------------------------------

  const [exportError, setExportError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const handleExport = useCallback(
    async (format: ExportFormat, onlySelection: boolean) => {
      const selection = onlySelection ? selectedObject : null;
      if ((onlySelection && !selection) || !canSave) {
        return;
      }
      setIsExporting(true);
      setExportError(null);
      // Export the rest pose, not the animation frame on screen.
      stopPreview();
      try {
        const blob = await exportModel(root, format, { selection, animations: animationClips });
        saveBlobAsFile(
          blob,
          exportFileName(selection?.name || modelNameFromFile(name ?? ""), format)
        );
      } catch (error) {
        console.error("[Model3DEditor] Export failed:", error);
        setExportError(error instanceof Error ? error.message : t("i18n-cont-model-editor-11.modelEditor.errors.exportModel"));
      } finally {
        setIsExporting(false);
      }
    },
    [root, name, animationClips, stopPreview, canSave, selectedObject, t]
  );
  // --- Transform with workflow ---------------------------------------------
  // The scene as it is on screen, unsaved edits included, goes to the
  // workflow; a 3D model it returns is added to the scene.

  const [transformSource, setTransformSource] = useState<TransformSource | null>(null);
  const handleTransform = useCallback(async () => {
    if (!canSave) {
      return;
    }
    setIsExporting(true);
    setExportError(null);
    stopPreview();
    try {
      const blob = await exportSceneToGlb(root, animationClips);
      setTransformSource({
        kind: "model3d",
        name: name || t("transformWithWorkflow.sceneName"),
        uri: await blobToDataUri(blob)
      });
    } catch (error) {
      console.error("[Model3DEditor] Export for transform failed:", error);
      setExportError(error instanceof Error ? error.message : t("i18n-cont-model-editor-11.modelEditor.errors.exportModel"));
    } finally {
      setIsExporting(false);
    }
  }, [root, name, animationClips, stopPreview, canSave, t]);
  const transformApply = useMemo<TransformApplyAction>(
    () => ({
      label: t("transformWithWorkflow.apply.addToScene"),
      kinds: ["model3d"],
      onApply: async (result) => {
        const url = await resolveMediaUri(result.uri);
        if (!url) {
          throw new Error(t("i18n-cont-model-editor-11.modelEditor.errors.readModel"));
        }
        const fileName = isModelFileName(result.name) ? result.name : `${result.name}.glb`;
        void runImport([() => importModelUrl(url, fileName)]);
      }
    }),
    [runImport, t]
  );

  const exportErrorContext = useMemo(
    () => ({
      source: "operation-failure" as const,
      summary: t("i18n-cont-model-editor-11.modelEditor.errors.exportContext"),
      errorText: exportError ?? undefined
    }),
    [exportError, t]
  );

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
  const exportRef = useRef(handleExport);
  exportRef.current = handleExport;
  const menuCommands = useMemo<ContextCommand[]>(
    () => [
      ...EDITOR_SHORTCUTS.filter((shortcut) => shortcut.action !== "deselect").map(
        (shortcut) => ({
          id: shortcut.action,
          label: shortcut.label,
          keywords: [shortcut.group],
          shortcut: shortcut.keys.join("+"),
          run: () => actionsRef.current[shortcut.action]()
        })
      ),
      ...EXPORT_FORMATS.map((info) => ({
        id: `export-${info.format}`,
        label: t("i18n-cont-model-editor-11.modelEditor.actions.exportSceneAs", { format: info.label }),
        keywords: ["download", info.format],
        run: () => void exportRef.current(info.format, false)
      }))
    ],
    [t]
  );
  useContextCommands(t("i18n-cont-model-editor-11.modelEditor.title"), menuCommands, active && !cameraPose);

  // --- Render ------------------------------------------------------------------------

  const statusHint = useMemo(() => {
    if (previewActive) {
      return t("i18n-cont-model-editor-11.modelEditor.hints.animationPreview");
    }
    if (isDragging) {
      return snapActive
        ? t("i18n-cont-model-editor-11.modelEditor.hints.snapping", { amount: gizmoMode === "rotate" ? `${SNAP.rotateDeg}°` : gizmoMode === "scale" ? SNAP.scale : `${SNAP.translate} units` })
        : t("i18n-cont-model-editor-11.modelEditor.hints.holdCtrlToSnap");
    }
    if (selectedObject) {
      const tool = t(`i18n-cont-model-editor-11.modelEditor.tools.${gizmoMode}`);
      return t("i18n-cont-model-editor-11.modelEditor.hints.selected", { tool, space: t(`i18n-cont-model-editor-11.modelEditor.space.${gizmoSpace}`) });
    }
    return t("i18n-cont-model-editor-11.modelEditor.hints.navigation");
  }, [previewActive, isDragging, snapActive, gizmoMode, gizmoSpace, selectedObject, t]);

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
      summary: t("i18n-cont-model-editor-11.modelEditor.errors.loadContext"),
      errorText: loadError ?? undefined
    }),
    [loadError, t]
  );
  const saveErrorContext = useMemo(
    () => ({
      source: "operation-failure" as const,
      summary: t("i18n-cont-model-editor-11.modelEditor.errors.saveContext"),
      errorText: saveError ?? undefined
    }),
    [saveError, t]
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
            {name || t("i18n-cont-model-editor-11.modelEditor.title")}
          </Text>
          {isDirty && (
            <Tooltip title={t("i18n-cont-model-editor-11.modelEditor.unsavedChanges")}>
              <StatusDot tone="warning" label={t("i18n-cont-model-editor-11.modelEditor.unsavedChanges")} />
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
          undoTooltip={withShortcut(undoLabel ? t("i18n-cont-model-editor-11.modelEditor.actions.undoNamed", { label: undoLabel }) : t("i18n-cont-model-editor-11.modelEditor.actions.undo"), "undo")}
          redoTooltip={withShortcut(redoLabel ? t("i18n-cont-model-editor-11.modelEditor.actions.redoNamed", { label: redoLabel }) : t("i18n-cont-model-editor-11.modelEditor.actions.redo"), "redo")}
        />
        <Divider orientation="vertical" flexItem />
        <ToggleGroup
          size="small"
          exclusive
          value={gizmoMode}
          onChange={(_e, value) => value && setGizmoMode(value as GizmoMode)}
        >
          <ToggleOption value="translate" size="small" aria-label={t("i18n-cont-model-editor-11.modelEditor.tools.move")}>
            <Tooltip title={withShortcut(t("i18n-cont-model-editor-11.modelEditor.tools.move"), "translate")}>
              <OpenWithIcon fontSize="small" />
            </Tooltip>
          </ToggleOption>
          <ToggleOption value="rotate" size="small" aria-label={t("i18n-cont-model-editor-11.modelEditor.tools.rotate")}>
            <Tooltip title={withShortcut(t("i18n-cont-model-editor-11.modelEditor.tools.rotate"), "rotate")}>
              <ThreeDRotationIcon fontSize="small" />
            </Tooltip>
          </ToggleOption>
          <ToggleOption value="scale" size="small" aria-label={t("i18n-cont-model-editor-11.modelEditor.tools.scale")}>
            <Tooltip title={withShortcut(t("i18n-cont-model-editor-11.modelEditor.tools.scale"), "scale")}>
              <AspectRatioIcon fontSize="small" />
            </Tooltip>
          </ToggleOption>
        </ToggleGroup>
        <ToolbarIconButton
          icon={gizmoSpace === "world" ? <PublicIcon fontSize="small" /> : <ControlCameraIcon fontSize="small" />}
          tooltip={withShortcut(
            t(gizmoSpace === "world" ? "i18n-cont-model-editor-11.modelEditor.space.worldTooltip" : "i18n-cont-model-editor-11.modelEditor.space.localTooltip"),
            "toggleSpace"
          )}
          onClick={actions.toggleSpace}
          size="small"
          ariaLabel={t("i18n-cont-model-editor-11.modelEditor.space.ariaLabel", { space: t(`i18n-cont-model-editor-11.modelEditor.space.${gizmoSpace}`) })}
        />
        <ToolbarIconButton
          icon={<StraightenIcon fontSize="small" />}
          tooltip={withShortcut(
            t("i18n-cont-model-editor-11.modelEditor.snap.tooltip", { state: t(viewPrefs.snap ? "i18n-cont-model-editor-11.modelEditor.snap.on" : "i18n-cont-model-editor-11.modelEditor.snap.off"), translate: SNAP.translate, rotate: SNAP.rotateDeg, scale: SNAP.scale }),
            "toggleSnap"
          )}
          onClick={actions.toggleSnap}
          active={viewPrefs.snap}
          size="small"
          ariaLabel={t("i18n-cont-model-editor-11.modelEditor.snap.toggle")}
        />
        <Divider orientation="vertical" flexItem />
        <MenuButton label={t("i18n-cont-model-editor-11.modelEditor.actions.add")} icon={<AddIcon />} tooltip={t("i18n-cont-model-editor-11.modelEditor.actions.addTooltip")}>
          {(close) =>
            ADD_MENU_GROUPS.flatMap((group, groupIndex) =>
              group.kinds.map((kind, index) => (
                <MenuItemPrimitive
                  key={kind}
                  label={t(`i18n-cont-model-editor-11.modelEditor.primitives.${kind}`)}
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
                label={t("i18n-cont-model-editor-11.modelEditor.actions.importModel")}
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
          accept={IMPORT_ACCEPT}
          multiple
          hidden
          aria-label={t("i18n-cont-model-editor-11.modelEditor.actions.importModelFile")}
          onChange={(e) => {
            if (e.target.files) {
              handleImportFiles(e.target.files);
            }
            e.target.value = "";
          }}
        />
        <ToolbarIconButton
          icon={<ContentCopyIcon fontSize="small" />}
          tooltip={t("i18n-cont-model-editor-11.modelEditor.actions.duplicate")}
          shortcut={shortcutKeys("duplicate")}
          onClick={handleDuplicate}
          disabled={!selectedObject}
          size="small"
        />
        <ToolbarIconButton
          icon={<DeleteOutlineIcon fontSize="small" />}
          tooltip={t("i18n-cont-model-editor-11.modelEditor.actions.delete")}
          shortcut={shortcutKeys("delete")}
          onClick={handleDelete}
          disabled={!selectedObject}
          size="small"
        />
        <FlexRow sx={{ marginLeft: "auto" }} gap={SPACING.xs} align="center">
          <ToolbarIconButton
            icon={<KeyboardIcon fontSize="small" />}
            tooltip={t("i18n-cont-model-editor-11.modelEditor.actions.shortcuts")}
          shortcut={shortcutKeys("showShortcuts")}
            onClick={actions.showShortcuts}
            size="small"
          />
          <ToolbarIconButton
            icon={<PhotoCameraOutlinedIcon fontSize="small" />}
            tooltip={t(showAiRender ? "i18n-cont-model-editor-11.modelEditor.actions.hideAiRender" : "i18n-cont-model-editor-11.modelEditor.actions.renderAi")}
            onClick={toggleAiRender}
            active={showAiRender}
            size="small"
            ariaLabel={t("i18n-cont-model-editor-11.modelEditor.actions.renderAi")}
          />
          <ToolbarIconButton
            icon={<CameraEnhanceOutlinedIcon fontSize="small" />}
            tooltip={t(showBlenderRender ? "i18n-cont-model-editor-11.modelEditor.actions.hideBlenderRender" : "i18n-cont-model-editor-11.modelEditor.actions.renderBlender")}
            onClick={toggleBlenderRender}
            active={showBlenderRender}
            size="small"
            ariaLabel={t("i18n-cont-model-editor-11.modelEditor.actions.renderBlender")}
          />
          <ToolbarIconButton
            icon={<AutoAwesomeIcon fontSize="small" />}
            tooltip={t(showAssistant ? "i18n-cont-model-editor-11.modelEditor.actions.hideAssistant" : "i18n-cont-model-editor-11.modelEditor.actions.showAssistant")}
            onClick={toggleAssistant}
            active={showAssistant}
            size="small"
          />
          <ToolbarIconButton
            icon={<AutoFixHighOutlinedIcon fontSize="small" />}
            tooltip={t("transformWithWorkflow.open")}
            onClick={() => void handleTransform()}
            disabled={isExporting || !canSave}
            size="small"
            ariaLabel={t("transformWithWorkflow.open")}
          />
          <MenuButton
            label={t("i18n-cont-model-editor-11.modelEditor.actions.export")}
            icon={<FileDownloadOutlinedIcon />}
            tooltip={t("i18n-cont-model-editor-11.modelEditor.actions.exportTooltip")}
          >
            {(close) =>
              [false, true].flatMap((onlySelection) =>
                EXPORT_FORMATS.map((info, index) => (
                  <MenuItemPrimitive
                    key={`${onlySelection ? "selection" : "scene"}-${info.format}`}
                    label={t(onlySelection ? "i18n-cont-model-editor-11.modelEditor.actions.exportSelectionAs" : "i18n-cont-model-editor-11.modelEditor.actions.exportSceneAs", { format: info.label })}
                    secondary={info.detail}
                    dividerBefore={onlySelection && index === 0}
                    disabled={isExporting || !canSave || (onlySelection && !selectedObject)}
                    onClick={() => {
                      void handleExport(info.format, onlySelection);
                      close();
                    }}
                  />
                ))
              )
            }
          </MenuButton>
          <Tooltip title={withShortcut(t(isDirty ? "i18n-cont-model-editor-11.modelEditor.actions.saveChanges" : "i18n-cont-model-editor-11.modelEditor.actions.noUnsavedChanges"), "save")}>
            <span>
              <EditorButton
                density="compact"
                variant={isDirty ? "contained" : "outlined"}
                startIcon={<SaveIcon />}
                onClick={() => void handleSave()}
                disabled={isSaving || !canSave}
              >
                {isSaving ? t("i18n-cont-model-editor-11.modelEditor.loading.saving") : t("i18n-cont-model-editor-11.modelEditor.actions.save")}
              </EditorButton>
            </span>
          </Tooltip>
          <CloseButton onClick={requestClose} tooltip={t("i18n-cont-model-editor-11.modelEditor.actions.close")} />
        </FlexRow>
      </FlexRow>

      <FlexRow className="editor-body" fullWidth>
        <FlexColumn className="side-panel left" fullHeight>
          <PanelHeader
            title={t("i18n-cont-model-editor-11.modelEditor.scene.title")}
            count={t("i18n-cont-model-editor-11.modelEditor.scene.objectCount", { count: stats.objects, formattedCount: new Intl.NumberFormat(i18n.language).format(stats.objects) })}
          />
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
                {t("i18n-cont-model-editor-11.modelEditor.errors.importFailed", { error: importError })}
              </AlertBanner>
            </Box>
          )}
          {dropActive && (
            <FlexColumn className="drop-hint" align="center" justify="center">
              <Text>{t("i18n-cont-model-editor-11.modelEditor.dropModel")}</Text>
            </FlexColumn>
          )}
          {exportError && (
            <Box className="viewport-banner">
              <AlertBanner
                severity="error"
                compact
                onClose={() => setExportError(null)}
                action={<ReportBugButton context={exportErrorContext} size="small" />}
              >
                {t("i18n-cont-model-editor-11.modelEditor.errors.exportFailed", { error: exportError })}
              </AlertBanner>
            </Box>
          )}
          {externallyChanged && !saveError && (
            <Box className="viewport-banner">
              <AlertBanner
                severity="warning"
                compact
                action={
                  <FlexRow gap={SPACING.xs}>
                    <EditorButton density="compact" variant="text" onClick={onDismissExternal}>
                      {t("i18n-cont-model-editor-11.modelEditor.actions.keepEditing")}
                    </EditorButton>
                    <EditorButton density="compact" variant="outlined" onClick={onReloadExternal}>
                      {t("i18n-cont-model-editor-11.modelEditor.actions.reload")}
                    </EditorButton>
                  </FlexRow>
                }
              >
                {t("i18n-cont-model-editor-11.modelEditor.externalChange")}
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
                {t("i18n-cont-model-editor-11.modelEditor.errors.saveFailed", { error: saveError })}
              </AlertBanner>
            </Box>
          )}
          {loadError ? (
            <FlexColumn fullWidth fullHeight align="center" justify="center" gap={SPACING.md}>
              <EmptyState
                variant="error"
                title={t("i18n-cont-model-editor-11.modelEditor.errors.openTitle")}
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
              <primitive
                object={root}
                onClick={handleSceneClick}
                onPointerDown={interactive ? handleScenePointerDown : undefined}
                onPointerUp={interactive ? handleScenePointerUp : undefined}
              />
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
                  <ShotLensRig shot={showAiRender ? shot : DEFAULT_SHOT} />
                  {interactive && (
                    <FollowSelection
                      object={selectedObject}
                      tick={tick}
                      onLeftView={followSelection}
                    />
                  )}
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
          {interactive && showAiRender && !loadError && (
            <ShotFrameOverlay shot={shot} label={shotLabel} />
          )}
          {!loadError && !isLoading && animationClips.length > 0 && (
            <AnimationBar
              key={previewEpoch}
              className="animation-bar"
              preview={preview}
              onActiveChange={setPreviewActive}
            />
          )}
          {(isSaving || isLoading || isImporting || isExporting) && (
            <FlexColumn className="overlay" align="center" justify="center" gap={SPACING.md}>
              <LoadingSpinner />
              <Text color="primary">
                {isSaving
                  ? t("i18n-cont-model-editor-11.modelEditor.loading.saving")
                  : isImporting
                    ? t("i18n-cont-model-editor-11.modelEditor.loading.importing")
                    : isExporting
                      ? t("i18n-cont-model-editor-11.modelEditor.loading.exporting")
                      : t("i18n-cont-model-editor-11.modelEditor.loading.loading")}
              </Text>
            </FlexColumn>
          )}
        </div>

        <FlexColumn className="side-panel right" fullHeight>
          <PanelHeader
            title={t("i18n-cont-model-editor-11.modelEditor.inspector")}
            actions={
              selectedObject && interactive ? (
                <FlexRow gap={SPACING.xs} align="center">
                  <Tooltip title={withShortcut(t("i18n-cont-model-editor-11.modelEditor.actions.duplicateSelected"), "duplicate")}>
                    <EditorButton
                      density="compact"
                      variant="text"
                      startIcon={<ContentCopyIcon />}
                      onClick={handleDuplicate}
                    >
                      {t("i18n-cont-model-editor-11.modelEditor.actions.duplicate")}
                    </EditorButton>
                  </Tooltip>
                  <Tooltip title={withShortcut(t("i18n-cont-model-editor-11.modelEditor.actions.deleteSelected"), "delete")}>
                    <EditorButton
                      density="compact"
                      variant="text"
                      color="error"
                      startIcon={<DeleteOutlineIcon />}
                      onClick={handleDelete}
                    >
                      {t("i18n-cont-model-editor-11.modelEditor.actions.delete")}
                    </EditorButton>
                  </Tooltip>
                </FlexRow>
              ) : undefined
            }
          />
          <PropertiesPanel object={selectedObject} tick={tick + dragTick} record={record} />
        </FlexColumn>

        {/* Kept mounted so a render in flight survives hiding the panel. */}
        <div style={{ display: showAiRender && !loadError ? "contents" : "none" }}>
          <ResizableSideDock
            storageKey="model3d_ai_render"
            defaultWidth={ASSISTANT_PANEL_WIDTH}
            ariaLabel={t("i18n-cont-model-editor-11.modelEditor.resizeAiPanel")}
          >
            <PanelHeader
              title={t("i18n-cont-model-editor-11.modelEditor.actions.renderAi")}
              icon={<PhotoCameraOutlinedIcon />}
              description={t("i18n-cont-model-editor-11.modelEditor.aiDescription")}
              onClose={toggleAiRender}
              closeLabel={t("i18n-cont-model-editor-11.modelEditor.actions.hideAiRender")}
            />
            <div className="panel-body">
              <AiRenderPanel
                capture={captureForAi}
                shot={shot}
                onShotChange={changeShot}
                camera={shotCamera}
              />
            </div>
          </ResizableSideDock>
        </div>

        {/* Kept mounted so a render in flight survives hiding the panel. */}
        <div style={{ display: showBlenderRender && !loadError ? "contents" : "none" }}>
          <ResizableSideDock
            storageKey="model3d_blender_render"
            defaultWidth={ASSISTANT_PANEL_WIDTH}
            ariaLabel={t("i18n-cont-model-editor-11.modelEditor.resizeBlenderPanel")}
          >
            <PanelHeader
              title={t("i18n-cont-model-editor-11.modelEditor.actions.renderBlender")}
              icon={<CameraEnhanceOutlinedIcon />}
              description={t("i18n-cont-model-editor-11.modelEditor.blenderDescription")}
              onClose={toggleBlenderRender}
              closeLabel={t("i18n-cont-model-editor-11.modelEditor.actions.hideBlenderRender")}
            />
            <div className="panel-body">
              <BlenderRenderPanel
                exportScene={exportForBlender}
                viewAspect={viewAspect}
                name={modelNameFromFile(name ?? "") || "scene"}
              />
            </div>
          </ResizableSideDock>
        </div>

        {/* Kept mounted (toggled via display) so the chat connection and
            scroll state survive hiding the panel. */}
        <div style={{ display: showAssistant ? "contents" : "none" }}>
          <ResizableSideDock
            storageKey="model3d_assistant"
            defaultWidth={ASSISTANT_PANEL_WIDTH}
            ariaLabel={t("i18n-cont-model-editor-11.modelEditor.resizeAssistant")}
          >
            <PanelHeader
              title={t("i18n-cont-model-editor-11.modelEditor.assistant")}
              icon={<AutoAwesomeIcon />}
              onClose={() => toggleAssistant()}
              closeLabel={t("i18n-cont-model-editor-11.modelEditor.actions.hideAssistant")}
            />
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

      <ViewportContextMenu
        position={viewportMenu && selectedObject ? viewportMenu : null}
        onClose={closeViewportMenu}
        onDuplicate={handleDuplicate}
        onFrame={focusSelection}
        onHide={handleToggleHidden}
        onDelete={handleDelete}
      />
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      {transformSource && (
        <TransformWithWorkflowView
          source={transformSource}
          onClose={() => setTransformSource(null)}
          apply={transformApply}
        />
      )}
      <ConfirmDialog
        open={confirmCloseOpen}
        onClose={() => setConfirmCloseOpen(false)}
        onConfirm={() => {
          setConfirmCloseOpen(false);
          onClose();
        }}
        title={t("i18n-cont-model-editor-11.modelEditor.closeConfirm.title")}
        content={t("i18n-cont-model-editor-11.modelEditor.closeConfirm.content")}
        confirmText={t("i18n-cont-model-editor-11.modelEditor.closeConfirm.discard")}
        cancelText={t("i18n-cont-model-editor-11.modelEditor.actions.keepEditing")}
      />
    </FlexColumn>
  );
};

export default memo(Model3DEditor);
