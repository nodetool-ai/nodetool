/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { useCallback, useState } from "react";
import { MuiColorInput } from "mui-color-input";
import styled from "@emotion/styled";
import { Popover, Button } from "@mui/material";
import ColorizeIcon from "@mui/icons-material/Colorize";
import { solarizedColors } from "../../constants/colors";

const colorMatrixStyle = (theme: any) => css`
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
  padding: 16px;
  margin-bottom: 16px;
`;

const ColorCell = styled.button<{ color: string | null; isEmpty: boolean }>`
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: ${({ isEmpty }) => (isEmpty ? "2px solid red" : "none")};
  background-color: ${({ color }) => color || "transparent"};
  cursor: pointer;
  &:hover {
    transform: scale(1.1);
  }
`;

const customSectionStyle = css`
  margin-top: 16px;
  padding: 16px;
`;

interface ColorPickerProps {
  color: string | null;
  onColorChange: (newColor: string | null) => void;
  label?: string;
  showCustom?: boolean;
  size?: "small" | "medium";
}

const ColorPicker: React.FC<ColorPickerProps> = ({
  color,
  onColorChange,
  label,
  showCustom = true,
  size = "medium"
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
    <>
      <Button
        className="color-picker-button action"
        onClick={handleClick}
        size={size}
      >
        {label}
        <ColorizeIcon fontSize={size} />
      </Button>
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
        <div>
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
            <div css={customSectionStyle}>
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
        </div>
      </Popover>
    </>
  );
};

export default ColorPicker;
