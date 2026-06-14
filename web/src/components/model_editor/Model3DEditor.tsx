/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Grid, Environment, TransformControls } from "@react-three/drei";

import OpenWithIcon from "@mui/icons-material/OpenWith";
import ThreeDRotationIcon from "@mui/icons-material/ThreeDRotation";
import AspectRatioIcon from "@mui/icons-material/AspectRatio";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import CenterFocusStrongIcon from "@mui/icons-material/CenterFocusStrong";
import GridOnIcon from "@mui/icons-material/GridOn";

import {
  FlexColumn,
  FlexRow,
  Text,
  Divider,
  LoadingSpinner,
  ToolbarIconButton,
  ToggleGroup,
  ToggleOption,
  EditorButton,
  CloseButton,
  DownloadButton
} from "../ui_primitives";
import SceneOutliner from "./SceneOutliner";
import PropertiesPanel from "./PropertiesPanel";
import { buildSceneTree } from "./sceneTree";
import { disposeObject } from "./sceneTree";
import {
  createPrimitive,
  PRIMITIVE_LABELS,
  type PrimitiveKind
} from "./objectFactory";
import { exportSceneToGlb } from "./exportGltf";

type GizmoMode = "translate" | "rotate" | "scale";

const PANEL_WIDTH = 240;

const styles = (theme: Theme) =>
  css({
    "&": {
      width: "100%",
      height: "100%",
      minHeight: 0,
      backgroundColor: theme.vars.palette.grey[900]
    },
    ".editor-toolbar": {
      padding: "6px 12px",
      gap: "8px",
      alignItems: "center",
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: theme.vars.palette.background.paper,
      flexShrink: 0,
      flexWrap: "wrap"
    },
    ".editor-title": {
      maxWidth: "260px",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },
    ".editor-body": {
      flex: 1,
      minHeight: 0
    },
    ".side-panel": {
      width: `${PANEL_WIDTH}px`,
      flexShrink: 0,
      minHeight: 0,
      backgroundColor: theme.vars.palette.background.paper,
      borderRight: `1px solid ${theme.vars.palette.divider}`
    },
    ".side-panel.right": {
      borderRight: "none",
      borderLeft: `1px solid ${theme.vars.palette.divider}`
    },
    ".panel-header": {
      padding: "8px 12px",
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      flexShrink: 0
    },
    ".canvas-wrap": {
      flex: 1,
      minWidth: 0,
      position: "relative"
    },
    ".add-menu": {
      position: "relative"
    },
    ".add-dropdown": {
      position: "absolute",
      top: "100%",
      left: 0,
      zIndex: 50,
      marginTop: "4px",
      padding: "4px",
      minWidth: "160px",
      backgroundColor: theme.vars.palette.background.paper,
      border: `1px solid ${theme.vars.palette.divider}`,
      borderRadius: "var(--rounded-md)",
      boxShadow: theme.shadows[6]
    },
    ".add-dropdown .MuiButton-root": {
      justifyContent: "flex-start",
      width: "100%"
    },
    ".overlay": {
      position: "absolute",
      inset: 0,
      zIndex: 100,
      backgroundColor: "rgba(0,0,0,0.6)"
    },
    ".load-error": {
      position: "absolute",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      maxWidth: "80%",
      padding: "1em 1.5em",
      textAlign: "center",
      backgroundColor: "rgba(0,0,0,0.8)",
      borderRadius: "var(--rounded-lg)"
    }
  });

interface FitCameraProps {
  root: THREE.Object3D;
  trigger: number;
}

interface OrbitControlsLike {
  target: THREE.Vector3;
  update: () => void;
}

const isOrbitControlsLike = (obj: unknown): obj is OrbitControlsLike =>
  obj !== null &&
  typeof obj === "object" &&
  "target" in obj &&
  typeof (obj as OrbitControlsLike).update === "function";

/** Frames the camera to the editor root's bounding box on demand. */
const FitCamera = ({ root, trigger }: FitCameraProps) => {
  const { camera, controls } = useThree();

  useEffect(() => {
    const box = new THREE.Box3().setFromObject(root);
    if (box.isEmpty()) {
      return;
    }
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const perspective =
      camera instanceof THREE.PerspectiveCamera ? camera : null;
    const maxDim = Math.max(size.x, size.y, size.z, 0.001);

    if (perspective) {
      const fitHeightDistance =
        maxDim / (2 * Math.tan(THREE.MathUtils.degToRad(perspective.fov / 2)));
      const fitWidthDistance =
        fitHeightDistance / Math.max(perspective.aspect, 0.1);
      const distance = Math.max(fitHeightDistance, fitWidthDistance) * 1.5;
      const dir = new THREE.Vector3(1, 0.7, 1).normalize();
      perspective.position.copy(center.clone().add(dir.multiplyScalar(distance)));
      perspective.near = Math.max(distance / 100, 0.01);
      perspective.far = Math.max(distance * 20, 100);
      perspective.lookAt(center);
      perspective.updateProjectionMatrix();
    }
    if (isOrbitControlsLike(controls)) {
      controls.target.copy(center);
      controls.update();
    }
  }, [root, trigger, camera, controls]);

  return null;
};

