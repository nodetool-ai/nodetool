import React, { useCallback, useState } from "react";
import { StateIconButton } from "../ui_primitives";
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
    <StateIconButton
      icon={<ColorizeIcon fontSize="small" />}
      tooltip={isPicking ? "Picking color..." : "Pick color from screen"}
      onClick={handleClick}
      disabled={disabled || isPicking}
      isLoading={isPicking}
      size="small"
      className="eyedropper-button"
      sx={(theme) => ({
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
      })}
    />
  );
};

export default EyedropperButton;
export { isEyeDropperSupported };
