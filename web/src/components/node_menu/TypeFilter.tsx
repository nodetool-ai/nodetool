/** @jsxImportSource @emotion/react */
import { css, Global } from "@emotion/react";

import React, { useEffect, useState } from "react";
import { DATA_TYPES, IconForType } from "../../config/data_types";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import {
  InputLabel,
  MenuItem,
  Select,
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

  // Collapse/expand state for sections inside menu - separate for input and output
  const [showNodetoolInput, setShowNodetoolInput] = useState(true);
  const [showComfyInput, setShowComfyInput] = useState(false);
  const [showNodetoolOutput, setShowNodetoolOutput] = useState(true);
  const [showComfyOutput, setShowComfyOutput] = useState(false);

  // Tooltip visibility state
  const [inputHover, setInputHover] = useState(false);
  const [outputHover, setOutputHover] = useState(false);
  const [inputSelectOpen, setInputSelectOpen] = useState(false);
  const [outputSelectOpen, setOutputSelectOpen] = useState(false);

  const inputTooltipOpen = inputHover && !inputSelectOpen;
  const outputTooltipOpen = outputHover && !outputSelectOpen;

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

  const typeFilterStyles = (theme: any) =>
    css({
      "&": {
        display: "flex",
        justifyContent: "flex-start",
        alignItems: "flex-start",
        width: "100%"
      },
      ".type-filter-container": {
        display: "flex",
        flexDirection: "row",
        gap: ".5em",
        width: "500px",
        backgroundColor: theme.palette.grey[800],
        padding: "0",
        marginLeft: ".5em"
      },
      ".type-filter": {
        width: "150px",
        height: "32px",
        margin: "0"
      },
      ".type-filter label": {
        position: "absolute",
        zIndex: 100,
        fontSize: theme.fontSizeNormal,
        color: ThemeNodetool.palette.c_gray4,
        padding: ".6em 0 0 .5em"
      },
      ".type-filter-select": {
        flexGrow: 1,
        width: "100%"
      },
      ".type-filter .MuiSelect-select": {
        display: "flex",
        alignItems: "center",
        textAlign: "left",
        fontSize: theme.fontSizeNormal,
        padding: "0 1em 0 .5em",
        height: "32px",
        lineHeight: "32px"
      },
      ".type-filter .MuiListItemIcon-root": {
        minWidth: "18px",
        marginRight: ".25em"
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
      <div className="type-filter-container">
        <Tooltip
          open={inputTooltipOpen}
          title={
            <span className="tooltip-small">
              Filter nodes by input data type
            </span>
          }
          placement="bottom"
          enterDelay={TOOLTIP_ENTER_DELAY}
        >
          <div
            className="type-filter"
            onMouseEnter={() => setInputHover(true)}
            onMouseLeave={() => setInputHover(false)}
          >
            {!selectedInputType && (
              <InputLabel id="input-type" className="label">
                Inputs
              </InputLabel>
            )}
            <Select
              className="type-filter-select"
              onChange={(e) => setSelectedInputType(e.target.value)}
              size="medium"
              variant="filled"
              label="Input Type"
              value={selectedInputType}
              onOpen={() => setInputSelectOpen(true)}
              onClose={() => {
                setInputSelectOpen(false);
                setInputHover(false);
              }}
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
                  backgroundColor: "var(--palette-grey-800)",
                  "&:hover": { backgroundColor: "rgba(0, 0, 0, 0.04)" }
                }}
                disableSticky
              >
                <ListItemIcon sx={{ minWidth: 18 }}>
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
                  <ListItemIcon>
                    <IconForType
                      iconName={option.value}
                      containerStyle={{ width: 15, height: 15 }}
                    />
                  </ListItemIcon>
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
                    backgroundColor: "var(--palette-grey-800)",
                    "&:hover": { backgroundColor: "rgba(0, 0, 0, 0.04)" }
                  }}
                  key="comfy-header-input"
                  disableSticky
                >
                  <ListItemIcon sx={{ minWidth: 18 }}>
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
                    <ListItemIcon>
                      <IconForType
                        iconName={option.value}
                        containerStyle={{ width: 20, height: 20 }}
                      />
                    </ListItemIcon>
                    {option.label}
                  </MenuItem>
                ))
              ]}
            </Select>
          </div>
        </Tooltip>
        <Tooltip
          open={outputTooltipOpen}
          title={
            <span className="tooltip-small">
              Filter nodes by output data type
            </span>
          }
          placement="bottom"
          enterDelay={TOOLTIP_ENTER_DELAY}
        >
          <div
            className="type-filter"
            onMouseEnter={() => setOutputHover(true)}
            onMouseLeave={() => setOutputHover(false)}
          >
            {!selectedOutputType && (
              <InputLabel id="output-type" className="label">
                Outputs
              </InputLabel>
            )}
            <Select
              className="type-filter-select"
              onChange={(e) => setSelectedOutputType(e.target.value)}
              size="medium"
              variant="filled"
              label="Output Type"
              value={selectedOutputType}
              onOpen={() => setOutputSelectOpen(true)}
              onClose={() => {
                setOutputSelectOpen(false);
                setOutputHover(false);
              }}
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
                  backgroundColor: "var(--palette-grey-800)",
                  "&:hover": { backgroundColor: "rgba(0, 0, 0, 0.04)" }
                }}
                disableSticky
              >
                <ListItemIcon sx={{ minWidth: 18 }}>
                  {showNodetoolOutput ? (
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
                  sx={{ display: showNodetoolOutput ? "flex" : "none" }}
                >
                  <ListItemIcon>
                    <IconForType
                      iconName={option.value}
                      containerStyle={{ width: 20, height: 20 }}
                    />
                  </ListItemIcon>
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
                    display: "flex",
                    alignItems: "center",
                    backgroundColor: "var(--palette-grey-800)",
                    "&:hover": { backgroundColor: "rgba(0, 0, 0, 0.04)" }
                  }}
                  key="comfy-header-output"
                  disableSticky
                >
                  <ListItemIcon sx={{ minWidth: 18 }}>
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
                    <ListItemIcon>
                      <IconForType
                        iconName={option.value}
                        containerStyle={{ width: 20, height: 20 }}
                      />
                    </ListItemIcon>
                    {option.label}
                  </MenuItem>
                ))
              ]}
            </Select>
          </div>
        </Tooltip>
      </div>
    </div>
  );
};
export default TypeFilter;
