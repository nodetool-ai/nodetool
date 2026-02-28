/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, {
  Component,
  Suspense,
  useRef,
  useCallback,
  useState,
  useEffect,
  useMemo,
  memo
} from "react";
import { Asset } from "../../stores/ApiTypes";
import {
  Box,
  Typography,
  CircularProgress,
  IconButton,
  Tooltip,
  ToggleButton,
  ToggleButtonGroup,
  Select,
  MenuItem,
  FormControl,
  SelectChangeEvent
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Canvas, useThree, useFrame, ThreeEvent } from "@react-three/fiber";
import {
  OrbitControls,
  Grid,
  useGLTF,
  Center,
  Environment,
  ContactShadows,
  Html
} from "@react-three/drei";
import * as THREE from "three";

// Icons
import GridOnIcon from "@mui/icons-material/GridOn";
import ViewInArIcon from "@mui/icons-material/ViewInAr";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import FullscreenExitIcon from "@mui/icons-material/FullscreenExit";
import CameraAltIcon from "@mui/icons-material/CameraAlt";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import LightModeIcon from "@mui/icons-material/LightMode";
import CloseIcon from "@mui/icons-material/Close";
import { cn, reactFlowClasses } from "../ui_primitives";

// Lighting presets (must match drei Environment preset types)
type LightingPreset =
  | "studio"
  | "warehouse"
  | "city"
  | "sunset"
  | "dawn"
  | "forest"
  | "apartment"
  | "lobby"
  | "night"
  | "park";

const LIGHTING_PRESETS: { value: LightingPreset; label: string }[] = [
  { value: "studio", label: "Studio" },
  { value: "dawn", label: "Dawn" },
  { value: "warehouse", label: "Warehouse" },
  { value: "city", label: "City" },
  { value: "sunset", label: "Sunset" },
  { value: "forest", label: "Forest" },
  { value: "park", label: "Park" },
  { value: "apartment", label: "Apartment" },
  { value: "lobby", label: "Lobby" },
  { value: "night", label: "Night" }
];

// Background colors
type BackgroundColor =
  | "dark"
  | "light"
  | "neutral"
  | "transparent"
  | "gradient";

const BACKGROUND_COLORS: {
  value: BackgroundColor;
  label: string;
  color: string;
}[] = [
  { value: "dark", label: "Dark", color: "#1a1a1a" },
  { value: "light", label: "Light", color: "#f5f5f5" },
  { value: "neutral", label: "Neutral", color: "#404040" },
  { value: "transparent", label: "Transparent", color: "transparent" },
  { value: "gradient", label: "Gradient", color: "#2a2a3a" }
];

export interface Model3DViewerProps {
  asset?: Asset;
  url?: string;
  compact?: boolean;
  onClick?: () => void;
}

