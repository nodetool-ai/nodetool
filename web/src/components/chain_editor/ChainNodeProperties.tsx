/** @jsxImportSource @emotion/react */
/**
 * Unified field list for a chain node.
 *
 * Every property renders exactly once. Each field is either edited inline
 * or wired to a previous step's output — the link button on the field
 * toggles between the two, so inputs and properties are one list, not two.
 */
import { css } from "@emotion/react";
import React, { createElement, useCallback, useMemo, useState } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  Box,
  BORDER_RADIUS,
  MOTION,
  Z_INDEX,
  FlexColumn,
  FlexRow,
  Text,
  EditorMenu,
  EditorMenuItem,
  ListItemText,
  ListItemIcon,
  ToolbarIconButton,
  activateOnKey
} from "../ui_primitives";
import AddLinkIcon from "@mui/icons-material/AddLink";
import LinkIcon from "@mui/icons-material/Link";
import LinkOffIcon from "@mui/icons-material/LinkOff";
import CheckIcon from "@mui/icons-material/Check";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { NodeContext } from "../../contexts/NodeContext";
import { createNodeStore } from "../../stores/NodeStore";
import { EditorUiProvider } from "../editor_ui";
import { getComponentForProperty } from "../node/PropertyInput.resolver";
import type { Property, TypeMetadata } from "../../stores/ApiTypes";
import type { ChainNode, InputMappings, InputSource } from "./chainTypes";
import { areTypesCompatible } from "./chainTypes";

interface ChainNodePropertiesProps {
  nodeId: string;
  nodeType: string;
  properties: Property[];
  values: Record<string, unknown>;
  /** Which fields are wired to a previous step, and to what. */
  inputMappings: InputMappings;
  /** Nodes before this one in the chain (array index = chain index). */
  previousNodes: ChainNode[];
  onUpdate: (name: string, value: unknown) => void;
  onSetInputMapping: (inputName: string, source: InputSource | null) => void;
}

interface SourceOption {
  node: ChainNode;
  /** 1-based step number matching the badge on the node's card. */
  step: number;
  output: { name: string; type: TypeMetadata };
  compatible: boolean;
}

function formatType(type: TypeMetadata): string {
  if (type.type_args.length > 0) {
    return `${type.type}[${type.type_args.map((a) => a.type).join(", ")}]`;
  }
  return type.type;
}

/** Lazily created empty NodeStore so property components that call useNodes work. */
let emptyStore: ReturnType<typeof createNodeStore> | null = null;
function getEmptyStore() {
  if (!emptyStore) {
    emptyStore = createNodeStore();
  }
  return emptyStore;
}

/**
 * Override styles for property components inside chain cards.
 * The property components are designed for compact ReactFlow nodes —
 * here we give them more breathing room.
 */
const chainPropertyStyles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    gap: theme.spacing(3),

    /* Labels */
    "& .property-label": {
      marginBottom: theme.spacing(1),
    },
    "& .property-label label": {
      fontSize: theme.fontSizeSmall,
      fontWeight: 500,
      color: theme.vars.palette.text.secondary,
      marginBottom: 0,
    },

    /* Number inputs: give the value a visible container */
    "& .number-input": {
      width: "100%",
      borderRadius: theme.shape.borderRadius,
      backgroundColor: theme.vars.palette.action.hover,
      padding: theme.spacing(1, 1),
      cursor: "ew-resize",
    },
    "& .number-input .value": {
      fontSize: theme.fontSizeNormal,
    },

    /* Text fields and selects */
    "& .MuiOutlinedInput-root": {
      fontSize: theme.fontSizeNormal,
      minHeight: 44,
    },
  });

