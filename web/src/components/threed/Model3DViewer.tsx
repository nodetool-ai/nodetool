/** @jsxImportSource @emotion/react */
import React, { Suspense, useMemo, useState, useCallback, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import {
  OrbitControls,
  Environment,
  Grid,
  useGLTF,
  Center,
  Html
} from "@react-three/drei";
import { Box, IconButton, Tooltip, CircularProgress } from "@mui/material";
import GridOnIcon from "@mui/icons-material/GridOn";
import GridOffIcon from "@mui/icons-material/GridOff";
import ViewInArIcon from "@mui/icons-material/ViewInAr";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import CameraAltIcon from "@mui/icons-material/CameraAlt";

export interface Model3DViewerProps {
  source: string | Uint8Array;
  format?: "glb" | "gltf" | "obj" | "fbx" | string;
  width?: number | string;
  height?: number | string;
  controls?: boolean;
  autoRotate?: boolean;
  showGrid?: boolean;
  backgroundColor?: string;
}

// Loading fallback component
const Loader: React.FC = () => (
  <Html center>
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 1,
        color: "white"
      }}
    >
      <CircularProgress size={40} sx={{ color: "white" }} />
      <span>Loading 3D Model...</span>
    </Box>
  </Html>
);

// Error display component
const ErrorDisplay: React.FC<{ message: string }> = ({ message }) => (
  <Html center>
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 1,
        color: "#ff6b6b",
        textAlign: "center",
        padding: 2
      }}
    >
      <ViewInArIcon sx={{ fontSize: 48 }} />
      <span>{message}</span>
    </Box>
  </Html>
);

// Model component that handles loading GLB/GLTF files
interface ModelProps {
  url: string;
}

const Model: React.FC<ModelProps> = ({ url }) => {
  const { scene } = useGLTF(url);

  // Clone the scene to avoid modifying the cached version
  const clonedScene = useMemo(() => scene.clone(), [scene]);

  return (
    <Center>
      <primitive object={clonedScene} />
    </Center>
  );
};

// Error boundary component for 3D model loading
class ModelErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; fallback: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

// Scene setup component
interface SceneSetupProps {
  showGrid: boolean;
  autoRotate: boolean;
}

const SceneSetup: React.FC<SceneSetupProps> = ({ showGrid, autoRotate }) => (
  <>
    {/* Lighting */}
    <ambientLight intensity={0.5} />
    <directionalLight position={[10, 10, 5]} intensity={1} castShadow />
    <directionalLight position={[-10, -10, -5]} intensity={0.3} />

    {/* Environment for reflections */}
    <Environment preset="studio" />

    {/* Grid floor */}
    {showGrid && (
      <Grid
        position={[0, -0.01, 0]}
        args={[10, 10]}
        cellSize={0.5}
        cellThickness={0.5}
        cellColor="#6f6f6f"
        sectionSize={2}
        sectionThickness={1}
        sectionColor="#9d4b4b"
        fadeDistance={30}
        fadeStrength={1}
        followCamera={false}
        infiniteGrid
      />
    )}

    {/* Orbit controls */}
    <OrbitControls
      makeDefault
      autoRotate={autoRotate}
      autoRotateSpeed={1}
      enablePan
      enableZoom
      enableRotate
      minDistance={0.5}
      maxDistance={100}
    />
  </>
);

// Controls overlay component
interface ViewerControlsProps {
  showGrid: boolean;
  onToggleGrid: () => void;
  autoRotate: boolean;
  onToggleAutoRotate: () => void;
  onScreenshot: () => void;
  onFullscreen: () => void;
}

const ViewerControls: React.FC<ViewerControlsProps> = ({
  showGrid,
  onToggleGrid,
  autoRotate,
  onToggleAutoRotate,
  onScreenshot,
  onFullscreen
}) => (
  <Box
    sx={{
      position: "absolute",
      top: 8,
      right: 8,
      display: "flex",
      gap: 0.5,
      zIndex: 10,
      backgroundColor: "rgba(0, 0, 0, 0.5)",
      borderRadius: 1,
      padding: 0.5
    }}
  >
    <Tooltip title={showGrid ? "Hide grid" : "Show grid"}>
      <IconButton
        size="small"
        onClick={onToggleGrid}
        sx={{ color: "white", "&:hover": { backgroundColor: "rgba(255, 255, 255, 0.1)" } }}
      >
        {showGrid ? <GridOnIcon fontSize="small" /> : <GridOffIcon fontSize="small" />}
      </IconButton>
    </Tooltip>
    <Tooltip title={autoRotate ? "Stop rotation" : "Auto rotate"}>
      <IconButton
        size="small"
        onClick={onToggleAutoRotate}
        sx={{
          color: autoRotate ? "#4fc3f7" : "white",
          "&:hover": { backgroundColor: "rgba(255, 255, 255, 0.1)" }
        }}
      >
        <ViewInArIcon fontSize="small" />
      </IconButton>
    </Tooltip>
    <Tooltip title="Take screenshot">
      <IconButton
        size="small"
        onClick={onScreenshot}
        sx={{ color: "white", "&:hover": { backgroundColor: "rgba(255, 255, 255, 0.1)" } }}
      >
        <CameraAltIcon fontSize="small" />
      </IconButton>
    </Tooltip>
    <Tooltip title="Fullscreen">
      <IconButton
        size="small"
        onClick={onFullscreen}
        sx={{ color: "white", "&:hover": { backgroundColor: "rgba(255, 255, 255, 0.1)" } }}
      >
        <FullscreenIcon fontSize="small" />
      </IconButton>
    </Tooltip>
  </Box>
);

