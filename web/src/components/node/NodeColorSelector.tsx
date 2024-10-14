/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { useState, useCallback, useMemo } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Button,
  Typography,
  IconButton
} from "@mui/material";
import ColorizeIcon from "@mui/icons-material/Colorize";
import SearchInput from "../search/SearchInput";
import { createLinearGradient } from "../../utils/ColorUtils";
import { DATA_TYPES } from "../../config/data_types";
import ThemeNodetool from "../themes/ThemeNodetool";

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

export const colorSelectDialogStyles = (theme: any) =>
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
    },
    ".MuiDialog-paper": {
      width: "300px",
      height: "600px",
      overflowY: "scroll",
      padding: "0 .5em",
      borderRadius: 0
    },
    ".MuiDialogTitle-root": {
      backgroundColor: theme.palette.c_gray2,
      color: theme.palette.c_gray5,
      padding: "0.5em .75em"
    },
    ".MuiDialogContent-root": {
      backgroundColor: theme.palette.c_gray2,
      color: theme.palette.c_gray5,
      padding: "0.5em .5em 2em .5em"
    },
    ".search": {
      width: "100%",
      padding: "0 .5em",
      marginBottom: "1em",
      backgroundColor: "transparent",
      color: theme.palette.c_gray5
    }
  });

interface NodeColorSelectorProps {
  onColorChange: (color: string) => void;
  alwaysVisible?: boolean;
}

export const NodeColorSelector: React.FC<NodeColorSelectorProps> = ({
  onColorChange,
  alwaysVisible = false
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const dataTypesFiltered = useMemo(() => {
    if (searchTerm === "") return DATA_TYPES;
    return DATA_TYPES.filter((datatype) =>
      datatype.label.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [searchTerm]);

  const handleSearchChange = useCallback((search: string) => {
    setSearchTerm(search);
  }, []);

  const handleColorChangeAndClose = useCallback(
    (color: string) => {
      onColorChange(color);
      setModalOpen(false);
    },
    [onColorChange]
  );

  return (
    <div css={colorPickerButtonStyles(ThemeNodetool, alwaysVisible)}>
      <IconButton
        size="small"
        className="color-picker-button"
        onClick={() => setModalOpen(true)}
      >
        <ColorizeIcon />
      </IconButton>
      <Dialog
        css={colorSelectDialogStyles}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      >
        <DialogTitle style={{ backgroundColor: "transparent" }}>
          Select a color
        </DialogTitle>
        <div className="search">
          <SearchInput
            onSearchChange={handleSearchChange}
            focusOnTyping={true}
          />
        </div>
        <DialogContent>
          {dataTypesFiltered.map((datatype, index) => (
            <div key={datatype.slug} className="dt">
              <Button
                className="color-button"
                key={datatype + "_" + index}
                style={{
                  background: createLinearGradient(
                    datatype.color,
                    140,
                    "to right",
                    "lighten"
                  )
                }}
                onClick={() => handleColorChangeAndClose(datatype.color)}
              >
                <Typography
                  style={{
                    color: datatype.textColor
                  }}
                >
                  {datatype.label}
                </Typography>
              </Button>
            </div>
          ))}
        </DialogContent>
      </Dialog>
    </div>
  );
};
