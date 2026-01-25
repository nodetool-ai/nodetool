/**
 * ActionButtonGroup
 *
 * A flexible container for grouping action buttons with consistent spacing and layout.
 * Supports horizontal and vertical layouts, spacing variants, and responsive behavior.
 * Commonly used for toolbars, action panels, and grouped controls.
 *
 * @example
 * // Simple horizontal group
 * <ActionButtonGroup>
 *   <StateIconButton icon={<SaveIcon />} onClick={handleSave} tooltip="Save" />
 *   <StateIconButton icon={<DeleteIcon />} onClick={handleDelete} tooltip="Delete" />
 * </ActionButtonGroup>
 *
 * @example
 * // Vertical group with larger spacing
 * <ActionButtonGroup direction="column" spacing={2}>
 *   <Button>Option 1</Button>
 *   <Button>Option 2</Button>
 *   <Button>Option 3</Button>
 * </ActionButtonGroup>
 *
 * @example
 * // Justified group (space between items)
 * <ActionButtonGroup justify="space-between">
 *   <Button>Left</Button>
 *   <Button>Right</Button>
 * </ActionButtonGroup>
 */

import React, { forwardRef, memo } from "react";
import { Box } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { editorClassNames, cn } from "../editor_ui/editorUtils";

export interface ActionButtonGroupProps {
  /**
   * Child buttons/components to group
   */
  children: React.ReactNode;
  /**
   * Layout direction
   * @default "row"
   */
  direction?: "row" | "column";
  /**
   * Spacing between items (theme spacing units)
   * @default 1
   */
  spacing?: number;
  /**
   * Justify content (flex justify-content property)
   * @default "flex-start"
   */
  justify?:
    | "flex-start"
    | "center"
    | "flex-end"
    | "space-between"
    | "space-around"
    | "space-evenly";
  /**
   * Align items (flex align-items property)
   * @default "center"
   */
  align?: "flex-start" | "center" | "flex-end" | "stretch" | "baseline";
  /**
   * Whether items should wrap to the next line
   * @default false
   */
  wrap?: boolean;
  /**
   * Whether the group should take full width
   * @default false
   */
  fullWidth?: boolean;
  /**
   * Whether to add nodrag class for ReactFlow compatibility
   * @default true
   */
  nodrag?: boolean;
  /**
   * Additional class name
   */
  className?: string;
  /**
   * Additional sx styles
   */
  sx?: object;
  /**
   * Padding inside the group (theme spacing units)
   */
  padding?: number | string;
  /**
   * Border radius (theme spacing units)
   */
  borderRadius?: number | string;
  /**
   * Background color
   */
  backgroundColor?: string;
  /**
   * Border
   */
  border?: string;
  /**
   * Add dividers between items
   * @default false
   */
  divider?: boolean;
  /**
   * Divider color
   */
  dividerColor?: string;
}

export const ActionButtonGroup = memo(
  forwardRef<HTMLDivElement, ActionButtonGroupProps>(
    (
      {
        children,
        direction = "row",
        spacing = 1,
        justify = "flex-start",
        align = "center",
        wrap = false,
        fullWidth = false,
        nodrag = true,
        className,
        sx,
        padding,
        borderRadius,
        backgroundColor,
        border,
        divider = false,
        dividerColor
      },
      ref
    ) => {
      const theme = useTheme();

      // Convert children to array and filter out falsy values
      // Use array-based approach that works better in test environments
      const childArray = (Array.isArray(children) ? children : [children]).flat().filter(Boolean);

      // Add dividers between items if requested
      const childrenWithDividers =
        divider && childArray.length > 1
          ? childArray.reduce<React.ReactNode[]>((acc, child, index) => {
              acc.push(child);
              if (index < childArray.length - 1) {
                acc.push(
                  <Box
                    key={`divider-${index}`}
                    sx={{
                      width: direction === "row" ? "1px" : "100%",
                      height: direction === "row" ? "100%" : "1px",
                      backgroundColor:
                        dividerColor || theme.vars.palette.divider,
                      flexShrink: 0
                    }}
                  />
                );
              }
              return acc;
            }, [])
          : childArray;

      return (
        <Box
          ref={ref}
          className={cn(
            "action-button-group",
            nodrag && editorClassNames.nodrag,
            className
          )}
          sx={{
            display: "flex",
            flexDirection: direction,
            gap: spacing,
            justifyContent: justify,
            alignItems: align,
            flexWrap: wrap ? "wrap" : "nowrap",
            width: fullWidth ? "100%" : "fit-content",
            ...(padding !== undefined && { padding }),
            ...(borderRadius !== undefined && { borderRadius }),
            ...(backgroundColor && { backgroundColor }),
            ...(border && { border }),
            ...sx
          }}
        >
          {divider ? childrenWithDividers : childArray}
        </Box>
      );
    }
  )
);

ActionButtonGroup.displayName = "ActionButtonGroup";