interface AddMenuProps {
  onAdd: (kind: PrimitiveKind) => void;
}

const PRIMITIVE_ORDER: PrimitiveKind[] = [
  "box",
  "sphere",
  "plane",
  "cylinder",
  "torus",
  "directionalLight",
  "pointLight"
];

const AddMenu = ({ onAdd }: AddMenuProps) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="add-menu" ref={ref}>
      <EditorButton
        density="compact"
        variant="text"
        startIcon={<AddIcon />}
        onClick={() => setOpen((v) => !v)}
      >
        Add
      </EditorButton>
      {open && (
        <FlexColumn className="add-dropdown" gap={2}>
          {PRIMITIVE_ORDER.map((kind) => (
            <EditorButton
              key={kind}
              density="compact"
              variant="text"
              onClick={() => {
                onAdd(kind);
                setOpen(false);
              }}
            >
              {PRIMITIVE_LABELS[kind]}
            </EditorButton>
          ))}
        </FlexColumn>
      )}
    </div>
  );
};

export interface Model3DEditorProps {
  url: string;
  name?: string;
  onSave: (blob: Blob) => Promise<void> | void;
  onClose: () => void;
}

const Model3DEditor = ({ url, name, onSave, onClose }: Model3DEditorProps) => {
  const theme = useTheme();

  // Persistent group that owns all editable content and is exported on save.
  const rootRef = useRef<THREE.Group>(null);
  if (rootRef.current === null) {
    const group = new THREE.Group();
    group.name = "Scene";
    rootRef.current = group;
  }
  const root = rootRef.current;

  const [tick, setTick] = useState(0);
  const [selectedUuid, setSelectedUuid] = useState<string | null>(null);
  const [gizmoMode, setGizmoMode] = useState<GizmoMode>("translate");
  const [showGrid, setShowGrid] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [fitTrigger, setFitTrigger] = useState(0);

  const bump = useCallback(() => setTick((t) => t + 1), []);

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
        // Dispose any previously loaded content before swapping in the new model.
        while (root.children.length > 0) {
          const child = root.children[0];
          root.remove(child);
          disposeObject(child);
        }
        gltf.scene.name = gltf.scene.name || "Model";
        root.add(gltf.scene);
        setSelectedUuid(null);
        setIsLoading(false);
        setFitTrigger((t) => t + 1);
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
      while (root.children.length > 0) {
        const child = root.children[0];
        root.remove(child);
        disposeObject(child);
      }
    };
  }, [url, root, bump]);

  const treeNodes = useMemo(() => {
    void tick;
    return buildSceneTree(root);
  }, [root, tick]);

  const selectedObject = useMemo(() => {
    void tick;
    if (!selectedUuid) {
      return null;
    }
    return root.getObjectByProperty("uuid", selectedUuid) ?? null;
  }, [root, selectedUuid, tick]);

  const handleToggleVisible = useCallback(
    (uuid: string) => {
      const obj = root.getObjectByProperty("uuid", uuid);
      if (obj) {
        obj.visible = !obj.visible;
        bump();
      }
    },
    [root, bump]
  );

  const handleAdd = useCallback(
    (kind: PrimitiveKind) => {
      const obj = createPrimitive(kind);
      let counter = 1;
      const base = PRIMITIVE_LABELS[kind];
      const existing = new Set<string>();
      root.traverse((c) => existing.add(c.name));
      let candidate = base;
      while (existing.has(candidate)) {
        counter += 1;
        candidate = `${base} ${counter}`;
      }
      obj.name = candidate;
      root.add(obj);
      setSelectedUuid(obj.uuid);
      bump();
    },
    [root, bump]
  );

  const handleDelete = useCallback(() => {
    if (!selectedObject) {
      return;
    }
    selectedObject.parent?.remove(selectedObject);
    disposeObject(selectedObject);
    setSelectedUuid(null);
    bump();
  }, [selectedObject, bump]);

  const handleSceneClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    setSelectedUuid(e.object.uuid);
  }, []);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      const blob = await exportSceneToGlb(root);
      await onSave(blob);
    } catch (error) {
      console.error("[Model3DEditor] Failed to export GLB:", error);
      setLoadError(
        error instanceof Error ? error.message : "Failed to export model"
      );
    } finally {
      setIsSaving(false);
    }
  }, [root, onSave]);

  // Delete key removes the selected object.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (typing) {
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        handleDelete();
      } else if (e.key === "g") {
        setGizmoMode("translate");
      } else if (e.key === "r") {
        setGizmoMode("rotate");
      } else if (e.key === "s") {
        setGizmoMode("scale");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleDelete]);

  return (
    <FlexColumn css={styles(theme)} className="model-3d-editor" fullWidth fullHeight>
      <FlexRow className="editor-toolbar" fullWidth>
        <Text size="small" weight={600} className="editor-title" title={name}>
          {name || "3D Model"}
        </Text>
        <Divider orientation="vertical" flexItem />
        <ToggleGroup
          size="small"
          exclusive
          value={gizmoMode}
          onChange={(_e, value) => value && setGizmoMode(value as GizmoMode)}
        >
          <ToggleOption value="translate" size="small">
            <OpenWithIcon fontSize="small" />
          </ToggleOption>
          <ToggleOption value="rotate" size="small">
            <ThreeDRotationIcon fontSize="small" />
          </ToggleOption>
          <ToggleOption value="scale" size="small">
            <AspectRatioIcon fontSize="small" />
          </ToggleOption>
        </ToggleGroup>
        <Divider orientation="vertical" flexItem />
        <AddMenu onAdd={handleAdd} />
        <ToolbarIconButton
          icon={<DeleteOutlineIcon fontSize="small" />}
          tooltip="Delete selected (Del)"
          onClick={handleDelete}
          disabled={!selectedObject}
          size="small"
        />
        <ToolbarIconButton
          icon={<CenterFocusStrongIcon fontSize="small" />}
          tooltip="Frame scene"
          onClick={() => setFitTrigger((t) => t + 1)}
          size="small"
        />
        <ToolbarIconButton
          icon={<GridOnIcon fontSize="small" />}
          tooltip="Toggle grid"
          onClick={() => setShowGrid((v) => !v)}
          active={showGrid}
          size="small"
        />
        <FlexRow style={{ marginLeft: "auto" }} gap={1} align="center">
          <DownloadButton onClick={handleSave} tooltip="Save to asset" />
          <CloseButton onClick={onClose} tooltip="Close editor" />
        </FlexRow>
      </FlexRow>

      <FlexRow className="editor-body" fullWidth>
        <FlexColumn className="side-panel left" fullHeight>
          <FlexRow className="panel-header">
            <Text size="small" weight={600}>
              Scene
            </Text>
          </FlexRow>
          <SceneOutliner
            nodes={treeNodes}
            selectedUuid={selectedUuid}
            onSelect={setSelectedUuid}
            onToggleVisible={handleToggleVisible}
          />
        </FlexColumn>

        <div className="canvas-wrap">
          {loadError && (
            <FlexColumn className="load-error" gap={1} align="center">
              <Text size="normal" color="error">
                {loadError}
              </Text>
            </FlexColumn>
          )}
          <Canvas
            camera={{ position: [3, 2, 3], fov: 50 }}
            gl={{ preserveDrawingBuffer: true }}
            onPointerMissed={() => setSelectedUuid(null)}
            style={{ background: theme.vars.palette.grey[900] }}
          >
            <ambientLight intensity={0.4} />
            <directionalLight position={[5, 8, 5]} intensity={1} />
            <Environment preset="studio" />
            {showGrid && (
              <Grid
                position={[0, -0.001, 0]}
                args={[20, 20]}
                cellSize={0.5}
                cellThickness={0.5}
                cellColor="#6f6f6f"
                sectionSize={2}
                sectionThickness={1}
                sectionColor="#9d9d9d"
                fadeDistance={30}
                infiniteGrid
              />
            )}
            <primitive object={root} onClick={handleSceneClick} />
            {selectedObject && (
              <TransformControls
                object={selectedObject}
                mode={gizmoMode}
                onObjectChange={bump}
              />
            )}
            <OrbitControls makeDefault enableDamping={false} />
            <FitCamera root={root} trigger={fitTrigger} />
          </Canvas>
        </div>

        <FlexColumn className="side-panel right" fullHeight>
          <FlexRow className="panel-header">
            <Text size="small" weight={600}>
              Properties
            </Text>
          </FlexRow>
          <PropertiesPanel object={selectedObject} tick={tick} onChanged={bump} />
        </FlexColumn>
      </FlexRow>

      {(isSaving || isLoading) && (
        <FlexColumn className="overlay" align="center" justify="center" gap={2}>
          <LoadingSpinner />
          <Text color="primary">{isSaving ? "Saving..." : "Loading model..."}</Text>
        </FlexColumn>
      )}
    </FlexColumn>
  );
};

export default memo(Model3DEditor);