export const ChainNodeProperties: React.FC<ChainNodePropertiesProps> = ({
  nodeId,
  nodeType,
  properties,
  values,
  inputMappings,
  previousNodes,
  onUpdate,
  onSetInputMapping,
}) => {
  const theme = useTheme();
  const store = useMemo(() => getEmptyStore(), []);
  const cssStyles = useMemo(() => chainPropertyStyles(theme), [theme]);

  const [activeInput, setActiveInput] = useState<string | null>(null);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const handleOpenPicker = useCallback(
    (inputName: string, target: HTMLElement) => {
      setActiveInput(inputName);
      setAnchorEl(target);
    },
    []
  );

  const handleClosePicker = useCallback(() => {
    setActiveInput(null);
    setAnchorEl(null);
  }, []);

  const handleSelect = useCallback(
    (source: InputSource | null) => {
      if (activeInput) {
        onSetInputMapping(activeInput, source);
      }
      handleClosePicker();
    },
    [activeInput, onSetInputMapping, handleClosePicker]
  );

  // All source options per field, computed once per render of the list.
  const sourcesByInput = useMemo(() => {
    const map = new Map<string, SourceOption[]>();
    for (const prop of properties) {
      const options: SourceOption[] = [];
      previousNodes.forEach((node, i) => {
        for (const output of node.metadata.outputs) {
          options.push({
            node,
            step: i + 1,
            output,
            compatible: areTypesCompatible(output.type, prop.type),
          });
        }
      });
      map.set(prop.name, options);
    }
    return map;
  }, [properties, previousNodes]);

  const activeProp = activeInput
    ? properties.find((p) => p.name === activeInput)
    : undefined;
  const activeOptions = activeInput
    ? sourcesByInput.get(activeInput) ?? []
    : [];
  const compatibleOptions = activeOptions.filter((o) => o.compatible);
  const incompatibleOptions = activeOptions.filter((o) => !o.compatible);
  const activeMapping = activeInput ? inputMappings[activeInput] : undefined;

  if (properties.length === 0) {
    return (
      <Box sx={{ py: 1.5, textAlign: "center" }}>
        <Text size="smaller" color="secondary" sx={{ fontStyle: "italic" }}>
          No configurable properties
        </Text>
      </Box>
    );
  }

  const secondary = theme.vars.palette.secondary.main;
  // The connect button is offered whenever an earlier step exists, not only
  // when one is type-compatible — otherwise there is no way to open the picker
  // and see why nothing fits.
  const canConnect = previousNodes.length > 0;

  return (
    <NodeContext.Provider value={store}>
      <EditorUiProvider scope="inspector">
        <div css={cssStyles}>
          {properties.map((prop, i) => {
            const mapping = inputMappings[prop.name];
            const sourceIndex = mapping
              ? previousNodes.findIndex((n) => n.id === mapping.sourceNodeId)
              : -1;
            const sourceNode = sourceIndex >= 0 ? previousNodes[sourceIndex] : null;
            const sourceOutput = sourceNode?.metadata.outputs.find(
              (o) => o.name === mapping?.sourceOutput
            );
            const sourceCompatible =
              !sourceOutput || areTypesCompatible(sourceOutput.type, prop.type);
            const value = values[prop.name] ?? prop.default;

            if (mapping) {
              // Wired field: show where the value comes from instead of an editor.
              return (
                <FlexColumn key={prop.name} gap={0.5}>
                  <FlexRow gap={1} align="center">
                    <Text size="small" weight={500} color="secondary">
                      {prop.title ?? prop.name}
                    </Text>
                  </FlexRow>
                  <FlexRow
                    gap={1}
                    align="center"
                    onClick={(e) => handleOpenPicker(prop.name, e.currentTarget)}
                    onKeyDown={activateOnKey<HTMLDivElement>((e) =>
                      handleOpenPicker(prop.name, e.currentTarget)
                    )}
                    role="button"
                    tabIndex={0}
                    aria-haspopup="menu"
                    aria-label={`Change source for ${prop.title ?? prop.name}`}
                    sx={{
                      px: 1.5,
                      py: 1,
                      borderRadius: BORDER_RADIUS.xs,
                      border: `1px solid ${secondary}40`,
                      backgroundColor: `${secondary}08`,
                      cursor: "pointer",
                      transition: MOTION.all,
                      "&:hover": { backgroundColor: `${secondary}14` },
                    }}
                  >
                    <LinkIcon sx={{ fontSize: 16, color: secondary, flexShrink: 0 }} />
                    <FlexColumn gap={0} sx={{ flex: 1, minWidth: 0 }}>
                      <Text
                        size="small"
                        weight={600}
                        truncate
                        sx={{ color: secondary }}
                      >
                        {sourceNode
                          ? `${sourceIndex + 1} · ${sourceNode.metadata.title}`
                          : "Missing source"}
                        {mapping.sourceOutput &&
                        sourceNode &&
                        sourceNode.metadata.outputs.length > 1
                          ? ` · ${mapping.sourceOutput}`
                          : ""}
                      </Text>
                      <Text size="smaller" color="secondary">
                        {sourceOutput
                          ? formatType(sourceOutput.type)
                          : "from previous step"}
                      </Text>
                    </FlexColumn>
                    {!sourceCompatible && (
                      <WarningAmberIcon
                        titleAccess="Source type does not match this field"
                        sx={{ fontSize: 16, color: theme.vars.palette.warning.main }}
                      />
                    )}
                    <ToolbarIconButton
                      size="small"
                      ariaLabel={`Disconnect ${prop.title ?? prop.name}`}
                      tooltip="Disconnect — edit the value instead"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSetInputMapping(prop.name, null);
                      }}
                      icon={<LinkOffIcon sx={{ fontSize: 16, color: secondary }} />}
                      sx={{ p: 0.5 }}
                    />
                  </FlexRow>
                </FlexColumn>
              );
            }

            const Component = getComponentForProperty(prop);
            return (
              <Box
                className="chain-property-item"
                key={prop.name}
                sx={{ position: "relative" }}
              >
                {canConnect && (
                  <Box
                    sx={{
                      position: "absolute",
                      top: -6,
                      right: -4,
                      zIndex: Z_INDEX.raised,
                    }}
                  >
                    <ToolbarIconButton
                      size="small"
                      ariaLabel={`Connect ${prop.title ?? prop.name} to a previous step`}
                      tooltip="Use output from a previous step"
                      onClick={(e) => handleOpenPicker(prop.name, e.currentTarget)}
                      icon={
                        <AddLinkIcon sx={{ fontSize: 16, color: secondary }} />
                      }
                      sx={{
                        p: 0.5,
                        borderRadius: BORDER_RADIUS.xs,
                        border: `1px solid ${secondary}40`,
                        backgroundColor: theme.vars.palette.background.paper,
                        transition: MOTION.all,
                        "&:hover": { backgroundColor: `${secondary}20` },
                      }}
                    />
                  </Box>
                )}
                <Box sx={canConnect ? { pr: 3.5 } : undefined}>
                  {createElement(Component, {
                    property: prop,
                    value,
                    nodeType,
                    nodeId,
                    propertyIndex: `chain-${nodeId}-${i}`,
                    onChange: (v: unknown) => onUpdate(prop.name, v),
                  })}
                </Box>
              </Box>
            );
          })}
        </div>

        <EditorMenu
          anchorEl={anchorEl}
          open={Boolean(anchorEl) && activeInput !== null}
          onClose={handleClosePicker}
          paperSx={{ minWidth: 300, maxHeight: 420 }}
        >
          <EditorMenuItem disabled sx={{ opacity: "1 !important" }}>
            <ListItemText
              primary={activeProp?.title ?? activeInput ?? ""}
              secondary={
                activeProp
                  ? `Pick which step's output fills this ${formatType(activeProp.type)} field`
                  : undefined
              }
              slotProps={{ primary: { sx: { fontWeight: 600 } } }}
            />
          </EditorMenuItem>

          {activeMapping && (
            <EditorMenuItem onClick={() => handleSelect(null)}>
              <ListItemIcon sx={{ minWidth: 32 }}>
                <LinkOffIcon sx={{ fontSize: 18 }} />
              </ListItemIcon>
              <ListItemText primary="Disconnect" secondary="Edit the value manually" />
            </EditorMenuItem>
          )}

          {compatibleOptions.length === 0 && (
            <EditorMenuItem disabled>
              <ListItemText
                primary="No compatible outputs in previous steps"
                secondary={
                  activeProp
                    ? `This field takes ${formatType(activeProp.type)}`
                    : undefined
                }
              />
            </EditorMenuItem>
          )}

          {compatibleOptions.map(({ node, step, output }) => {
            const isSelected =
              activeMapping?.sourceNodeId === node.id &&
              activeMapping?.sourceOutput === output.name;
            return (
              <EditorMenuItem
                key={`${node.id}-${output.name}`}
                selected={isSelected}
                onClick={() =>
                  handleSelect({ sourceNodeId: node.id, sourceOutput: output.name })
                }
              >
                <ListItemText
                  primary={`${step} · ${node.metadata.title}`}
                  secondary={
                    node.metadata.outputs.length > 1
                      ? `${output.name} — ${formatType(output.type)}`
                      : formatType(output.type)
                  }
                />
                {isSelected && (
                  <ListItemIcon sx={{ minWidth: "auto", ml: 1 }}>
                    <CheckIcon sx={{ fontSize: 18, color: secondary }} />
                  </ListItemIcon>
                )}
              </EditorMenuItem>
            );
          })}

          {incompatibleOptions.length > 0 && (
            <EditorMenuItem disabled sx={{ opacity: "0.7 !important" }}>
              <ListItemText
                secondary={`Not compatible with ${
                  activeProp ? formatType(activeProp.type) : "this field"
                }`}
              />
            </EditorMenuItem>
          )}
          {incompatibleOptions.map(({ node, step, output }) => (
            <EditorMenuItem key={`${node.id}-${output.name}`} disabled>
              <ListItemText
                primary={`${step} · ${node.metadata.title}`}
                secondary={
                  node.metadata.outputs.length > 1
                    ? `${output.name} — ${formatType(output.type)}`
                    : formatType(output.type)
                }
              />
            </EditorMenuItem>
          ))}
        </EditorMenu>
      </EditorUiProvider>
    </NodeContext.Provider>
  );
};
