/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useCallback, useState } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { IconButton, Tooltip, CircularProgress } from "@mui/material";
import ColorizeIcon from "@mui/icons-material/Colorize";
import log from "loglevel";

// EyeDropper API types (not yet in TypeScript standard library)
interface EyeDropperResult {
  sRGBHex: string;
}

interface EyeDropperInstance {
  open(): Promise<EyeDropperResult>;
}

interface EyeDropperConstructor {
  new(): EyeDropperInstance;
}

declare global {
  interface Window {
    EyeDropper?: EyeDropperConstructor;
  }
}

const styles = (theme: Theme) =>
  css({
    "&": {
      display: "inline-flex"
    },
    ".eyedropper-button": {
      borderRadius: "4px",
      backgroundColor: theme.vars.palette.grey[800],
      border: `1px solid ${theme.vars.palette.grey[700]}`,
      "&:hover": {
        backgroundColor: theme.vars.palette.grey[700],
        borderColor: theme.vars.palette.primary.main
      },
      "&.Mui-disabled": {
        opacity: 0.5
      }
    }
  });

interface EyedropperButtonProps {
  onColorPicked: (color: string) => void;
  disabled?: boolean;
}

// Check if EyeDropper API is supported
const isEyeDropperSupported = (): boolean => {
  return typeof window !== "undefined" && "EyeDropper" in window;
};

const EyedropperButton: React.FC<EyedropperButtonProps> = ({
  onColorPicked,
  disabled = false
}) => {
  const theme = useTheme();
  const [isPicking, setIsPicking] = useState(false);
  const isSupported = isEyeDropperSupported();

  const handleClick = useCallback(async () => {
    if (!isSupported || isPicking) { return; }

    setIsPicking(true);

    try {
      if (!window.EyeDropper) { return; }
      const eyeDropper = new window.EyeDropper();
      const result = await eyeDropper.open();

      if (result?.sRGBHex) {
        onColorPicked(result.sRGBHex);
      }
    } catch (error) {
      log.debug("Eyedropper cancelled or error:", error);
    } finally {
      setIsPicking(false);
    }
  }, [isSupported, isPicking, onColorPicked]);

  if (!isSupported) {
    return null; // Don't render if not supported
  }

  return (
    <div css={styles(theme)}>
      <Tooltip title={isPicking ? "Picking color..." : "Pick color from screen"}>
        <span>
          <IconButton
            className="eyedropper-button"
            onClick={handleClick}
            disabled={disabled || isPicking}
            size="small"
          >
            {isPicking ? (
              <CircularProgress size={18} />
            ) : (
              <ColorizeIcon fontSize="small" />
            )}
          </IconButton>
        </span>
      </Tooltip>
    </div>
  );
};

export default EyedropperButton;
export { isEyeDropperSupported };
