/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import React, { useCallback, useState } from "react";
import { MuiColorInput } from "mui-color-input";
import { Popover, Button, Tooltip } from "@mui/material";
import { solarizedColors } from "../../constants/colors";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

const POPOVER_BUTTON_SIZE = 24;

const colorCircleCss = {
  borderRadius: "50%",
  border: "1px solid rgba(0, 0, 0, 0.75)"
};

const styles = (theme: Theme) =>
  css({
    "&": {
      position: "relative"
    },
    ".color-picker-button": {
      minWidth: "unset",
      margin: "0",
      padding: "0",
      minHeight: "unset",
      borderRadius: "50%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "transparent",
      "&:hover": {
        backgroundColor: "transparent"
      }
    },
    ".custom-selection": {
      padding: "1em"
    },
    ".custom-selection-title": {
      paddingBottom: "1em"
    }
  });

const colorMatrixStyle = (theme: Theme) =>
  css({
    display: "flex",
    flexWrap: "wrap",
    gap: "0.5em",
    padding: "1em",
    marginBottom: 4,
    width: "100%",
    maxWidth: "300px"
  });

interface ColorPickerProps {
  color: string | null;
  onColorChange: (newColor: string | null) => void;
  label?: string;
  showCustom?: boolean;
  isNodeProperty?: boolean;
  size?: number;
}

const ColorPicker: React.FC<ColorPickerProps> = ({
  color,
  onColorChange,
  label,
  showCustom = false,
  isNodeProperty = false,
  size = 15
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
          className="color-picker-button action"
          onClick={handleClick}
          sx={{
            width: size,
            height: size
          }}
        >
          {label}
          <div
            css={[
              colorCircleCss,
              {
                backgroundColor: color || "#ffffffaa",
                width: "100%",
                height: "100%"
              }
            ]}
          />
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
          horizontal: "left"
        }}
      >
        <div css={colorMatrixStyle}>
          {solarizedColors.map((cellColor, index) => (
            <Button
              key={index}
              sx={{
                borderRadius: "50%",
                cursor: "pointer",
                "&:hover": {
                  transform: "scale(1.1)"
                },
                width: POPOVER_BUTTON_SIZE,
                height: POPOVER_BUTTON_SIZE,
                minWidth: "unset",
                padding: 0,
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
