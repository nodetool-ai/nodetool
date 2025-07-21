/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import React, { useCallback, useState } from "react";
import { MuiColorInput } from "mui-color-input";
import { Popover, Button, Tooltip } from "@mui/material";
import { solarizedColors } from "../../constants/colors";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

const PALETTE_BUTTON_SIZE = 28;

const styles = (theme: Theme) =>
  css({
    "&": {
      position: "relative",
      width: "100%",
      height: "100%"
    },
    ".open-colors-button": {
      borderRadius: "50%",
      backgroundColor: "transparent",
      border: "1px solid rgba(0, 0, 0, 0.75)",
      minWidth: "unset !important",
      minHeight: "unset !important"
    }
  });

const colorMatrixStyle = (theme: Theme) =>
  css({
    display: "flex",
    flexWrap: "wrap",
    gap: "0.25em",
    padding: "0.5em",
    marginBottom: 4,
    width: "100%",
    maxWidth: "300px",
    ".pick-color-button": {
      borderRadius: "50%",
      border: "1px solid rgba(0, 0, 0, 0.75)",
      minWidth: "unset !important",
      minHeight: "unset !important",
      width: PALETTE_BUTTON_SIZE,
      height: PALETTE_BUTTON_SIZE
    }
  });

interface ColorPickerProps {
  color: string | null;
  onColorChange: (newColor: string | null) => void;
  label?: string;
  showCustom?: boolean;
  isNodeProperty?: boolean;
  buttonSize?: number;
}

const ColorPicker: React.FC<ColorPickerProps> = ({
  color,
  onColorChange,
  label,
  showCustom = false,
  isNodeProperty = false,
  buttonSize = 20
}) => {
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const open = Boolean(anchorEl);
  const id = open ? "color-picker-popover" : undefined;

  const handleColorCellClick = useCallback(
    (newColor: string | null) => {
      onColorChange(newColor);
      handleClose();
    },
    [onColorChange]
  );

  return (
    <div className="color-picker" css={styles}>
      <Tooltip
        title="Set color"
        placement="bottom"
        enterDelay={TOOLTIP_ENTER_DELAY}
      >
        <Button
          className="open-colors-button"
          onClick={handleClick}
          sx={{
            width: buttonSize,
            height: buttonSize,
            backgroundColor: color || "#ffffffaa"
          }}
        >
          {label}
        </Button>
      </Tooltip>
      <Popover
        id={id}
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "left"
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "center"
        }}
      >
        <div css={colorMatrixStyle}>
          {solarizedColors.map((cellColor, index) => (
            <Button
              key={index}
              className="pick-color-button"
              sx={{
                borderRadius: "50%",
                cursor: "pointer",
                "&:hover": {
                  transform: "scale(1.1)"
                },
                width: buttonSize,
                height: buttonSize,
                border: cellColor === null ? "2px dashed gray" : "none",
                backgroundColor: cellColor || "transparent"
              }}
              onClick={() => handleColorCellClick(cellColor)}
            />
          ))}
        </div>
        {showCustom && (
          <div className="custom-selection">
            <div className="custom-selection-title">CUSTOM</div>
            <MuiColorInput
              format="hex"
              value={color || ""}
              onChange={(newColor) => {
                onColorChange(newColor);
              }}
            />
          </div>
        )}
      </Popover>
    </div>
  );
};

export default ColorPicker;
