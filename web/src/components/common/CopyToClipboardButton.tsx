import React, { useState, useEffect, useRef, useMemo } from "react";
import { IconButton, IconButtonProps } from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import { useClipboard } from "../../hooks/browser/useClipboard";
import { Tooltip } from "@mui/material";
import { serializeValue } from "../../utils/serializeValue";

const CHECKMARK_TIMEOUT = 2000;
const TOOLTIP_ENTER_DELAY = 500;

interface CopyToClipboardButtonProps extends Omit<IconButtonProps, "onClick"> {
  copyValue: unknown;
  onCopySuccess?: () => void;
  onCopyError?: (err: any) => void;
  tooltipPlacement?: "top" | "bottom" | "left" | "right";
}

export const CopyToClipboardButton: React.FC<CopyToClipboardButtonProps> = ({
  copyValue,
  onCopySuccess,
  onCopyError,
  title = "Copy to clipboard",
  size = "small",
  tooltipPlacement = "bottom",
  ...props
}) => {
  const { writeClipboard } = useClipboard();
  const [isCopied, setIsCopied] = useState(false);
  const [showError, setShowError] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const resolvedText = useMemo(() => {
    if (typeof copyValue === "string") {
      return copyValue;
    }
    return serializeValue(copyValue);
  }, [copyValue]);
  const sanitizedText = useMemo(() => {
    return resolvedText?.replace(/\u00A0/g, " ") ?? null;
  }, [resolvedText]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleCopy = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Reset states
    setIsCopied(false);
    setShowError(false);

    const hasTextToCopy =
      sanitizedText !== null && sanitizedText.trim().length > 0;

    // Don't attempt to copy if there's nothing to copy
    if (!hasTextToCopy) {
      setShowError(true);
      timeoutRef.current = setTimeout(() => {
        setShowError(false);
      }, CHECKMARK_TIMEOUT);
      return;
    }

    writeClipboard(sanitizedText!, true)
      .then(() => {
        setIsCopied(true);
        if (onCopySuccess) {
          onCopySuccess();
        }
        timeoutRef.current = setTimeout(() => {
          setIsCopied(false);
        }, CHECKMARK_TIMEOUT);
      })
      .catch((err: Error) => {
        if (onCopyError) {
          onCopyError(err);
        }
        console.error("Failed to copy text: ", err);
      });
  };

  const tooltipText = showError ? "Nothing to copy" : title;

  return (
    <Tooltip
      title={tooltipText}
      enterDelay={TOOLTIP_ENTER_DELAY}
      placement={tooltipPlacement}
    >
      <IconButton
        tabIndex={-1}
        className="copy-to-clipboard-button"
        onClick={handleCopy}
        size={size}
        sx={(theme) => ({
          color: theme.vars.palette.text.secondary,
          "&:hover": { opacity: 0.8, color: theme.vars.palette.text.primary }
        })}
        {...props}
      >
        {showError ? (
          <CloseIcon
            sx={{ fontSize: "0.875rem", color: "var(--palette-error-main)" }}
          />
        ) : isCopied ? (
          <CheckIcon
            sx={{ fontSize: "0.875rem", color: "var(--palette-success-main)" }}
          />
        ) : (
          <ContentCopyIcon sx={{ fontSize: "0.875rem", color: "inherit" }} />
        )}
      </IconButton>
    </Tooltip>
  );
};
