/** @jsxImportSource @emotion/react */
/**
 * Selector for wiring inputs of a node to outputs of any previous node.
 *
 * Shows all input properties and lets the user pick a source
 * (any previous node + output) for each one.
 */

import React, { useState, useCallback, useMemo } from "react";
import { useTheme } from "@mui/material/styles";
import { Box, Menu, MenuItem, ListItemText, ListItemIcon } from "@mui/material";
import InputOutlinedIcon from "@mui/icons-material/InputOutlined";
import CheckIcon from "@mui/icons-material/Check";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import CloseIcon from "@mui/icons-material/Close";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { FlexRow } from "../ui_primitives/FlexRow";
import { FlexColumn } from "../ui_primitives/FlexColumn";
import { Text } from "../ui_primitives/Text";
import { IconButton } from "@mui/material";
import type { Property, TypeMetadata } from "../../stores/ApiTypes";
import type { ChainNode, InputMappings, InputSource } from "./chainTypes";
import { areTypesCompatible } from "./chainTypes";

interface InputMappingSelectorProps {
  /** The current node's properties (potential inputs). */
  properties: Property[];
  /** Current input mappings for this node. */
  inputMappings: InputMappings;
  /** All nodes that come before this one in the chain. */
  previousNodes: ChainNode[];
  /** Called when user sets/clears a mapping. */
  onSetMapping: (inputName: string, source: InputSource | null) => void;
}

function formatType(type: TypeMetadata): string {
  if (type.type_args.length > 0) {
    return `${type.type}[${type.type_args.map((a) => a.type).join(", ")}]`;
  }
  return type.type;
}

