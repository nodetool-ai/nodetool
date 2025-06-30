import React, { useState, useEffect, useRef } from "react";
import { IconButton, IconButtonProps } from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckIcon from "@mui/icons-material/Check";
import { useClipboard } from "../../hooks/browser/useClipboard";
import { Tooltip } from "@mui/material";
import { act } from "react";

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

    const sanitized = textToCopy.replace(/\u00A0/g, " ");
    writeClipboard(sanitized, true)
      .then(() => {
        act(() => {
          setIsCopied(true);
          if (onCopySuccess) {
            onCopySuccess();
          }
          console.log("Text copied to clipboard!");

          timeoutRef.current = setTimeout(() => {
            setIsCopied(false);
          }, CHECKMARK_TIMEOUT);
        });
      })
      .catch((err: Error) => {
        if (onCopyError) {
          onCopyError(err);
        }
        console.error("Failed to copy text: ", err);
      });
  };

  return (
    <Tooltip title={title} placement={tooltipPlacement}>
      <IconButton
        tabIndex={-1}
        className="copy-to-clipboard-button"
        onClick={handleCopy}
        size={size}
        sx={{ color: "var(--palette-grey-400)" }}
        {...props}
      >
        {isCopied ? (
          <CheckIcon sx={{ fontSize: "0.875rem" }} />
        ) : (
          <ContentCopyIcon sx={{ fontSize: "0.875rem" }} />
        )}
      </IconButton>
    </Tooltip>
  );
};
