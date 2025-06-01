import React, { useState, useEffect, useRef } from "react";
import { IconButton, IconButtonProps } from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckIcon from "@mui/icons-material/Check";
import { useClipboard } from "../../hooks/browser/useClipboard";

const CHECKMARK_TIMEOUT = 2000;

interface CopyToClipboardButtonProps extends Omit<IconButtonProps, "onClick"> {
  textToCopy: string;
  onCopySuccess?: () => void;
  onCopyError?: (err: any) => void;
}

export const CopyToClipboardButton: React.FC<CopyToClipboardButtonProps> = ({
  textToCopy,
  onCopySuccess,
  onCopyError,
  title = "Copy to clipboard",
  size = "small",
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

    writeClipboard(textToCopy, true)
      .then(() => {
        setIsCopied(true);
        if (onCopySuccess) {
          onCopySuccess();
        }
        console.log("Text copied to clipboard!");

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

  return (
    <IconButton
      onClick={handleCopy}
      size={size}
      title={title}
      sx={{ color: "var(--c_gray4)" }}
      {...props}
    >
      {isCopied ? (
        <CheckIcon sx={{ fontSize: "0.875rem" }} />
      ) : (
        <ContentCopyIcon sx={{ fontSize: "0.875rem" }} />
      )}
    </IconButton>
  );
};
