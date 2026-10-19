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
import { useTranslation } from "react-i18next";
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
  ListSubheader,
  MenuItemPrimitive,
  ToolbarIconButton,
  activateOnKey,
  ICON_SIZE
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
  const { t } = useTranslation();
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

  const activeProp = activeInput
    ? properties.find((p) => p.name === activeInput)
    : undefined;

  // Only the open picker's options are ever rendered. Building them for every
  // property cost properties × previousNodes × outputs option objects, each
  // with an `areTypesCompatible` call, on every render of an expanded card.
  const { compatibleOptions, incompatibleOptions } = useMemo(() => {
    const compatible: SourceOption[] = [];
    const incompatible: SourceOption[] = [];
    if (activeProp) {
      previousNodes.forEach((node, i) => {
        for (const output of node.metadata.outputs) {
          const option: SourceOption = {
            node,
            step: i + 1,
            output,
            compatible: areTypesCompatible(output.type, activeProp.type),
          };
          (option.compatible ? compatible : incompatible).push(option);
        }
      });
    }
    return { compatibleOptions: compatible, incompatibleOptions: incompatible };
  }, [activeProp, previousNodes]);

  const activeMapping = activeInput ? inputMappings[activeInput] : undefined;

  if (properties.length === 0) {
    return (
      <Box sx={{ py: 1.5, textAlign: "center" }}>
        <Text size="smaller" color="secondary" sx={{ fontStyle: "italic" }}>
          {t("pass3_1.chainNodeProperties.noConfigurableProperties")}
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
                    aria-label={t("pass3_1.chainNodeProperties.changeSource", { field: prop.title ?? prop.name })}
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
                    <LinkIcon sx={{ fontSize: ICON_SIZE.sm, color: secondary, flexShrink: 0 }} />
                    <FlexColumn gap={0} sx={{ flex: 1, minWidth: 0 }}>
                      <Text
                        size="small"
                        weight={600}
                        truncate
                        sx={{ color: secondary }}
                      >
                        {sourceNode
                          ? `${sourceIndex + 1} · ${sourceNode.metadata.title}`
                          : t("pass3_1.chainNodeProperties.missingSource")}
                        {mapping.sourceOutput &&
                        sourceNode &&
                        sourceNode.metadata.outputs.length > 1
                          ? ` · ${mapping.sourceOutput}`
                          : ""}
                      </Text>
                      <Text size="smaller" color="secondary">
                        {sourceOutput
                          ? formatType(sourceOutput.type)
                          : t("pass3_1.chainNodeProperties.fromPreviousStep")}
                      </Text>
                    </FlexColumn>
                    {!sourceCompatible && (
                      <WarningAmberIcon
                        titleAccess={t("pass3_1.chainNodeProperties.sourceTypeMismatch")}
                        sx={{ fontSize: ICON_SIZE.sm, color: theme.vars.palette.warning.main }}
                      />
                    )}
                    <ToolbarIconButton
                      size="small"
                      ariaLabel={t("pass3_1.chainNodeProperties.disconnectField", { field: prop.title ?? prop.name })}
                      tooltip={t("pass3_1.chainNodeProperties.disconnectTooltip")}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSetInputMapping(prop.name, null);
                      }}
                      icon={<LinkOffIcon sx={{ fontSize: ICON_SIZE.sm, color: secondary }} />}
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
                      ariaLabel={t("pass3_1.chainNodeProperties.connectField", { field: prop.title ?? prop.name })}
                      tooltip={t("pass3_1.chainNodeProperties.connectTooltip")}
                      onClick={(e) => handleOpenPicker(prop.name, e.currentTarget)}
                      icon={
                        <AddLinkIcon sx={{ fontSize: ICON_SIZE.sm, color: secondary }} />
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
          <ListSubheader
            title={
              activeProp
                ? t("pass3_1.chainNodeProperties.pickOutputDescription", { type: formatType(activeProp.type) })
                : undefined
            }
          >
            {activeProp?.title ?? activeInput ?? ""}
          </ListSubheader>

          {activeMapping && (
            <MenuItemPrimitive
              label={t("pass3_1.chainNodeProperties.disconnect")}
              secondary={t("pass3_1.chainNodeProperties.editValueManually")}
              icon={<LinkOffIcon />}
              onClick={() => handleSelect(null)}
            />
          )}

          {compatibleOptions.length === 0 && (
            <EditorMenuItem disabled>
              <ListItemText
                primary={t("pass3_1.chainNodeProperties.noCompatibleOutputs")}
                secondary={
                  activeProp
                    ? t("pass3_1.chainNodeProperties.fieldAcceptsType", { type: formatType(activeProp.type) })
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
                  <ListItemIcon>
                    <CheckIcon />
                  </ListItemIcon>
                )}
              </EditorMenuItem>
            );
          })}

          {incompatibleOptions.length > 0 && (
            <ListSubheader>
              {t("pass3_1.chainNodeProperties.notCompatibleWith", {
                type: activeProp ? formatType(activeProp.type) : t("pass3_1.chainNodeProperties.thisField")
              })}
            </ListSubheader>
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