const styles = (theme: Theme, compact: boolean, backgroundColor: string) =>
  css({
    "&": {
      display: "flex",
      flexDirection: "column",
      justifyContent: "flex-start",
      alignItems: "center",
      width: "100%",
      height: compact ? "100%" : "calc(100% - 120px)",
      marginTop: compact ? 0 : "1em",
      position: "relative"
    },
    ".model-container": {
      width: compact ? "100%" : "100%",
      height: compact ? "100%" : "100%",
      minHeight: compact ? "60px" : "300px",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      position: "relative",
      cursor: compact ? "pointer" : "default",
      backgroundColor: backgroundColor,
      borderRadius: compact ? "4px" : 0
    },
    ".canvas-container": {
      width: "100%",
      height: "100%",
      position: "relative"
    },
    ".loading-overlay": {
      position: "absolute",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "8px",
      zIndex: 10,
      pointerEvents: "none"
    },
    ".model-info": {
      marginTop: "1em",
      textAlign: "center"
    },
    ".controls-toolbar": {
      position: "absolute",
      bottom: "1em",
      left: "50%",
      transform: "translateX(-50%)",
      display: "flex",
      flexDirection: "row",
      gap: "0.5em",
      padding: "0.5em",
      backgroundColor: "rgba(0, 0, 0, 0.7)",
      borderRadius: "8px",
      zIndex: 100,
      alignItems: "center"
    },
    ".controls-toolbar .MuiIconButton-root": {
      color: theme.vars.palette.grey[100],
      padding: "6px",
      "&:hover": {
        backgroundColor: "rgba(255, 255, 255, 0.1)"
      },
      "&.active": {
        backgroundColor: theme.vars.palette.primary.main,
        color: theme.vars.palette.common.white
      }
    },
    ".controls-toolbar .MuiToggleButtonGroup-root": {
      backgroundColor: "rgba(255, 255, 255, 0.1)",
      borderRadius: "4px"
    },
    ".controls-toolbar .MuiToggleButton-root": {
      color: theme.vars.palette.grey[100],
      border: "none",
      padding: "4px 8px",
      "&.Mui-selected": {
        backgroundColor: theme.vars.palette.primary.main,
        color: theme.vars.palette.common.white,
        "&:hover": {
          backgroundColor: theme.vars.palette.primary.dark
        }
      }
    },
    ".controls-select": {
      minWidth: "100px",
      "& .MuiSelect-select": {
        color: theme.vars.palette.grey[100],
        padding: "4px 8px",
        fontSize: "0.75rem"
      },
      "& .MuiOutlinedInput-notchedOutline": {
        borderColor: "rgba(255, 255, 255, 0.2)"
      },
      "& .MuiSvgIcon-root": {
        color: theme.vars.palette.grey[100]
      }
    },
    ".error-overlay": {
      position: "absolute",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "8px",
      zIndex: 10,
      padding: "1em",
      backgroundColor: "rgba(0, 0, 0, 0.7)",
      borderRadius: "8px"
    },
    ".fullscreen-close-button": {
      position: "absolute",
      top: "1em",
      right: "1em",
      zIndex: 200,
      backgroundColor: "rgba(0, 0, 0, 0.7)",
      color: theme.vars.palette.grey[100],
      "&:hover": {
        backgroundColor: "rgba(0, 0, 0, 0.9)"
      }
    }
  });

// Model component that loads GLTF/GLB files
interface ModelProps {
  url: string;
  wireframe: boolean;
  onLoad?: () => void;
  onClick?: () => void;
}

function Model({ url, wireframe, onLoad, onClick }: ModelProps) {
  const { scene } = useGLTF(url);

  // Clone scene to avoid modifying original
  const clonedScene = useMemo(() => scene.clone(), [scene]);

  // Apply wireframe mode to all mesh materials
  useEffect(() => {
    clonedScene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const materials = Array.isArray(child.material)
          ? child.material
          : [child.material];
        materials.forEach((mat) => {
          // Apply wireframe to any material that supports it
          if (mat && "wireframe" in mat) {
            (mat as THREE.Material & { wireframe: boolean }).wireframe =
              wireframe;
          }
        });
      }
    });
  }, [clonedScene, wireframe]);

  // Signal load complete
  useEffect(() => {
    onLoad?.();
  }, [onLoad]);

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      onClick?.();
    },
    [onClick]
  );

  return (
    <Center>
      {/* eslint-disable-next-line react/no-unknown-property */}
      <primitive object={clonedScene} onClick={handleClick} />
    </Center>
  );
}

// Error boundary for handling model loading errors
interface ModelErrorBoundaryProps {
  children: React.ReactNode;
  onError: (error: Error) => void;
  fallback: React.ReactNode;
}

interface ModelErrorBoundaryState {
  hasError: boolean;
}

class ModelErrorBoundary extends Component<
  ModelErrorBoundaryProps,
  ModelErrorBoundaryState
