import React, { useState, useEffect, useRef } from "react";
import { IconButton, IconButtonProps } from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import { useClipboard } from "../../hooks/browser/useClipboard";
import { Tooltip } from "@mui/material";

const CHECKMARK_TIMEOUT = 2000;

interface CopyToClipboardButtonProps extends Omit<IconButtonProps, "onClick"> {
  textToCopy: string;
  onCopySuccess?: () => void;
  onCopyError?: (err: any) => void;
  tooltipPlacement?: "top" | "bottom" | "left" | "right";
}

export const CopyToClipboardButton: React.FC<CopyToClipboardButtonProps> = ({
  textToCopy,
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

    const hasTextToCopy = textToCopy && textToCopy.trim() !== "";

    // Don't attempt to copy if there's nothing to copy
    if (!hasTextToCopy) {
      setShowError(true);
      timeoutRef.current = setTimeout(() => {
        setShowError(false);
      }, CHECKMARK_TIMEOUT);
      return;
    }

    const sanitized = textToCopy.replace(/\u00A0/g, " ");
    writeClipboard(sanitized, true)
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
    <Tooltip title={tooltipText} placement={tooltipPlacement}>
      <IconButton
        tabIndex={-1}
        className="copy-to-clipboard-button"
        onClick={handleCopy}
        size={size}
        sx={{ color: "var(--palette-grey-100)" }}
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