export const InputMappingSelector: React.FC<InputMappingSelectorProps> = ({
  properties,
  inputMappings,
  previousNodes,
  onSetMapping,
}) => {
  const theme = useTheme();
  const [activeInput, setActiveInput] = useState<string | null>(null);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const mappedCount = Object.keys(inputMappings).length;

  const handleOpenPicker = useCallback(
    (inputName: string, event: React.MouseEvent<HTMLElement>) => {
      setActiveInput(inputName);
      setAnchorEl(event.currentTarget);
    },
    []
  );

  const handleSelect = useCallback(
    (source: InputSource | null) => {
      if (activeInput) {
        onSetMapping(activeInput, source);
      }
      setActiveInput(null);
      setAnchorEl(null);
    },
    [activeInput, onSetMapping]
  );

  const handleClose = useCallback(() => {
    setActiveInput(null);
    setAnchorEl(null);
  }, []);

  // Build source options for the active input
  const sourceOptions = useMemo(() => {
    if (!activeInput) return [];
    const inputProp = properties.find((p) => p.name === activeInput);
    if (!inputProp) return [];

    const options: Array<{
      node: ChainNode;
      output: { name: string; type: TypeMetadata };
      compatible: boolean;
    }> = [];

    for (const node of previousNodes) {
      for (const output of node.metadata.outputs) {
        const compatible = areTypesCompatible(output.type, inputProp.type);
        options.push({ node, output, compatible });
      }
    }

    // Sort: compatible first
    options.sort((a, b) =>
      a.compatible === b.compatible ? 0 : a.compatible ? -1 : 1
    );
    return options;
  }, [activeInput, properties, previousNodes]);

  if (properties.length === 0) return null;

  return (
    <>
      <FlexColumn gap={0.75}>
        <FlexRow gap={0.75} align="center">
          <InputOutlinedIcon
            sx={{ fontSize: 14, color: theme.vars.palette.secondary.main }}
          />
          <Text
            size="smaller"
            weight={600}
            sx={{ color: theme.vars.palette.secondary.main }}
          >
            Inputs {mappedCount > 0 ? `(${mappedCount} wired)` : ""}
          </Text>
        </FlexRow>

        {properties.map((prop) => {
          const mapping = inputMappings[prop.name];
          const sourceNode = mapping
            ? previousNodes.find((n) => n.id === mapping.sourceNodeId)
            : null;

          return (
            <Box
              key={prop.name}
              onClick={(e) => handleOpenPicker(prop.name, e)}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                px: 1.25,
                py: 0.75,
                borderRadius: 1,
                border: `1px solid ${
                  mapping
                    ? `${theme.vars.palette.secondary.main}40`
                    : theme.vars.palette.divider
                }`,
                backgroundColor: mapping
                  ? `${theme.vars.palette.secondary.main}08`
                  : "transparent",
                cursor: "pointer",
                "&:hover": {
                  backgroundColor: mapping
                    ? `${theme.vars.palette.secondary.main}14`
                    : theme.vars.palette.action.hover,
                },
                transition: "all 0.15s",
              }}
            >
              <FlexColumn gap={0} sx={{ flex: 1, minWidth: 0 }}>
                <Text
                  size="smaller"
                  weight={600}
                  sx={{
                    color: mapping
                      ? theme.vars.palette.secondary.main
                      : theme.vars.palette.text.primary,
                  }}
                >
                  {prop.title ?? prop.name}
                </Text>
                <Text size="tiny" color="secondary">
                  {formatType(prop.type)}
                </Text>
              </FlexColumn>

              {mapping && sourceNode ? (
                <FlexRow gap={0.5} align="center" sx={{ flexShrink: 1, maxWidth: "50%", minWidth: 0 }}>
                  <ArrowBackIcon
                    sx={{
                      fontSize: 10,
                      color: theme.vars.palette.secondary.main,
                    }}
                  />
                  <Text
                    size="tiny"
                    weight={600}
                    truncate
                    sx={{ color: theme.vars.palette.secondary.main }}
                  >
                    {sourceNode.metadata.title}.{mapping.sourceOutput}
                  </Text>
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSetMapping(prop.name, null);
                    }}
                    sx={{ p: 0.25 }}
                  >
                    <CloseIcon
                      sx={{
                        fontSize: 14,
                        color: theme.vars.palette.secondary.main,
                      }}
                    />
                  </IconButton>
                </FlexRow>
              ) : (
                <AddCircleOutlineIcon
                  sx={{
                    fontSize: 18,
                    color: theme.vars.palette.text.disabled,
                  }}
                />
              )}
            </Box>
          );
        })}
      </FlexColumn>

      {/* Source picker menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl) && activeInput !== null}
        onClose={handleClose}
        slotProps={{
          paper: { sx: { minWidth: 280, maxHeight: 400 } },
        }}
      >
        <MenuItem disabled sx={{ opacity: "1 !important" }}>
          <ListItemText
            primary={`Source for "${activeInput}"`}
            secondary="Pick which node output feeds this input"
            slotProps={{
              primary: { sx: { fontWeight: 700 } },
            }}
          />
        </MenuItem>

        {/* None option */}
        <MenuItem
          selected={activeInput !== null && !inputMappings[activeInput]}
          onClick={() => handleSelect(null)}
        >
          <ListItemText primary="No connection" />
        </MenuItem>

        {sourceOptions.map(({ node, output, compatible }) => {
          const isSelected =
            activeInput !== null &&
            inputMappings[activeInput]?.sourceNodeId === node.id &&
            inputMappings[activeInput]?.sourceOutput === output.name;

          return (
            <MenuItem
              key={`${node.id}-${output.name}`}
              selected={isSelected}
              onClick={() =>
                handleSelect({
                  sourceNodeId: node.id,
                  sourceOutput: output.name,
                })
              }
              sx={{ opacity: compatible ? 1 : 0.4 }}
            >
              <ListItemText
                primary={node.metadata.title}
                secondary={`.${output.name} \u2192 ${formatType(output.type)}`}
              />
              {isSelected && (
                <ListItemIcon sx={{ minWidth: "auto", ml: 1 }}>
                  <CheckIcon
                    sx={{
                      fontSize: 18,
                      color: theme.vars.palette.secondary.main,
                    }}
                  />
                </ListItemIcon>
              )}
              {!compatible && (
                <WarningAmberIcon
                  sx={{
                    fontSize: 16,
                    color: theme.vars.palette.warning.main,
                    ml: 1,
                  }}
                />
              )}
            </MenuItem>
          );
        })}
      </Menu>
    </>
  );
};