> {
  constructor(props: ModelErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ModelErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(_error: unknown): void {
    this.props.onError(new Error("Failed to load 3D model"));
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

// Helper grid and axis component
interface SceneHelpersProps {
  showGrid: boolean;
  showAxes: boolean;
}

function SceneHelpers({ showGrid, showAxes }: SceneHelpersProps) {
  return (
    <>
      {showGrid && (
        <Grid
          position={[0, -0.01, 0]}
          args={[10, 10]}
          cellSize={0.5}
          cellThickness={0.5}
          cellColor="#6f6f6f"
          sectionSize={2}
          sectionThickness={1}
          sectionColor="#9d9d9d"
          fadeDistance={25}
          fadeStrength={1}
          followCamera={false}
          infiniteGrid={true}
        />
      )}
      {/* eslint-disable-next-line react/no-unknown-property */}
      {showAxes && <axesHelper args={[2]} />}
    </>
  );
}

// Camera reset component
interface CameraControllerProps {
  resetTrigger: number;
}

// Type for OrbitControls-like objects
interface OrbitControlsLike {
  target: THREE.Vector3;
  update: () => void;
}

// Type guard for OrbitControls
function isOrbitControlsLike(obj: unknown): obj is OrbitControlsLike {
  return (
    obj !== null &&
    typeof obj === "object" &&
    "target" in obj &&
    "update" in obj &&
    typeof (obj as OrbitControlsLike).update === "function"
  );
}

function CameraController({ resetTrigger }: CameraControllerProps) {
  const { camera, controls } = useThree();

  useEffect(() => {
    if (resetTrigger > 0) {
      camera.position.set(3, 2, 3);
      camera.lookAt(0, 0, 0);
      if (isOrbitControlsLike(controls)) {
        controls.target.set(0, 0, 0);
        controls.update();
      }
    }
  }, [resetTrigger, camera, controls]);

  return null;
}

// Auto-rotate component for compact mode
interface AutoRotateProps {
  enabled: boolean;
}

function AutoRotate({ enabled }: AutoRotateProps) {
  const { scene } = useThree();

  useFrame((_, delta) => {
    if (enabled && scene.children.length > 0) {
      scene.rotation.y += delta * 0.3;
    }
  });

  return null;
}

// Screenshot capture function
function useScreenshotCapture() {
  const captureScreenshot = useCallback(
    (
      gl: THREE.WebGLRenderer,
      scene: THREE.Scene,
      camera: THREE.Camera,
      filename: string = "model-screenshot.png"
    ) => {
      // Render the scene
      gl.render(scene, camera);

      // Get the canvas data
      const dataUrl = gl.domElement.toDataURL("image/png");

      // Create download link
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    },
    []
  );

  return { captureScreenshot };
}

// Screenshot button component (inside Canvas)
interface ScreenshotHandlerProps {
  onCapture: (
    gl: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera
  ) => void;
  triggerCapture: number;
}

function ScreenshotHandler({
  onCapture,
  triggerCapture
}: ScreenshotHandlerProps) {
  const { gl, scene, camera } = useThree();

  useEffect(() => {
    if (triggerCapture > 0) {
      onCapture(gl, scene, camera);
    }
  }, [triggerCapture, gl, scene, camera, onCapture]);

  return null;
}

const Model3DViewer: React.FC<Model3DViewerProps> = ({
  asset,
  url,
  compact = false,
  onClick
}) => {
  const theme = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);

  // State
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showGrid, setShowGrid] = useState(!compact);
  const [showAxes, setShowAxes] = useState(!compact);
  const [wireframe, setWireframe] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [lightingPreset, setLightingPreset] =
    useState<LightingPreset>("studio");
  const [backgroundColor, setBackgroundColor] =
    useState<BackgroundColor>("dark");
  const [resetCameraTrigger, setResetCameraTrigger] = useState(0);
  const [screenshotTrigger, setScreenshotTrigger] = useState(0);

  const modelUrl = asset?.get_url || url || "";
  const { captureScreenshot } = useScreenshotCapture();

  // Get background color value
  const bgColorValue = useMemo(
    () =>
      BACKGROUND_COLORS.find((bg) => bg.value === backgroundColor)?.color ||
      "#1a1a1a",
    [backgroundColor]
  );

  // Handle model load
  const handleModelLoad = useCallback(() => {
    setIsLoading(false);
    setLoadError(null);
  }, []);

  // Handle model error
  const handleModelError = useCallback((error: Error) => {
    setIsLoading(false);
    setLoadError(error.message || "Failed to load 3D model");
  }, []);

  // Reset loading state when URL changes
  useEffect(() => {
    if (modelUrl) {
      setIsLoading(true);
      setLoadError(null);
    }
  }, [modelUrl]);

  // Toggle fullscreen
  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) {
      return;
    }

    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  }, []);

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  // Exit fullscreen
  const exitFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  }, []);

  // Handle Escape key to exit fullscreen
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isFullscreen) {
        exitFullscreen();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isFullscreen, exitFullscreen]);

  // Reset camera
  const handleResetCamera = useCallback(() => {
    setResetCameraTrigger((prev) => prev + 1);
  }, []);

  // Take screenshot
  const handleScreenshot = useCallback(() => {
    setScreenshotTrigger((prev) => prev + 1);
  }, []);

  // Handle screenshot capture
  const handleCaptureScreenshot = useCallback(
    (gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) => {
      const filename = asset?.name
        ? `${asset.name.replace(/\.[^/.]+$/, "")}-screenshot.png`
        : "model-screenshot.png";
      captureScreenshot(gl, scene, camera, filename);
    },
    [asset?.name, captureScreenshot]
  );

  // Lighting preset change
  const handleLightingChange = useCallback((event: SelectChangeEvent) => {
    setLightingPreset(event.target.value as LightingPreset);
  }, []);

  // Background change
  const handleBackgroundChange = useCallback((event: SelectChangeEvent) => {
    setBackgroundColor(event.target.value as BackgroundColor);
  }, []);

  const handleToggleGrid = useCallback(() => {
    setShowGrid(!showGrid);
  }, [showGrid]);

  const handleToggleAxes = useCallback(() => {
    setShowAxes(!showAxes);
  }, [showAxes]);

  if (!modelUrl) {
    return (
      <Box
        css={styles(theme, compact, bgColorValue)}
        className="model-3d-viewer"
      >
        <Typography variant="body2" color="textSecondary">
          No 3D model loaded
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      css={styles(theme, compact, bgColorValue)}
      className="model-3d-viewer"
      ref={containerRef}
    >
      <div
        className={cn("model-container", reactFlowClasses.nodrag)}
        onClick={compact ? onClick : undefined}
      >
        <div className="canvas-container">
          {isLoading && !loadError && (
            <div className="loading-overlay">
              <CircularProgress size={compact ? 20 : 40} />
              {!compact && (
                <Typography variant="body2" color="textSecondary">
                  Loading model...
                </Typography>
              )}
            </div>
          )}
          {loadError && (
            <div className="error-overlay">
              <Typography variant="body2" color="error">
                {loadError}
              </Typography>
            </div>
          )}
          <Canvas
            camera={{ position: [3, 2, 3], fov: 50 }}
            gl={{ preserveDrawingBuffer: true }}
            style={{ background: bgColorValue }}
          >
            <ModelErrorBoundary onError={handleModelError} fallback={null}>
              <Suspense
                fallback={
                  <Html center>
                    <CircularProgress size={40} />
                  </Html>
                }
              >
                {/* Lighting based on preset */}
                {/* eslint-disable-next-line react/no-unknown-property */}
                <ambientLight intensity={0.3} />
                <Environment
                  preset={lightingPreset}
                  background={backgroundColor === "gradient"}
                />

                {/* Contact shadows for grounded look */}
                {!compact && (
                  <ContactShadows
                    position={[0, -0.001, 0]}
                    opacity={0.5}
                    scale={10}
                    blur={2}
                    far={4}
                  />
                )}

                {/* The 3D Model */}
                <Model
                  url={modelUrl}
                  wireframe={wireframe}
                  onLoad={handleModelLoad}
                  onClick={compact ? onClick : undefined}
                />

                {/* Scene helpers */}
                {!compact && (
                  <SceneHelpers showGrid={showGrid} showAxes={showAxes} />
                )}

                {/* Orbit controls */}
                <OrbitControls
                  makeDefault
                  enablePan={!compact}
                  enableZoom={!compact}
                  enableRotate={true}
                  minDistance={0.5}
                  maxDistance={50}
                />

                {/* Camera controller */}
                <CameraController resetTrigger={resetCameraTrigger} />

                {/* Auto rotate for compact mode */}
                {compact && <AutoRotate enabled={true} />}

                {/* Screenshot handler */}
                <ScreenshotHandler
                  onCapture={handleCaptureScreenshot}
                  triggerCapture={screenshotTrigger}
                />
              </Suspense>
            </ModelErrorBoundary>
          </Canvas>
        </div>

        {/* Fullscreen close button (only visible in fullscreen mode) */}
        {isFullscreen && (
          <Tooltip title="Exit Fullscreen (Esc)">
            <IconButton
              className="fullscreen-close-button"
              onClick={exitFullscreen}
              size="medium"
              aria-label="Exit fullscreen"
            >
              <CloseIcon />
            </IconButton>
          </Tooltip>
        )}

        {/* Controls toolbar (only in non-compact mode) */}
        {!compact && (
          <div className="controls-toolbar">
            {/* Grid toggle */}
            <Tooltip title="Toggle Grid">
              <IconButton
                size="small"
                onClick={handleToggleGrid}
                className={showGrid ? "active" : ""}
              >
                <GridOnIcon fontSize="small" />
              </IconButton>
            </Tooltip>

            {/* Axes toggle */}
            <Tooltip title="Toggle Axes">
              <IconButton
                size="small"
                onClick={handleToggleAxes}
                className={showAxes ? "active" : ""}
              >
                <ViewInArIcon fontSize="small" />
              </IconButton>
            </Tooltip>

            {/* Wireframe toggle */}
            <ToggleButtonGroup
              size="small"
              value={wireframe ? "wireframe" : "solid"}
              exclusive
              onChange={(_, value) => setWireframe(value === "wireframe")}
            >
              <ToggleButton value="solid" size="small">
                Solid
              </ToggleButton>
              <ToggleButton value="wireframe" size="small">
                Wire
              </ToggleButton>
            </ToggleButtonGroup>

            {/* Lighting preset select */}
            <FormControl size="small" className="controls-select">
              <Select
                value={lightingPreset}
                onChange={handleLightingChange}
                variant="outlined"
                IconComponent={LightModeIcon}
              >
                {LIGHTING_PRESETS.map((preset) => (
                  <MenuItem key={preset.value} value={preset.value}>
                    {preset.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Background color select */}
            <FormControl size="small" className="controls-select">
              <Select
                value={backgroundColor}
                onChange={handleBackgroundChange}
                variant="outlined"
              >
                {BACKGROUND_COLORS.map((bg) => (
                  <MenuItem key={bg.value} value={bg.value}>
                    {bg.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Reset camera */}
            <Tooltip title="Reset Camera">
              <IconButton size="small" onClick={handleResetCamera}>
                <RestartAltIcon fontSize="small" />
              </IconButton>
            </Tooltip>

            {/* Screenshot */}
            <Tooltip title="Take Screenshot">
              <IconButton size="small" onClick={handleScreenshot}>
                <CameraAltIcon fontSize="small" />
              </IconButton>
            </Tooltip>

            {/* Fullscreen toggle */}
            <Tooltip title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}>
              <IconButton size="small" onClick={toggleFullscreen}>
                {isFullscreen ? (
                  <FullscreenExitIcon fontSize="small" />
                ) : (
                  <FullscreenIcon fontSize="small" />
                )}
              </IconButton>
            </Tooltip>
          </div>
        )}
      </div>

      {/* Model info */}
      {!compact && asset?.name && (
        <div className="model-info">
          <Typography variant="h6" color="textSecondary">
            {asset.name}
          </Typography>
        </div>
      )}
    </Box>
  );
};

export default memo(Model3DViewer);
