import React, { useMemo } from "react";
import { IconButtonProps } from "@mui/material";
import { CopyButton } from "../ui_primitives";
import { serializeValue } from "../../utils/serializeValue";
import { SxProps, Theme, useTheme } from "@mui/material/styles";

interface CopyToClipboardButtonProps extends Omit<IconButtonProps, "onClick"> {
  copyValue: unknown;
  onCopySuccess?: () => void;
  onCopyError?: (err: Error) => void;
  tooltipPlacement?: "top" | "bottom" | "left" | "right";
  sx?: SxProps<Theme>;
}

// Map IconButton size to CopyButton buttonSize
const mapButtonSize = (
  size: IconButtonProps["size"]
): "small" | "medium" | "large" => {
  switch (size) {
    case "medium":
      return "medium";
    case "large":
      return "large";
    default:
      return "small";
  }
};

/**
 * CopyToClipboardButton - A wrapper around CopyButton from ui_primitives
 * that adds special serialization for complex values.
 * 
 * @deprecated Consider using CopyButton from ui_primitives directly for new code.
 */
export const CopyToClipboardButton: React.FC<CopyToClipboardButtonProps> = ({
  copyValue,
  onCopySuccess,
  onCopyError,
  title = "Copy to clipboard",
  size = "small",
  tooltipPlacement = "bottom",
  sx,
  ...props
}) => {
  const theme = useTheme();
  
  // Serialize value using the existing serializeValue utility for backward compatibility
  const resolvedText = useMemo(() => {
    if (typeof copyValue === "string") {
      return copyValue;
    }
    return serializeValue(copyValue);
  }, [copyValue]);
  
  // Replace non-breaking spaces for clipboard compatibility
  const sanitizedText = useMemo(() => {
    return resolvedText?.replace(/\u00A0/g, " ") ?? "";
  }, [resolvedText]);
  
  // Merge sx styles properly
  const mergedSx = useMemo(() => {
    const baseSx = {
      color: theme.vars.palette.text.secondary,
      "&:hover": { opacity: 0.8, color: theme.vars.palette.text.primary }
    };
    if (!sx) {
      return baseSx;
    }
    if (typeof sx === "function") {
      return { ...baseSx, ...sx(theme) };
    }
    return { ...baseSx, ...(sx as object) };
  }, [theme, sx]);

  return (
    <CopyButton
      value={sanitizedText}
      tooltip={typeof title === "string" ? title : "Copy to clipboard"}
      tooltipPlacement={tooltipPlacement}
      buttonSize={mapButtonSize(size)}
      onCopySuccess={onCopySuccess}
      onCopyError={onCopyError}
      className="copy-to-clipboard-button"
      nodrag={false}
      sx={mergedSx}
      {...props}
    />
  );
};
