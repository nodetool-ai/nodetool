/** @jsxImportSource @emotion/react */
/**
 * KeyboardShortcutCard
 *
 * A card component that displays keyboard shortcuts in an attractive, organized format.
 * Perfect for onboarding, help panels, or quick reference guides.
 *
 * @example
 * <KeyboardShortcutCard
 *   title="Common Shortcuts"
 *   shortcuts={[
 *     { action: "Save", keys: ["Ctrl", "S"] },
 *     { action: "Undo", keys: ["Ctrl", "Z"] },
 *   ]}
 * />
 */

import React, { memo } from "react";
import { Box, BoxProps, Typography, useTheme, Divider } from "@mui/material";
import { ShortcutHint } from "./ShortcutHint";

export interface ShortcutItem {
  /** The action description (e.g., "Save", "Undo") */
  action: string;
  /** The keyboard shortcut keys */
  keys: string[];
  /** Optional description of what the shortcut does */
  description?: string;
}

export interface KeyboardShortcutCardProps extends Omit<BoxProps, "title"> {
  /** Card title */
  title?: string;
  /** Array of shortcut items to display */
  shortcuts: ShortcutItem[];
  /** Layout direction for shortcuts */
  layout?: "vertical" | "horizontal";
  /** Whether to show dividers between items */
  showDividers?: boolean;
  /** Size variant for shortcut hints */
  shortcutSize?: "small" | "medium";
  /** Maximum number of shortcuts to show before truncating */
  maxVisible?: number;
}

/**
 * A card component for displaying keyboard shortcuts in an organized format.
 *
 * This component provides a clean, visually appealing way to present keyboard
 * shortcuts to users, making it ideal for onboarding, help panels, tutorials,
 * and quick reference guides.
 *
 * The card automatically formats keyboard shortcuts using the ShortcutHint
 * component and supports both vertical and horizontal layouts.
 */
const KeyboardShortcutCardInternal: React.FC<KeyboardShortcutCardProps> = ({
  title,
  shortcuts,
  layout = "vertical",
  showDividers = true,
  shortcutSize = "small",
  maxVisible,
  sx,
  ...props
}) => {
  const theme = useTheme();

  // Limit visible shortcuts if maxVisible is set
  const visibleShortcuts = maxVisible
    ? shortcuts.slice(0, maxVisible)
    : shortcuts;
  const hasMore = maxVisible && shortcuts.length > maxVisible;
  const remainingCount = maxVisible ? shortcuts.length - maxVisible : 0;

  // Render a single shortcut item
  const renderShortcutItem = (item: ShortcutItem, index: number) => {
    return (
      <Box
        key={`${item.action}-${index}`}
        sx={{
          display: "flex",
          alignItems: layout === "vertical" ? "flex-start" : "center",
          justifyContent: "space-between",
          gap: layout === "vertical" ? 1.5 : 3,
          py: 1,
          px: 0,
          ...(layout === "horizontal" && {
            minWidth: 0,
            flex: 1,
          }),
        }}
      >
        {/* Action description */}
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
          }}
        >
          <Typography
            variant="body2"
            sx={{
              fontWeight: 500,
              color: theme.vars.palette.text.primary,
              mb: item.description ? 0.25 : 0,
            }}
          >
            {item.action}
          </Typography>
          {item.description && (
            <Typography
              variant="caption"
              sx={{
                color: theme.vars.palette.text.secondary,
                display: "block",
                lineHeight: 1.3,
              }}
            >
              {item.description}
            </Typography>
          )}
        </Box>

        {/* Keyboard shortcut hint */}
        <ShortcutHint
          shortcut={item.keys}
          size={shortcutSize}
          sx={{
            flexShrink: 0,
          }}
        />
      </Box>
    );
  };

  return (
    <Box
      sx={{
        backgroundColor: theme.vars.palette.background.paper,
        border: `1px solid ${theme.vars.palette.divider}`,
        borderRadius: theme.shape.borderRadius,
        padding: theme.spacing(2),
        ...sx,
      }}
      {...props}
    >
      {/* Title */}
      {title && (
        <Typography
          variant="subtitle2"
          sx={{
            fontWeight: 600,
            color: theme.vars.palette.text.primary,
            mb: 1.5,
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            fontSize: "0.75rem",
          }}
        >
          {title}
        </Typography>
      )}

      {/* Shortcuts list */}
      <Box
        sx={{
          display: "flex",
          flexDirection: layout === "vertical" ? "column" : "row",
          flexWrap: layout === "horizontal" ? "wrap" : "nowrap",
          gap: layout === "horizontal" ? 2 : 0,
        }}
      >
        {visibleShortcuts.map((item, index) => {
          const showDivider = showDividers && index > 0 && index < visibleShortcuts.length;
          
          return (
            <Box
              key={`${item.action}-${index}`}
              sx={{
                ...(layout === "vertical" && {
                  width: "100%",
                }),
                ...(layout === "horizontal" && {
                  minWidth: "140px",
                }),
              }}
            >
              {showDivider && layout === "vertical" && (
                <Divider
                  sx={{
                    mb: 1,
                    borderColor: theme.vars.palette.divider,
                    opacity: 0.5,
                  }}
                />
              )}
              {renderShortcutItem(item, index)}
            </Box>
          );
        })}
      </Box>

      {/* "And X more" indicator */}
      {hasMore && (
        <Box
          sx={{
            mt: 1.5,
            pt: 1,
            borderTop: `1px dashed ${theme.vars.palette.divider}`,
          }}
        >
          <Typography
            variant="caption"
            sx={{
              color: theme.vars.palette.text.secondary,
              fontStyle: "italic",
            }}
          >
            + {remainingCount} more shortcut{remainingCount === 1 ? "" : "s"}
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export const KeyboardShortcutCard = memo(KeyboardShortcutCardInternal);
export default KeyboardShortcutCard;
