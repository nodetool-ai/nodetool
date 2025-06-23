/** @jsxImportSource @emotion/react */
import { css, Global } from "@emotion/react";

import React, { useEffect, useState } from "react";
import FilterAltIcon from "@mui/icons-material/FilterAlt";
import { DATA_TYPES } from "../../config/data_types";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import {
  InputLabel,
  MenuItem,
  Select,
  Button,
  Tooltip,
  ListSubheader,
  ListItemIcon
} from "@mui/material";
import ThemeNodetool from "../themes/ThemeNodetool";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";

interface TypeFilterProps {
  selectedInputType: string;
  setSelectedInputType: (value: string) => void;
  selectedOutputType: string;
  setSelectedOutputType: (value: string) => void;
}

const TypeFilter: React.FC<TypeFilterProps> = ({
  selectedInputType,
  setSelectedInputType,
  selectedOutputType,
  setSelectedOutputType
}) => {
  const nodeTypes = DATA_TYPES;
  const comfyTypes = nodeTypes.filter((t) => t.value.startsWith("comfy"));
  const otherTypes = nodeTypes.filter((t) => !t.value.startsWith("comfy"));
  const [isVisible, setIsVisible] = useState(false);

  // Collapse/expand state for sections inside menu - separate for input and output
  const [showNodetoolInput, setShowNodetoolInput] = useState(true);
  const [showComfyInput, setShowComfyInput] = useState(false);
  const [showNodetoolOutput, setShowNodetoolOutput] = useState(true);
  const [showComfyOutput, setShowComfyOutput] = useState(false);

  const toggleNodetoolInput = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowNodetoolInput((prev) => {
      const newState = !prev;
      if (newState) {
        setShowComfyInput(false);
      }
      return newState;
    });
  };

  const toggleComfyInput = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowComfyInput((prev) => {
      const newState = !prev;
      if (newState) {
        setShowNodetoolInput(false);
      }
      return newState;
    });
  };

  const toggleNodetoolOutput = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowNodetoolOutput((prev) => {
      const newState = !prev;
      if (newState) {
        setShowComfyOutput(false);
      }
      return newState;
    });
  };

  const toggleComfyOutput = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowComfyOutput((prev) => {
      const newState = !prev;
      if (newState) {
        setShowNodetoolOutput(false);
      }
      return newState;
    });
  };

  const handleFilterToggle = () => {
    if (isVisible) {
      setSelectedInputType("");
      setSelectedOutputType("");
    }
    setIsVisible(!isVisible);
  };

  useEffect(() => {
    if (selectedInputType !== "" || selectedOutputType !== "") {
      setIsVisible(true);
    }
  }, [selectedInputType, selectedOutputType]);

  const typeFilterStyles = (theme: any) =>
    css({
      "&": {
        display: "flex",
        justifyContent: "flex-start",
        alignItems: "flex-start",
        width: "100%"
      },
      ".filter-button": {
        fontFamily: theme.fontFamily1,
        backgroundColor: theme.palette.c_gray2,
        color: theme.palette.c_gray4,
        margin: "1px 0 0 .5em",
        minHeight: "34px",
        padding: "0",
        border: "0",
        borderRadius: 5,
        boxShadow: "0 0",
        cursor: "pointer"
      },
      ".filter-button.enabled": {
        color: theme.palette.c_gray2,
        backgroundColor: theme.palette.c_gray5
      },
      ".filter-button:hover": {
        backgroundColor: theme.palette.c_gray6
      },
      ".type-filter-container": {
        display: "flex",
        flexDirection: "row",
        gap: ".5em",
        width: "500px",
        backgroundColor: theme.palette.c_gray1,
        padding: "0",
        marginLeft: ".5em"
      },
      ".type-filter": {
        width: "150px",
        margin: "0"
      },
      ".type-filter label": {
        position: "absolute",
        fontSize: theme.fontSizeNormal,
        color: ThemeNodetool.palette.c_gray4,
        padding: ".4em"
      },
      ".type-filter-select": {
        flexGrow: 1,
        width: "100%"
      },
      ".type-filter .MuiSelect-select": {
        textAlign: "left",
        fontSize: theme.fontSizeNormal,
        padding: "0 1em .1em .5em",
        height: "28px"
      }
    });

  // Global styles for menu items (not scoped to portal)
  const globalMenuItemStyles = css`
    .MuiAccordionDetails-root .type-filter-item {
      padding: 0.1em 1em;
    }
  `;

  return (
    <div css={typeFilterStyles}>
      <Global styles={globalMenuItemStyles} />
      <Tooltip
        title={
          <span className="tooltip-small">
            Filter nodes by input and output datatypes
          </span>
        }
        placement="bottom"
        enterDelay={TOOLTIP_ENTER_DELAY}
      >
        <Button
          className={isVisible ? "filter-button enabled" : "filter-button"}
          onClick={handleFilterToggle}
        >
          <FilterAltIcon />
        </Button>
      </Tooltip>
      {isVisible && (
        <div className="type-filter-container">
          <div className="type-filter">
            {!selectedInputType && (
              <InputLabel id="input-type" className="label">
                Input
              </InputLabel>
            )}
            <Select
              className="type-filter-select"
              onChange={(e) => setSelectedInputType(e.target.value)}
              size="medium"
              variant="filled"
              label="Input Type"
              value={selectedInputType}
            >
              <MenuItem style={{ color: ThemeNodetool.palette.c_hl1 }} value="">
                RESET FILTER
              </MenuItem>
              {/* Nodetool section header */}
              <ListSubheader
                onMouseDown={toggleNodetoolInput}
                sx={{
                  cursor: "pointer",
                  pointerEvents: "auto",
                  userSelect: "none",
                  display: "flex",
                  alignItems: "center",
                  backgroundColor: "var(--c_gray1)",
                  "&:hover": { backgroundColor: "rgba(0, 0, 0, 0.04)" }
                }}
                disableSticky
              >
                <ListItemIcon sx={{ minWidth: 24 }}>
                  {showNodetoolInput ? (
                    <ExpandLessIcon fontSize="small" />
                  ) : (
                    <ExpandMoreIcon fontSize="small" />
                  )}
                </ListItemIcon>
                Nodetool Types
              </ListSubheader>
              {otherTypes.map((option) => (
                <MenuItem
                  key={option.value}
                  value={option.value}
                  className={`${option.value} type-filter-item nodetool-type`}
                  sx={{ display: showNodetoolInput ? "flex" : "none" }}
                >
                  {option.label}
                </MenuItem>
              ))}

              {/* Comfy section */}
              {comfyTypes.length > 0 && [
                <ListSubheader
                  onMouseDown={toggleComfyInput}
                  sx={{
                    cursor: "pointer",
                    pointerEvents: "auto",
                    userSelect: "none",
                    display: "flex",
                    alignItems: "center",
                    backgroundColor: "var(--c_gray1)",
                    "&:hover": { backgroundColor: "rgba(0, 0, 0, 0.04)" }
                  }}
                  key="comfy-header-input"
                  disableSticky
                >
                  <ListItemIcon sx={{ minWidth: 24 }}>
                    {showComfyInput ? (
                      <ExpandLessIcon fontSize="small" />
                    ) : (
                      <ExpandMoreIcon fontSize="small" />
                    )}
                  </ListItemIcon>
                  Comfy Types
                </ListSubheader>,
                ...comfyTypes.map((option) => (
                  <MenuItem
                    key={option.value}
                    value={option.value}
                    className={`${option.value} type-filter-item comfy-type`}
                    sx={{ display: showComfyInput ? "flex" : "none" }}
                  >
                    {option.label}
                  </MenuItem>
                ))
              ]}
            </Select>
          </div>
          <div className="type-filter">
            {!selectedOutputType && (
              <InputLabel id="input-type" className="label">
                Output
              </InputLabel>
            )}
            <Select
              className="type-filter-select"
              onChange={(e) => setSelectedOutputType(e.target.value)}
              size="medium"
              variant="filled"
              label="Output Type"
              value={selectedOutputType}
            >
              <MenuItem style={{ color: ThemeNodetool.palette.c_hl1 }} value="">
                RESET FILTER
              </MenuItem>
              {/* Nodetool section header */}
              <ListSubheader
                onMouseDown={toggleNodetoolOutput}
                sx={{
                  cursor: "pointer",
                  pointerEvents: "auto",
                  userSelect: "none",
                  display: "flex",
                  alignItems: "center",
                  backgroundColor: "var(--c_gray1)",
                  "&:hover": { backgroundColor: "rgba(0, 0, 0, 0.04)" }
                }}
                disableSticky
              >
                <ListItemIcon sx={{ minWidth: 24, minHeight: "auto" }}>
                  {showNodetoolOutput ? (
                    <ExpandLessIcon fontSize="small" />
                  ) : (
                    <ExpandMoreIcon fontSize="small" />
                  )}
                </ListItemIcon>
                Nodetool
              </ListSubheader>
              {otherTypes.map((option) => (
                <MenuItem
                  key={option.value}
                  value={option.value}
                  className={`${option.value} type-filter-item nodetool-type`}
                  sx={{ display: showNodetoolOutput ? "flex" : "none" }}
                >
                  {option.label}
                </MenuItem>
              ))}

              {/* Comfy section */}
              {comfyTypes.length > 0 && [
                <ListSubheader
                  onMouseDown={toggleComfyOutput}
                  sx={{
                    cursor: "pointer",
                    pointerEvents: "auto",
                    userSelect: "none",
                    "&:hover": { backgroundColor: "rgba(0, 0, 0, 0.04)" }
                  }}
                  key="comfy-header-output"
                  disableSticky
                >
                  <ListItemIcon
                    sx={{ minWidth: 24, alignItems: "center", display: "flex" }}
                  >
                    {showComfyOutput ? (
                      <ExpandLessIcon fontSize="small" />
                    ) : (
                      <ExpandMoreIcon fontSize="small" />
                    )}
                  </ListItemIcon>
                  Comfy Types
                </ListSubheader>,
                ...comfyTypes.map((option) => (
                  <MenuItem
                    key={option.value}
                    value={option.value}
                    className={`${option.value} type-filter-item comfy-type`}
                    sx={{ display: showComfyOutput ? "flex" : "none" }}
                  >
                    {option.label}
                  </MenuItem>
                ))
              ]}
            </Select>
          </div>
        </div>
      )}
    </div>
  );
};
export default TypeFilter;
