/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { useCallback, useState } from "react";
import { MuiColorInput } from "mui-color-input";
import styled from "@emotion/styled";
import { Popover, Button, Tooltip } from "@mui/material";
import { solarizedColors } from "../../constants/colors";
import {
  TOOLTIP_ENTER_NEXT_DELAY,
  TOOLTIP_LEAVE_DELAY
} from "../node/BaseNode";
import { TOOLTIP_ENTER_DELAY } from "../node/BaseNode";

const ColorCircle = styled.div<{ color: string | null }>`
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background-color: ${({ color }) => color || "#808080"};
  border: 1px solid rgba(0, 0, 0, 0.2);
`;

const styles = (theme: any) =>
  css({
    "&": {
      background: "transparent",
      position: "absolute",
      zIndex: 100,
      width: "12px",
      height: "12px",
      left: 5,

      bottom: 5,
      padding: 0,
      margin: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    },
    ".color-picker-button": {
      width: "100%",
      height: "100%",
      minWidth: "unset",
      boxShadow: "0 0 2px" + theme.palette.c_gray0,
      borderRadius: "100%",
      pointerEvents: "all",
      margin: 0,
      padding: 0,
      overflow: "hidden",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      opacity: 0.6,
      transition: "all 0.2s ease",
      "&:hover": {
        opacity: 1,
        background: "transparent"
      },
      "& .color-circle": {
        width: "100%",
        height: "100%",
        position: "relative"
      }
    },
    ".custom-selection": {
      marginTop: 16,
      padding: 16
    }
  });

const colorMatrixStyle = (theme: any) =>
  css({
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 4,
    padding: 16,
    marginBottom: 16
  });

const ColorCell = styled.button<{ color: string | null; isEmpty: boolean }>`
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: ${({ isEmpty }) => (isEmpty ? "2px dashed gray" : "none")};
  background-color: ${({ color }) => color || "transparent"};
  cursor: pointer;
  &:hover {
    transform: scale(1.1);
  }
`;

interface ColorPickerProps {
  color: string | null;
  onColorChange: (newColor: string | null) => void;
  label?: string;
  showCustom?: boolean;
}

const ColorPicker: React.FC<ColorPickerProps> = ({
  color,
  onColorChange,
  label,
  showCustom = false
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
        <Button className="color-picker-button action" onClick={handleClick}>
          {label}
          <ColorCircle className="color-circle" color={color || "#ffffffaa"} />
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
            <ColorCell
              key={index}
              color={cellColor || ""}
              isEmpty={cellColor === null}
              onClick={() => handleColorCellClick(cellColor)}
            />
          ))}
        </div>
        {showCustom && (
          <div className="custom-selection">
            <div>CUSTOM</div>
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
