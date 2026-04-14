/** @jsxImportSource @emotion/react */
import React, { useMemo } from "react";
import { css, keyframes } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Box, Collapse, IconButton, LinearProgress } from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import { FlexRow } from "../ui_primitives/FlexRow";
import { FlexColumn } from "../ui_primitives/FlexColumn";
import { Text } from "../ui_primitives/Text";
import { Divider } from "../ui_primitives/Divider";
import { ChainNodeProperties } from "./ChainNodeProperties";
import { OutputSelector } from "./OutputSelector";
import { InputMappingSelector } from "./InputMappingSelector";
import OutputRenderer from "../node/OutputRenderer";
import useResultsStore from "../../stores/ResultsStore";
import useStatusStore from "../../stores/StatusStore";
import type { ChainNode, InputSource } from "./chainTypes";

interface ChainNodeCardProps {
  node: ChainNode;
  index: number;
  totalNodes: number;
  workflowId: string | null;
  previousNodes: ChainNode[];
  onToggleExpanded: () => void;
  onUpdateProperty: (name: string, value: unknown) => void;
  onSetOutput: (name: string) => void;
  onSetInputMapping: (inputName: string, source: InputSource | null) => void;
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

const pulseGlow = keyframes`
  0%, 100% { box-shadow: 0 0 0 0 currentColor; }
  50% { box-shadow: 0 0 8px 2px currentColor; }
`;

const runningCardStyles = (nsColor: string) =>
  css({
    borderColor: `${nsColor}80 !important`,
    animation: `${pulseGlow} 2s ease-in-out infinite`,
    color: `${nsColor}60`,
  });

const completedCardStyles = (theme: Theme) =>
  css({
    borderColor: `${theme.vars.palette.success.main} !important`,
    transition: "border-color 0.3s",
  });

const errorCardStyles = (theme: Theme) =>
  css({
    borderColor: `${theme.vars.palette.error.main} !important`,
  });

type NodeStatus = "idle" | "running" | "booting" | "starting" | "completed" | "error";

function useNodeExecState(workflowId: string | null, nodeId: string) {
  const status = useStatusStore(
    (s) => (workflowId ? s.getStatus(workflowId, nodeId) : undefined)
  ) as NodeStatus | undefined;

  const progress = useResultsStore(
    (s) => (workflowId ? s.getProgress(workflowId, nodeId) : undefined)
  );

  const result = useResultsStore(
    (s) => {
      if (!workflowId) return undefined;
      return s.getOutputResult(workflowId, nodeId) ?? s.getResult(workflowId, nodeId);
    }
  );

  const isRunning = status === "running" || status === "booting" || status === "starting";
  const isCompleted = status === "completed";
  const isError = status === "error";

  return { status, progress, result, isRunning, isCompleted, isError };
}

function getOutputFromResult(result: unknown): unknown {
  if (result === undefined || result === null) return undefined;
  if (typeof result === "object" && !Array.isArray(result) && "output" in (result as Record<string, unknown>)) {
    return (result as Record<string, unknown>).output;
  }
  return result;
}

export const ChainNodeCard: React.FC<ChainNodeCardProps> = ({
  node, index, totalNodes, workflowId, previousNodes,
  onToggleExpanded, onUpdateProperty, onSetOutput, onSetInputMapping,
  onRemove, onDuplicate, onMoveUp, onMoveDown,
}) => {
  const theme = useTheme();
  const nsColor = getNsColor(node.metadata.namespace);

  const { progress, result, isRunning, isCompleted, isError } =
    useNodeExecState(workflowId, node.id);

  const outputValue = useMemo(() => getOutputFromResult(result), [result]);

  const cardCss = isRunning
    ? runningCardStyles(nsColor)
    : isError
      ? errorCardStyles(theme)
      : isCompleted
        ? completedCardStyles(theme)
        : undefined;

  return (
    <Box
      css={cardCss}
      sx={{
        borderRadius: 2,
        border: `1.5px solid ${node.expanded ? `${nsColor}50` : theme.vars.palette.divider}`,
        backgroundColor: theme.vars.palette.background.paper,
        overflow: "hidden",
        transition: "border-color 0.2s",
        boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
      }}
    >
      {/* Progress bar */}
      {isRunning && (
        <LinearProgress
          variant={progress ? "determinate" : "indeterminate"}
          value={progress ? (progress.progress / progress.total) * 100 : undefined}
          sx={{
            height: 3,
            backgroundColor: `${nsColor}20`,
            "& .MuiLinearProgress-bar": {
              backgroundColor: nsColor,
            },
          }}
        />
      )}

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
          {node.expanded && (
            <Text size="tiny" weight={600} sx={{ color: nsColor }}>
              {formatNs(node.metadata.namespace)}
            </Text>
          )}
        </FlexColumn>

        {/* Status indicator */}
        {isCompleted && (
          <CheckCircleOutlineIcon sx={{ fontSize: 18, color: theme.vars.palette.success.main }} />
        )}
        {isError && (
          <ErrorOutlineIcon sx={{ fontSize: 18, color: theme.vars.palette.error.main }} />
        )}

        {node.expanded ? (
          <ExpandLessIcon sx={{ fontSize: 20, color: theme.vars.palette.text.secondary }} />
        ) : (
          <ExpandMoreIcon sx={{ fontSize: 20, color: theme.vars.palette.text.secondary }} />
        )}
      </FlexRow>

      {/* Result preview (visible even when collapsed) */}
      {outputValue !== undefined && !isRunning && (
        <Box
          sx={{
            px: 1.75,
            pb: 1.5,
            ...(node.nodeType !== "nodetool.workflows.base_node.Preview" && {
              maxHeight: 300,
              overflow: "auto",
            }),
          }}
        >
          <OutputRenderer value={outputValue} />
        </Box>
      )}

      {/* Expanded content */}
      <Collapse in={node.expanded} unmountOnExit>
        <FlexColumn gap={1.5} sx={{ px: 1.75, pb: 1.75 }}>
          {node.metadata.description && (
            <Text size="smaller" color="secondary" lineClamp={3}>
              {node.metadata.description}
            </Text>
          )}

          {index > 0 && previousNodes.length > 0 && (
            <InputMappingSelector
              properties={node.metadata.properties}
              inputMappings={node.inputMappings}
              previousNodes={previousNodes}
              onSetMapping={onSetInputMapping}
            />
          )}

          <Divider spacing="compact" color="subtle" />

          <ChainNodeProperties
            nodeId={node.id}
            nodeType={node.nodeType}
            properties={node.metadata.properties}
            values={node.properties}
            connectedInputs={Object.keys(node.inputMappings)}
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
