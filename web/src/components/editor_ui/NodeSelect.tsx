/** @jsxImportSource @emotion/react */
/**
 * NodeSelect, NodeMenuItem, and NodeSelectPrimitive
 *
 * Select primitives for editor/node UI that apply consistent styling
 * via sx/slotProps and maintain nodrag behavior.
 *
 * Accepts semantic props for state-based styling:
 * - `changed`: Shows visual indicator when value differs from default
 * - `invalid`: Shows error state styling
 * - `density`: Controls compact vs normal sizing
 */

import { useMemo, memo, type Ref } from "react";
import {
  Select,
  SelectProps,
  MenuItem,
  MenuItemProps,
  FormControl
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useEditorScope } from "./EditorUiContext";
import { editorUiClasses } from "../../constants/editorUiClasses";
import { editorClassNames, cn } from "./editorUtils";

export interface NodeSelectProps extends Omit<SelectProps, "size"> {
  /**
   * Additional class name for the root element.
   */
  className?: string;
  /**
   * Value differs from default — shows visual indicator (right border)
   */
  changed?: boolean;
  /**
   * Validation failed — shows error state
   */
  invalid?: boolean;
  /**
   * Density variant
   */
  density?: "compact" | "normal";
  ref?: Ref<HTMLDivElement>;
}

/**
 * A styled Select for use in node properties and editor UI.
 * Applies editor tokens for consistent styling and maintains nodrag behavior.
 *
 * @example
 * <NodeSelect
 *   value={value}
 *   onChange={(e) => onChange(e.target.value)}
 *   changed={hasChanged}
 *   invalid={hasError}
 * >
 *   <NodeMenuItem value="option1">Option 1</NodeMenuItem>
 *   <NodeMenuItem value="option2">Option 2</NodeMenuItem>
 * </NodeSelect>
 */
export function NodeSelect({
  className,
  sx,
  MenuProps,
  changed,
  invalid,
  density = "compact",
  children,
  ref,
  ...props
}: NodeSelectProps) {
  const theme = useTheme();
  const scope = useEditorScope();
  const scopeClass =
    scope === "inspector"
      ? editorUiClasses.scopeInspector
      : editorUiClasses.scopeNode;

  const fontSize =
    scope === "inspector" ? theme.fontSizeSmall : theme.fontSizeSmaller;
  const height = density === "compact" ? 24 : 28;

  const selectSx = useMemo(
    () => ({
      fontSize,
      height,
      ...(invalid && {
        "& .MuiOutlinedInput-notchedOutline": {
          borderColor: theme.vars.palette.error.main
        }
      }),
      ...sx
    }),
    [fontSize, height, invalid, theme, sx]
  );

  return (
    <FormControl
      fullWidth
      size="small"
      ref={ref}
      className={cn(editorClassNames.nodrag, className)}
    >
      <Select
        className={cn(
          editorClassNames.nodrag,
          editorUiClasses.control,
          scopeClass
        )}
        variant="outlined"
        size="small"
        MenuProps={{
          anchorOrigin: {
            vertical: "bottom",
            horizontal: "left"
          },
          transformOrigin: {
            vertical: "top",
            horizontal: "left"
          },
          ...MenuProps,
          PaperProps: {
            ...MenuProps?.PaperProps,
            className: cn(
              editorUiClasses.menuPaper,
              (MenuProps?.PaperProps as { className?: string } | undefined)
                ?.className
            )
          },
          classes: {
            paper: editorUiClasses.menuPaper,
            list: editorUiClasses.menuList
          }
        }}
        sx={selectSx}
        {...props}
      >
        {children}
      </Select>
    </FormControl>
  );
}

export default memo(NodeSelect);

export interface NodeMenuItemProps extends MenuItemProps {
  /**
   * Additional class name for the root element.
   */
  className?: string;
  ref?: Ref<HTMLLIElement>;
}

/**
 * A styled MenuItem for use with NodeSelect.
 * Applies editor tokens for consistent styling.
 *
 * @example
 * <NodeSelect value={value} onChange={handleChange}>
 *   <NodeMenuItem value="option1">Option 1</NodeMenuItem>
 * </NodeSelect>
 */
function NodeMenuItemBase({ className, sx, ref, ...props }: NodeMenuItemProps) {
  return (
    <MenuItem
      ref={ref}
      className={cn(editorUiClasses.menuItem, className)}
      sx={sx}
      {...props}
    />
  );
}

const NodeMenuItem = memo(NodeMenuItemBase);

export { NodeMenuItem };
