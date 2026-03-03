import { memo, useCallback, useMemo } from "react";
import {
  Box,
  IconButton,
  Tooltip,
  useTheme
} from "@mui/material";
import { useReactFlow } from "@xyflow/react";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowLeftIcon from "@mui/icons-material/KeyboardArrowLeft";
import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";
import CenterFocusStrongIcon from "@mui/icons-material/CenterFocusStrong";
import type { Viewport } from "@xyflow/react";

/**
 * Distance (in pixels) to pan the viewport for each click.
 * Provides smooth, predictable navigation.
 */
const PAN_DISTANCE = 150;

/**
 * Duration of the pan animation in milliseconds.
 */
const PAN_DURATION = 200;

/**
 * Props for CanvasPanControls component.
 */
export interface CanvasPanControlsProps {
  /** Whether the controls are visible */
  visible?: boolean;
  /** Custom panning distance in pixels (default: 150) */
  panDistance?: number;
  /** Animation duration in milliseconds (default: 200) */
  panDuration?: number;
  /** Position from bottom in pixels (default: 16) */
  bottom?: number;
  /** Position from right in pixels (default: 16) */
  right?: number;
}

/**
 * CanvasPanControls provides directional arrow buttons for panning the workflow canvas.
 *
 * This component enhances accessibility by providing an alternative to drag-to-pan,
 * allowing users to navigate the canvas using click controls. It's particularly
 * useful for users who may have difficulty with drag gestures or prefer precise
 * incremental movements.
 *
 * @example
 * ```tsx
 * <CanvasPanControls visible={true} />
 * ```
 *
 * @example
 * ```tsx
 * // With custom settings
 * <CanvasPanControls
 *   visible={true}
 *   panDistance={200}
 *   panDuration={300}
 *   bottom={80}
 *   right={20}
 * />
 * ```
 */
const CanvasPanControls: React.FC<CanvasPanControlsProps> = ({
  visible = true,
  panDistance = PAN_DISTANCE,
  panDuration = PAN_DURATION,
  bottom = 16,
  right = 16
}) => {
  const theme = useTheme();
  const { setViewport, getViewport, fitView } = useReactFlow();

  /**
   * Pans the viewport by the specified x and y offsets.
   */
  const pan = useCallback(
    (x: number, y: number) => {
      const currentViewport = getViewport();
      const newViewport: Viewport = {
        x: currentViewport.x + x,
        y: currentViewport.y + y,
        zoom: currentViewport.zoom
      };
      setViewport(newViewport, { duration: panDuration });
    },
    [getViewport, setViewport, panDuration]
  );

  const handlePanUp = useCallback(() => {
    pan(0, -panDistance);
  }, [pan, panDistance]);

  const handlePanDown = useCallback(() => {
    pan(0, panDistance);
  }, [pan, panDistance]);

  const handlePanLeft = useCallback(() => {
    pan(-panDistance, 0);
  }, [pan, panDistance]);

  const handlePanRight = useCallback(() => {
    pan(panDistance, 0);
  }, [pan, panDistance]);

  const handleCenterView = useCallback(() => {
    fitView({ padding: 0.2, duration: panDuration });
  }, [fitView, panDuration]);

  /**
   * Memoized styles for the control buttons.
   */
  const buttonSx = useMemo(
    () => ({
      padding: "4px",
      color: theme.vars.palette.text.secondary,
      transition: "all 0.15s ease",
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover,
        color: theme.palette.primary.main
      },
      "&:active": {
        backgroundColor: theme.vars.palette.action.selected,
        transform: "scale(0.95)"
      }
    }),
    [theme]
  );

  /**
   * Memoized styles for the control container.
   */
  const containerSx = useMemo(
    () => ({
      position: "absolute" as const,
      bottom,
      right,
      zIndex: 9,
      display: "flex",
      flexDirection: "column" as const,
      alignItems: "center" as const,
      gap: 0.25,
      backgroundColor: theme.vars.palette.Paper.paper,
      backdropFilter: "blur(8px)",
      borderRadius: "8px",
      border: `1px solid ${theme.vars.palette.divider}`,
      padding: "6px",
      boxShadow: theme.shadows[4],
      userSelect: "none",
      opacity: visible ? 1 : 0,
      pointerEvents: visible ? "auto" : "none",
      transition: "opacity 0.2s ease-in-out"
    }),
    [bottom, right, theme, visible]
  );

  if (!visible) {
    return null;
  }

  return (
    <Box
      data-testid="canvas-pan-controls"
      sx={containerSx}
    >
      {/* Row 1: Up arrow */}
      <Tooltip title="Pan Up" placement="left" arrow>
        <IconButton
          onClick={handlePanUp}
          size="small"
          aria-label="Pan canvas up"
          sx={buttonSx}
        >
          <KeyboardArrowUpIcon sx={{ fontSize: "1rem" }} />
        </IconButton>
      </Tooltip>

      {/* Row 2: Left, Center, Right arrows */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.25 }}>
        <Tooltip title="Pan Left" placement="top" arrow>
          <IconButton
            onClick={handlePanLeft}
            size="small"
            aria-label="Pan canvas left"
            sx={buttonSx}
          >
            <KeyboardArrowLeftIcon sx={{ fontSize: "1rem" }} />
          </IconButton>
        </Tooltip>

        <Tooltip title="Center View" placement="top" arrow>
          <IconButton
            onClick={handleCenterView}
            size="small"
            aria-label="Center view in canvas"
            sx={{
              ...buttonSx,
              mx: 0.25
            }}
          >
            <CenterFocusStrongIcon sx={{ fontSize: "0.9rem" }} />
          </IconButton>
        </Tooltip>

        <Tooltip title="Pan Right" placement="top" arrow>
          <IconButton
            onClick={handlePanRight}
            size="small"
            aria-label="Pan canvas right"
            sx={buttonSx}
          >
            <KeyboardArrowRightIcon sx={{ fontSize: "1rem" }} />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Row 3: Down arrow */}
      <Tooltip title="Pan Down" placement="left" arrow>
        <IconButton
          onClick={handlePanDown}
          size="small"
          aria-label="Pan canvas down"
          sx={buttonSx}
        >
          <KeyboardArrowDownIcon sx={{ fontSize: "1rem" }} />
        </IconButton>
      </Tooltip>
    </Box>
  );
};

export default memo(CanvasPanControls);
