/** @jsxImportSource @emotion/react */
/**
 * DynamicInputButton
 *
 * Bottom-left "+ Add another X" action used by ContentCardBody and
 * editing-node bodies that opt into `editableDynamicInputs`. Pure
 * presentational primitive — call sites supply `onAdd` and (optionally)
 * an item label like "image input", "text input", or "variable" so the
 * default copy reads "+ Add another <item>".
 */

import React, { memo, useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import { Button } from "@mui/material";

const styles = (theme: Theme) =>
  css({
    "&.dynamic-input-button": {
      textTransform: "none",
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeSmall,
      fontWeight: 500,
      letterSpacing: "0.01em",
      color: theme.vars.palette.text.secondary,
      backgroundColor: "transparent",
      border: `1px dashed ${theme.vars.palette.grey[600]}`,
      borderRadius: "var(--rounded-sm)",
      padding: "4px 10px",
      minWidth: 0,
      gap: 6,
      transition:
        "color 0.15s ease, border-color 0.15s ease, background-color 0.15s ease",
      "&:hover": {
        color: theme.vars.palette.primary.main,
        borderColor: theme.vars.palette.primary.main,
        backgroundColor: `${theme.vars.palette.primary.main}14`
      },
      "&.Mui-disabled": {
        opacity: 0.5
      },
      "& .MuiButton-startIcon": {
        margin: 0
      },
      "& svg": {
        fontSize: 16
      }
    }
  });

export interface DynamicInputButtonProps {
  /**
   * Full label override. When set, takes precedence over `itemLabel`.
   * @example "Add variable"
   */
  label?: string;
  /**
   * Type of input being added — fills the template
   * "+ Add another {itemLabel}". Ignored if `label` is set.
   * @default "input"
   */
  itemLabel?: string;
  /** Click handler */
  onAdd: () => void;
  /** Disabled state */
  disabled?: boolean;
  className?: string;
}

const DynamicInputButtonInner: React.FC<DynamicInputButtonProps> = ({
  label,
  itemLabel = "input",
  onAdd,
  disabled = false,
  className
}) => {
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);
  const text = label ?? `Add another ${itemLabel}`;

  return (
    <Button
      css={cssStyles}
      className={`dynamic-input-button nodrag ${className ?? ""}`}
      onClick={onAdd}
      disabled={disabled}
      startIcon={<AddIcon />}
      aria-label={text}
      size="small"
    >
      {text}
    </Button>
  );
};

export const DynamicInputButton = memo(DynamicInputButtonInner);
DynamicInputButton.displayName = "DynamicInputButton";

export default DynamicInputButton;
