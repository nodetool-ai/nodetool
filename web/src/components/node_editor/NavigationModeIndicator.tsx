/**
 * NavigationModeIndicator Component
 *
 * Displays a visual indicator when keyboard navigation mode is active.
 * Shows helpful keyboard shortcuts for navigation.
 *
 * Features:
 * - Animated appearance/disappearance
 * - Shows navigation mode status
 * - Displays keyboard shortcut hints
 * - Theme-aware styling
 */

import { memo } from "react";
import { Box, Typography, Chip } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useNodeFocusStore } from "../../stores/NodeFocusStore";

interface NavigationModeIndicatorProps {
  /**
   * Optional className for custom styling
   */
  className?: string;
}

const NavigationModeIndicator = memo<NavigationModeIndicatorProps>(
  ({ className = "" }) => {
    const theme = useTheme();
    const isNavigationMode = useNodeFocusStore(
      (state) => state.isNavigationMode
    );

    if (!isNavigationMode) {
      return null;
    }

    return (
      <Box
        className={`navigation-mode-indicator ${className}`.trim()}
        sx={{
          position: "absolute",
          bottom: theme.spacing(2),
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 1000,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 1,
          backgroundColor: theme.vars.palette.background.paper,
          border: `1px solid ${theme.vars.palette.divider}`,
          borderRadius: theme.rounded?.dialog ?? "8px",
          padding: theme.spacing(1.5, 2.5),
          boxShadow: theme.shadows[3],
          animation: "fadeIn 0.2s ease-out",
          "@keyframes fadeIn": {
            from: {
              opacity: 0,
              transform: "translate(-50%, 8px)"
            },
            to: {
              opacity: 1,
              transform: "translate(-50%, 0)"
            }
          }
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1
          }}
        >
          <Box
            component="span"
            sx={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              backgroundColor: theme.vars.palette.success.main,
              animation: "pulse 1.5s ease-in-out infinite",
              "@keyframes pulse": {
                "0%, 100%": {
                  opacity: 1,
                  transform: "scale(1)"
                },
                "50%": {
                  opacity: 0.7,
                  transform: "scale(1.1)"
                }
              }
            }}
          />
          <Typography
            variant="body2"
            sx={{
              fontWeight: 500,
              color: theme.vars.palette.text.primary
            }}
          >
            Navigation Mode
          </Typography>
        </Box>

        <Box
          sx={{
            display: "flex",
            gap: 1,
            flexWrap: "wrap",
            justifyContent: "center"
          }}
        >
          <Chip
            label={<ShortcutLabel keys={["Tab"]} description="Next" />}
            size="small"
            variant="outlined"
            sx={{
              fontSize: "0.75rem",
              height: 24
            }}
          />
          <Chip
            label={<ShortcutLabel keys={["Shift", "Tab"]} description="Prev" />}
            size="small"
            variant="outlined"
            sx={{
              fontSize: "0.75rem",
              height: 24
            }}
          />
          <Chip
            label={<ShortcutLabel keys={["Alt", "↑↓←→"]} description="Move" />}
            size="small"
            variant="outlined"
            sx={{
              fontSize: "0.75rem",
              height: 24
            }}
          />
          <Chip
            label={<ShortcutLabel keys={["Enter"]} description="Select" />}
            size="small"
            variant="outlined"
            sx={{
              fontSize: "0.75rem",
              height: 24
            }}
          />
          <Chip
            label={<ShortcutLabel keys={["Esc"]} description="Exit" />}
            size="small"
            variant="outlined"
            sx={{
              fontSize: "0.75rem",
              height: 24
            }}
          />
        </Box>
      </Box>
    );
  }
);

NavigationModeIndicator.displayName = "NavigationModeIndicator";

interface ShortcutLabelProps {
  keys: string[];
  description: string;
}

const ShortcutLabel = memo<ShortcutLabelProps>(({ keys, description }) => {
  const theme = useTheme();

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.5
      }}
    >
      {keys.map((key, index) => (
        <Box
          key={index}
          sx={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minWidth: 20,
            height: 20,
            px: 0.5,
            backgroundColor: theme.vars.palette.action.hover,
            borderRadius: theme.rounded?.buttonSmall ?? "4px",
            fontSize: "0.7rem",
            fontWeight: 600,
            color: theme.vars.palette.text.primary,
            fontFamily: "monospace"
          }}
        >
          {key}
        </Box>
      ))}
      <Typography
        variant="caption"
        sx={{
          ml: 0.5,
          color: theme.vars.palette.text.secondary
        }}
      >
        {description}
      </Typography>
    </Box>
  );
});

ShortcutLabel.displayName = "ShortcutLabel";

export default NavigationModeIndicator;
