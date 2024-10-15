/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { useMemo, useCallback, useState } from "react";
import { MuiColorInput } from "mui-color-input";
import { styled } from "@mui/system";
import { Popover, IconButton } from "@mui/material";
import ThemeNodetool from "../themes/ThemeNodetool";
import ColorizeIcon from "@mui/icons-material/Colorize";
import { DATA_TYPES } from "../../config/data_types";

const ColorMatrix = styled("div")({
  display: "grid",
  gridTemplateColumns: "repeat(10, 1fr)",
  gap: "4px",
  padding: "16px",
  marginBottom: "16px"
});

const ColorCell = styled("button")(({ color }) => ({
  width: "24px",
  height: "24px",
  borderRadius: "50%",
  border: "none",
  backgroundColor: color,
  cursor: "pointer",
  "&:hover": {
    transform: "scale(1.1)"
  }
}));

const CustomSection = styled("div")({
  marginTop: "16px",
  padding: "16px"
});

interface ColorPickerProps {
  color: string;
  onColorChange: (newColor: string) => void;
}

export const colorPickerButtonStyles = (theme: any, alwaysVisible: boolean) =>
  css({
    ".color-picker-button": {
      pointerEvents: "all",
      opacity: alwaysVisible ? 1 : 0,
      position: "absolute",
      bottom: "0",
      margin: 0,
      right: "1em",
      left: "unset",
      width: ".85em",
      height: ".85em",
      zIndex: 10000,
      backgroundColor: theme.palette.c_gray2,
      borderRadius: ".1em 0  0 0",
      "& svg": {
        color: theme.palette.c_gray5,
        width: ".6em",
        height: ".6em",
        scale: ".9",
        rotate: "-86deg"
      },
      "&:hover svg": {
        color: theme.palette.c_hl1
      }
    },
    "&:hover .color-picker-button": {
      opacity: 1
    }
  });

export const styles = (theme: any) =>
  css({
    ".color-button": {
      width: "98%",
      height: "2em",
      borderRadius: "2px",
      alignItems: "center",
      justifyContent: "start",
      border: "none",
      "&:hover": {
        opacity: 0.6
      },
      p: {
        fontSize: ThemeNodetool.fontSizeSmall,
        fontFamily: ThemeNodetool.fontFamily2,
        wordSpacing: "-3px",
        textAlign: "left",
        fontWeight: "bold"
      }
    }
  });

const ColorPicker: React.FC<ColorPickerProps> = ({ color, onColorChange }) => {
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const open = Boolean(anchorEl);
  const id = open ? "color-picker-popover" : undefined;

  const colorMatrix = useMemo(() => {
    return DATA_TYPES.map((datatype) => datatype.color).sort();
  }, []);

  const handleColorCellClick = useCallback(
    (newColor: string) => {
      onColorChange(newColor);
      handleClose();
    },
    [onColorChange]
  );

  return (
    <div css={colorPickerButtonStyles(ThemeNodetool, false)}>
      <IconButton
        size="small"
        className="color-picker-button"
        onClick={handleClick}
      >
        <ColorizeIcon />
      </IconButton>
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
          <ColorMatrix>
            {colorMatrix.map((cellColor, index) => (
              <ColorCell
                key={index}
                color={cellColor}
                onClick={() => handleColorCellClick(cellColor)}
              />
            ))}
          </ColorMatrix>
          <CustomSection>
            <div>CUSTOM</div>
            <MuiColorInput
              format="hex"
              value={color}
              onChange={(newColor) => {
                onColorChange(newColor);
              }}
            />
          </CustomSection>
        </div>
      </Popover>
    </div>
  );
};

export default ColorPicker;
