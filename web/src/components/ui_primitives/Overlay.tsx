/**
 * Overlay Component
 *
 * A themed overlay/backdrop for modals, loading states, and focus views.
 * Provides consistent backdrop styling with optional blur and opacity.
 */

import React from "react";
import { Box, BoxProps } from "@mui/material";
import { useTheme } from "@mui/material/styles";

export interface OverlayProps extends BoxProps {
  /** Whether the overlay is visible */
  open?: boolean;
  /** Background opacity (0-1) */
  opacity?: number;
  /** Apply backdrop blur */
  blur?: number;
  /** Click handler (usually for closing) */
  onClose?: () => void;
  /** Center children within the overlay */
  centered?: boolean;
  /** Z-index layer */
  zIndex?: number;
}

/**
 * Overlay - A themed backdrop/overlay component
 *
 * @example
 * // Basic overlay
 * <Overlay open={isOpen} onClose={handleClose} />
 *
 * @example
 * // With centered content
 * <Overlay open={isLoading} centered>
 *   <LoadingSpinner />
 * </Overlay>
 *
 * @example
 * // Blurred backdrop
 * <Overlay open blur={4} opacity={0.6}>
 *   <Dialog>...</Dialog>
 * </Overlay>
 */
export const Overlay: React.FC<OverlayProps> = ({
  open = true,
  opacity = 0.5,
  blur,
  onClose,
  centered = false,
  zIndex = 1300,
  sx,
  children,
  ...props
}) => {
  const theme = useTheme();

  if (!open) return null;

  return (
    <Box
      onClick={onClose}
      sx={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: `rgba(0, 0, 0, ${opacity})`,
        backdropFilter: blur ? `blur(${blur}px)` : undefined,
        zIndex,
        display: centered ? "flex" : undefined,
        alignItems: centered ? "center" : undefined,
        justifyContent: centered ? "center" : undefined,
        ...sx,
      }}
      {...props}
    >
      {children && (
        <Box onClick={(e) => e.stopPropagation()}>
          {children}
        </Box>
      )}
    </Box>
  );
};

Overlay.displayName = "Overlay";
