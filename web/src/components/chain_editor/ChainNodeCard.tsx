/** @jsxImportSource @emotion/react */
import React, { useCallback, useMemo } from "react";
import { useTheme } from "@mui/material/styles";
import { Box, Collapse, IconButton } from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { FlexRow } from "../ui_primitives/FlexRow";
import { FlexColumn } from "../ui_primitives/FlexColumn";
import { Text } from "../ui_primitives/Text";
import { Divider } from "../ui_primitives/Divider";
import { ChainNodeProperties } from "./ChainNodeProperties";
import { OutputSelector } from "./OutputSelector";
import { InputMappingSelector } from "./InputMappingSelector";
import type { ChainNode } from "./chainTypes";
import type { TypeMetadata } from "../../stores/ApiTypes";

interface ChainNodeCardProps {
  node: ChainNode;
  index: number;
  totalNodes: number;
  prevOutputType: TypeMetadata | null;
  onToggleExpanded: () => void;
  onUpdateProperty: (name: string, value: unknown) => void;
  onSetOutput: (name: string) => void;
  onSetInputMapping: (name: string) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

const NS_COLORS: Record<string, string> = {
  text: "#3B82F6", image: "#8B5CF6", audio: "#EC4899", video: "#F97316",
  math: "#10B981", list: "#06B6D4", logic: "#F59E0B", input: "#6366F1",
  output: "#14B8A6", llm: "#8B5CF6", agents: "#F43F5E", http: "#0EA5E9", data: "#84CC16",
};

function getNsColor(ns: string): string {
  return NS_COLORS[ns.split(".").pop()?.toLowerCase() ?? ""] ?? "#6B7280";
}

function formatNs(ns: string): string {
  const parts = ns.split(".");
  return parts.length > 1 ? parts.slice(1).join(" / ") : ns;
}

export const ChainNodeCard: React.FC<ChainNodeCardProps> = ({
  node, index, totalNodes, prevOutputType,
  onToggleExpanded, onUpdateProperty, onSetOutput, onSetInputMapping,
  onRemove, onDuplicate, onMoveUp, onMoveDown,
}) => {
  const theme = useTheme();
  const nsColor = getNsColor(node.metadata.namespace);

  const configuredCount = useMemo(() => {
    return Object.keys(node.properties).filter(
      (k) => node.properties[k] !== undefined && node.properties[k] !== ""
    ).length;
  }, [node.properties]);

  return (
    <Box
      sx={{
        borderRadius: 2,
        border: `1.5px solid ${node.expanded ? `${nsColor}50` : theme.vars.palette.divider}`,
        backgroundColor: theme.vars.palette.background.paper,
        overflow: "hidden",
        transition: "border-color 0.2s",
        boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
      }}
    >
      {/* Header */}
      <FlexRow
        gap={1.5}
        align="center"
        padding={1.75}
        onClick={onToggleExpanded}
        sx={{ cursor: "pointer", "&:hover": { backgroundColor: theme.vars.palette.action.hover } }}
      >
        <Box
          sx={{
            width: 32, height: 32, borderRadius: 1.25,
            display: "flex", alignItems: "center", justifyContent: "center",
            backgroundColor: `${nsColor}18`, color: nsColor,
            fontSize: 14, fontWeight: 800,
          }}
        >
          {index + 1}
        </Box>

        <FlexColumn gap={0.25} sx={{ flex: 1, minWidth: 0 }}>
          <Text size="small" weight={700} truncate>{node.metadata.title}</Text>
          <FlexRow gap={1} align="center">
            <Text size="tiny" weight={600} sx={{ color: nsColor }}>
              {formatNs(node.metadata.namespace)}
            </Text>
            {!node.expanded && node.metadata.properties.length > 0 && (
              <Text size="tiny" color="secondary">
                {configuredCount}/{node.metadata.properties.length} configured
              </Text>
            )}
          </FlexRow>
        </FlexColumn>

        {node.expanded ? (
          <ExpandLessIcon sx={{ fontSize: 20, color: theme.vars.palette.text.secondary }} />
        ) : (
          <ExpandMoreIcon sx={{ fontSize: 20, color: theme.vars.palette.text.secondary }} />
        )}
      </FlexRow>

      {/* Expanded content */}
      <Collapse in={node.expanded} unmountOnExit>
        <FlexColumn gap={1.5} sx={{ px: 1.75, pb: 1.75 }}>
          {node.metadata.description && (
            <Text size="smaller" color="secondary" lineClamp={3}>
              {node.metadata.description}
            </Text>
          )}

          {index > 0 && (
            <InputMappingSelector
              properties={node.metadata.properties}
              selectedInput={node.inputMapping}
              sourceOutputType={prevOutputType}
              onSelect={onSetInputMapping}
            />
          )}

          <Divider spacing="compact" color="subtle" />

          <ChainNodeProperties
            nodeId={node.id}
            nodeType={node.nodeType}
            properties={node.metadata.properties}
            values={node.properties}
            connectedInput={node.inputMapping}
            onUpdate={onUpdateProperty}
          />

          {node.metadata.outputs.length > 1 && (
            <Box sx={{ pt: 1 }}>
              <OutputSelector
                outputs={node.metadata.outputs}
                selectedOutput={node.selectedOutput}
                onSelect={onSetOutput}
              />
            </Box>
          )}

          <Divider spacing="compact" color="subtle" />

          {/* Actions */}
          <FlexRow gap={0.5} align="center">
            <IconButton size="small" onClick={onMoveUp} disabled={index === 0}>
              <ArrowUpwardIcon sx={{ fontSize: 18 }} />
            </IconButton>
            <IconButton size="small" onClick={onMoveDown} disabled={index === totalNodes - 1}>
              <ArrowDownwardIcon sx={{ fontSize: 18 }} />
            </IconButton>
            <Box sx={{ flex: 1 }} />
            <IconButton size="small" onClick={onDuplicate}>
              <ContentCopyIcon sx={{ fontSize: 18 }} />
            </IconButton>
            <IconButton size="small" onClick={onRemove} sx={{ color: theme.vars.palette.error.main }}>
              <DeleteOutlineIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </FlexRow>
        </FlexColumn>
      </Collapse>
    </Box>
  );
};