/**
 * Model3DViewer - A Three.js-based 3D model viewer component
 *
 * Supports GLB and GLTF formats with orbit controls, grid, and various display options.
 */
const Model3DViewer: React.FC<Model3DViewerProps> = ({
  source,
  format = "glb",
  width = "100%",
  height = 400,
  controls = true,
  autoRotate: initialAutoRotate = false,
  showGrid: initialShowGrid = true,
  backgroundColor = "#1a1a2e"
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showGrid, setShowGrid] = useState(initialShowGrid);
  const [autoRotate, setAutoRotate] = useState(initialAutoRotate);

  // Convert source to URL if needed
  const modelUrl = useMemo(() => {
    if (typeof source === "string") {
      return source;
    }
    // Convert Uint8Array to blob URL
    if (source instanceof Uint8Array) {
      const mimeType =
        format === "glb" ? "model/gltf-binary" : "model/gltf+json";
      const blob = new Blob([source], { type: mimeType });
      return URL.createObjectURL(blob);
    }
    return "";
  }, [source, format]);

  // Cleanup blob URLs on unmount
  React.useEffect(() => {
    return () => {
      if (modelUrl.startsWith("blob:")) {
        URL.revokeObjectURL(modelUrl);
      }
    };
  }, [modelUrl]);

  const handleToggleGrid = useCallback(() => {
    setShowGrid((prev) => !prev);
  }, []);

  const handleToggleAutoRotate = useCallback(() => {
    setAutoRotate((prev) => !prev);
  }, []);

  const handleScreenshot = useCallback(() => {
    if (canvasRef.current) {
      const dataUrl = canvasRef.current.toDataURL("image/png");
      const link = document.createElement("a");
      link.download = "3d-model-screenshot.png";
      link.href = dataUrl;
      link.click();
    }
  }, []);

  const handleFullscreen = useCallback(() => {
    if (containerRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        containerRef.current.requestFullscreen();
      }
    }
  }, []);

  // Only support GLB/GLTF for now
  const isSupported = ["glb", "gltf"].includes(format.toLowerCase());

  if (!modelUrl) {
    return (
      <Box
        sx={{
          width,
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor,
          borderRadius: 1,
          color: "white"
        }}
      >
        <ViewInArIcon sx={{ fontSize: 48, opacity: 0.5 }} />
      </Box>
    );
  }

  if (!isSupported) {
    return (
      <Box
        sx={{
          width,
          height,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor,
          borderRadius: 1,
          color: "white",
          gap: 1
        }}
      >
        <ViewInArIcon sx={{ fontSize: 48 }} />
        <span>Format &quot;{format}&quot; is not yet supported</span>
        <span style={{ fontSize: "0.8em", opacity: 0.7 }}>
          Supported formats: GLB, GLTF
        </span>
      </Box>
    );
  }

  return (
    <Box
      ref={containerRef}
      sx={{
        width,
        height,
        position: "relative",
        borderRadius: 1,
        overflow: "hidden",
        backgroundColor
      }}
    >
      {controls && (
        <ViewerControls
          showGrid={showGrid}
          onToggleGrid={handleToggleGrid}
          autoRotate={autoRotate}
          onToggleAutoRotate={handleToggleAutoRotate}
          onScreenshot={handleScreenshot}
          onFullscreen={handleFullscreen}
        />
      )}
      <Canvas
        ref={canvasRef}
        camera={{ position: [3, 3, 3], fov: 50 }}
        gl={{ preserveDrawingBuffer: true, antialias: true }}
        style={{ background: backgroundColor }}
      >
        <Suspense fallback={<Loader />}>
          <ModelErrorBoundary fallback={<ErrorDisplay message="Failed to load 3D model" />}>
            <Model url={modelUrl} />
          </ModelErrorBoundary>
          <SceneSetup showGrid={showGrid} autoRotate={autoRotate} />
        </Suspense>
      </Canvas>
    </Box>
  );
};

export default React.memo(Model3DViewer);
