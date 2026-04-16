/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { useCallback, useState, useRef } from "react";
import { Popover, Button } from "@mui/material";
import { Tooltip } from "../ui_primitives";
import { colorPickerColors } from "../../constants/colors";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { ColorPickerModal } from "../color_picker";

const PALETTE_BUTTON_SIZE = 28;

const styles = (theme: Theme) =>
  css({
    "&": {
      position: "relative",
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    },
    ".open-colors-button": {
      borderRadius: "var(--rounded-circle)",
      backgroundColor: "transparent",
      border: `1px solid ${theme.vars.palette.grey[600] || "rgba(100, 100, 100, 0.75)"}`,
      padding: 0,
      minWidth: "unset !important",
      minHeight: "unset !important",
      boxShadow: `0 0 0 1px ${theme.vars.palette.grey[900] || "rgba(0, 0, 0, 0.5)"}`,
      transition: "all 0.15s ease",
      "&:hover": {
        transform: "scale(1.1)",
        boxShadow: `0 0 0 2px ${theme.vars.palette.grey[800] || "rgba(0, 0, 0, 0.7)"}`
      }
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
      borderRadius: "var(--rounded-circle)",
      border: `1px solid ${theme.vars.palette.grey[900] || "rgba(0, 0, 0, 0.75)"}`,
      minWidth: "unset",
      minHeight: "unset",
      width: PALETTE_BUTTON_SIZE,
      height: PALETTE_BUTTON_SIZE
    },
    ".custom-button": {
      width: "100%",
      marginTop: "8px",
      fontSize: "11px",
      textTransform: "none"
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
  buttonSize = 20
}) => {
  const theme = useTheme();
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);
  const [showModal, setShowModal] = useState(false);
  const currentColorRef = useRef(color || "#ffffff");

  const handleClick = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  }, []);

  const handleClose = useCallback(() => {
    setAnchorEl(null);
  }, []);

  const open = Boolean(anchorEl);
  const id = open ? "color-picker-popover" : undefined;

  const handleColorCellClick = useCallback(
    (newColor: string | null) => {
      onColorChange(newColor);
      handleClose();
    },
    [onColorChange, handleClose]
  );

  const handleOpenModal = useCallback(() => {
    currentColorRef.current = color || "#ffffff";
    setShowModal(true);
    handleClose();
  }, [color, handleClose]);

  const handleModalChange = useCallback(
    (newColor: string, alpha: number) => {
      // Convert to hex with alpha if needed
      if (alpha < 1) {
        const alphaHex = Math.round(alpha * 255)
          .toString(16)
          .padStart(2, "0");
        onColorChange(newColor + alphaHex);
      } else {
        onColorChange(newColor);
      }
    },
    [onColorChange]
  );

  const handleModalClose = useCallback(() => {
    setShowModal(false);
  }, []);

  // Handle color cell click using data attribute to avoid creating new functions in map
  const handleColorCellButtonClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      const button = event.currentTarget;
      const isNullColor = button.getAttribute('data-color-null') === 'true';
      const cellColor: string | null = isNullColor ? null : button.getAttribute('data-color');
      handleColorCellClick(cellColor);
    },
    [handleColorCellClick]
  );

  return (
    <div className="color-picker" css={styles(theme)}>
      <Tooltip
        title="Set color"
        placement="bottom"
        delay={TOOLTIP_ENTER_DELAY}
      >
        <Button
          className="open-colors-button"
          onClick={handleClick}
          style={{
            color: "white",
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
        <div css={colorMatrixStyle(theme)}>
          {colorPickerColors.map((cellColor) => (
            <Button
              key={String(cellColor)}
              className="pick-color-button"
              {...(cellColor === null
                ? { 'data-color-null': 'true' }
                : { 'data-color': cellColor })}
              sx={{
                borderRadius: "var(--rounded-circle)",
                cursor: "pointer",
                "&:hover": {
                  transform: "scale(1.1)"
                },
                width: PALETTE_BUTTON_SIZE,
                height: PALETTE_BUTTON_SIZE,
                border: cellColor === null ? "2px dashed gray" : "none",
                backgroundColor: cellColor || "transparent"
              }}
              onClick={handleColorCellButtonClick}
            />
          ))}
          {showCustom && (
            <Button
              className="custom-button"
              variant="outlined"
              size="small"
              onClick={handleOpenModal}
            >
              Custom Color...
            </Button>
          )}
        </div>
      </Popover>

      {/* Professional Color Picker Modal */}
      {showModal && (
        <ColorPickerModal
          color={currentColorRef.current}
          alpha={1}
          onChange={handleModalChange}
          onClose={handleModalClose}
          showGradient={true}
          showContrast={true}
        />
      )}
    </div>
  );
};

export default ColorPicker;
