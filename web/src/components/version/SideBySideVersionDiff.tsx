/**
 * SideBySideVersionDiff Component
 *
 * Displays two workflow versions side by side for comparison.
 * Features:
 * - Split view with synchronized navigation
 * - Color-coded nodes (green=added, red=removed, orange=modified, gray=unchanged)
 * - Version selector for each side
 * - Diff indicators
 * - Zoom controls for each view
 */

import React, { useCallback, useMemo, useState, useRef, useEffect } from "react";
import {
  Box,
  Paper,
  Typography,
  IconButton,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Tooltip,
  Chip,
  Button,
  Divider,
  Stack,
  useTheme
} from "@mui/material";
import {
  ZoomIn as ZoomInIcon,
  ZoomOut as ZoomOutIcon,
  CenterFocusStrong as ZoomResetIcon,
  SwapHoriz as SwapIcon,
  ArrowBack as ArrowBackIcon,
  ArrowForward as ArrowForwardIcon,
  History as HistoryIcon
} from "@mui/icons-material";
import { WorkflowVersion, Graph, Node } from "../../stores/ApiTypes";
import { computeGraphDiff, GraphDiff } from "../../utils/graphDiff";

interface SideBySideVersionDiffProps {
  versions: Array<WorkflowVersion & { save_type: string; size_bytes: number }>;
  initialLeftVersionId?: string | null;
  initialRightVersionId?: string | null;
  onRestore?: (version: WorkflowVersion) => void;
  width?: number;
  height?: number;
}

interface MiniGraphViewProps {
  graph: Graph | null | undefined;
  diff: GraphDiff | null;
  nodeStatusMap: Record<string, "added" | "removed" | "modified" | "unchanged">;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  versionLabel: string;
  width: number;
  height: number;
}

const NODE_WIDTH = 140;
const NODE_HEIGHT = 60;
const NODE_PADDING = 20;
const LABEL_HEIGHT = 30;

const MiniGraphView: React.FC<MiniGraphViewProps> = ({
  graph,
  diff,
  nodeStatusMap,
  zoom,
  onZoomChange,
  versionLabel,
  width,
  height
}) => {
  const theme = useTheme();
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const updateSize = () => {
      if (svgRef.current) {
        const rect = svgRef.current.getBoundingClientRect();
        // Container size is available if needed for dynamic sizing
        void rect.width;
        void rect.height;
      }
    };
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, [width, height]);

  const nodes = useMemo(() => {
    if (!graph?.nodes) {return [];}
    return graph.nodes.map((n: Node) => ({
      ...n,
      ui_properties: n.ui_properties as { position?: { x: number; y: number } } | undefined
    }));
  }, [graph]);

  const edges = useMemo(() => {
    if (!graph?.edges) {return [];}
    return graph.edges;
  }, [graph]);

  const nodePositions = useMemo(() => {
    if (nodes.length === 0) {return {};}

    const positions: Record<string, { x: number; y: number }> = {};

    const nodeCount = nodes.length;
    const cols = Math.ceil(Math.sqrt(nodeCount));
    const rows = Math.ceil(nodeCount / cols);

    const totalWidth = cols * (NODE_WIDTH + NODE_PADDING) - NODE_PADDING;
    const totalHeight = rows * (NODE_HEIGHT + NODE_PADDING) - NODE_PADDING;

    const startX = (width - totalWidth) / 2 + NODE_WIDTH / 2;
    const startY = LABEL_HEIGHT + (height - LABEL_HEIGHT - totalHeight) / 2 + NODE_HEIGHT / 2;

    nodes.forEach((node, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      positions[node.id] = {
        x: startX + col * (NODE_WIDTH + NODE_PADDING),
        y: startY + row * (NODE_HEIGHT + NODE_PADDING)
      };
    });

    return positions;
  }, [nodes, width, height]);

  const getNodeColor = (status: string) => {
    const colors = {
      added: { bg: theme.palette.success.light, border: theme.palette.success.main, text: theme.palette.success.contrastText },
      removed: { bg: theme.palette.error.light, border: theme.palette.error.main, text: theme.palette.error.contrastText },
      modified: { bg: theme.palette.warning.light, border: theme.palette.warning.main, text: theme.palette.warning.contrastText },
      unchanged: { bg: theme.palette.action.hover, border: theme.palette.divider, text: theme.palette.text.primary }
    };
    return colors[status as keyof typeof colors] || colors.unchanged;
  };

  const getEdgeColor = (sourceId: string, targetId: string) => {
    const sourceStatus = nodeStatusMap[sourceId];
    const targetStatus = nodeStatusMap[targetId];

    if (sourceStatus === "removed" || targetStatus === "removed") {
      return theme.palette.error.main;
    }
    if (sourceStatus === "added" || targetStatus === "added") {
      return theme.palette.success.main;
    }
    return theme.palette.text.disabled;
  };

  const handleZoomIn = () => onZoomChange(Math.min(zoom * 1.2, 2));
  const handleZoomOut = () => onZoomChange(Math.max(zoom / 1.2, 0.3));
  const handleZoomReset = () => onZoomChange(1);

  const zoomedWidth = width * zoom;
  const zoomedHeight = height * zoom;
  const offsetX = (width - zoomedWidth) / 2;
  const offsetY = (height - zoomedHeight) / 2;

  return (
    <Paper
      elevation={2}
      sx={{
        width,
        height,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden"
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 1,
          py: 0.5,
          bgcolor: "action.hover",
          borderBottom: 1,
          borderColor: "divider"
        }}
      >
        <Typography variant="caption" fontWeight="medium" noWrap>
          {versionLabel}
        </Typography>
        <Box sx={{ display: "flex", gap: 0.5 }}>
          <Tooltip title="Zoom Out">
            <IconButton size="small" onClick={handleZoomOut} disabled={zoom <= 0.3}>
              <ZoomOutIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Reset Zoom">
            <IconButton size="small" onClick={handleZoomReset}>
              <ZoomResetIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Zoom In">
            <IconButton size="small" onClick={handleZoomIn} disabled={zoom >= 2}>
              <ZoomInIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      <Box sx={{ flex: 1, overflow: "hidden", position: "relative" }}>
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          viewBox={`0 0 ${width} ${height}`}
          style={{ display: "block" }}
        >
          <g transform={`translate(${offsetX}, ${offsetY}) scale(${zoom})`}>
            <defs>
              <marker
                id={`arrowhead-${versionLabel.replace(/\s/g, "")}`}
                markerWidth="8"
                markerHeight="6"
                refX="7"
                refY="3"
                orient="auto"
              >
                <polygon points="0 0, 8 3, 0 6" fill={theme.palette.text.disabled} />
              </marker>
            </defs>

            {edges.map((edge, index) => {
              const sourcePos = nodePositions[edge.source ?? ""];
              const targetPos = nodePositions[edge.target ?? ""];
              if (!sourcePos || !targetPos) {return null;}

              const color = getEdgeColor(edge.source ?? "", edge.target ?? "");

              return (
                <line
                  key={`${index}-${edge.source}-${edge.target}`}
                  x1={sourcePos.x}
                  y1={sourcePos.y}
                  x2={targetPos.x}
                  y2={targetPos.y}
                  stroke={color}
                  strokeWidth={2}
                  markerEnd={`url(#arrowhead-${versionLabel.replace(/\s/g, "")})`}
                />
              );
            })}

            {nodes.map((node) => {
              const pos = nodePositions[node.id];
              const status = nodeStatusMap[node.id] || "unchanged";
              const color = getNodeColor(status);

              return (
                <g key={node.id} transform={`translate(${pos.x - NODE_WIDTH / 2}, ${pos.y - NODE_HEIGHT / 2})`}>
                  <rect
                    width={NODE_WIDTH}
                    height={NODE_HEIGHT}
                    rx={6}
                    fill={color.bg}
                    stroke={color.border}
                    strokeWidth={status !== "unchanged" ? 2 : 1}
                    opacity={status === "removed" ? 0.5 : 1}
                  />
                  <text
                    x={NODE_WIDTH / 2}
                    y={NODE_HEIGHT / 2 - 6}
                    textAnchor="middle"
                    fill={color.text}
                    fontSize={10}
                    fontWeight={status !== "unchanged" ? "bold" : "normal"}
                  >
                    {node.type?.split(".").pop() || "Node"}
                  </text>
                  <text
                    x={NODE_WIDTH / 2}
                    y={NODE_HEIGHT / 2 + 10}
                    textAnchor="middle"
                    fill={color.text}
                    fontSize={8}
                    opacity={0.8}
                  >
                    {node.id.substring(0, 8)}...
                  </text>
                  {status !== "unchanged" && (
                    <circle
                      cx={NODE_WIDTH - 8}
                      cy={8}
                      r={5}
                      fill={color.border}
                    />
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </Box>

      {diff && (
        <Box
          sx={{
            position: "absolute",
            bottom: 4,
            right: 4,
            display: "flex",
            gap: 0.5,
            bgcolor: "rgba(255,255,255,0.9)",
            borderRadius: 1,
            p: 0.5
          }}
        >
          {diff.addedNodes.length > 0 && (
            <Chip label={`+${diff.addedNodes.length}`} size="small" color="success" sx={{ height: 20, fontSize: "0.65rem" }} />
          )}
          {diff.removedNodes.length > 0 && (
            <Chip label={`-${diff.removedNodes.length}`} size="small" color="error" sx={{ height: 20, fontSize: "0.65rem" }} />
          )}
          {diff.modifiedNodes.length > 0 && (
            <Chip label={`~${diff.modifiedNodes.length}`} size="small" color="warning" sx={{ height: 20, fontSize: "0.65rem" }} />
          )}
        </Box>
      )}
    </Paper>
  );
};

export const SideBySideVersionDiff: React.FC<SideBySideVersionDiffProps> = ({
  versions,
  initialLeftVersionId = null,
  initialRightVersionId = null,
  onRestore,
  width = 400,
  height = 350
}) => {
  const [leftVersionId, setLeftVersionId] = useState<string | null>(initialLeftVersionId);
  const [rightVersionId, setRightVersionId] = useState<string | null>(initialRightVersionId);
  const [leftZoom, setLeftZoom] = useState(0.8);
  const [rightZoom, setRightZoom] = useState(0.8);

  const sortedVersions = useMemo(() => {
    return [...versions].sort((a, b) => b.version - a.version);
  }, [versions]);

  const leftVersion = useMemo(() => {
    return sortedVersions.find(v => v.id === leftVersionId) || sortedVersions[sortedVersions.length - 1];
  }, [leftVersionId, sortedVersions]);

  const rightVersion = useMemo(() => {
    return sortedVersions.find(v => v.id === rightVersionId) || sortedVersions[0];
  }, [rightVersionId, sortedVersions]);

  const diff = useMemo(() => {
    if (!leftVersion || !rightVersion) {return null;}
    const [older, newer] = leftVersion.version < rightVersion.version
      ? [leftVersion, rightVersion]
      : [rightVersion, leftVersion];
    return computeGraphDiff(older.graph as unknown as Graph, newer.graph as unknown as Graph);
  }, [leftVersion, rightVersion]);

  const nodeStatusMap = useMemo(() => {
    const map: Record<string, "added" | "removed" | "modified" | "unchanged"> = {};
    if (!diff) {return map;}

    const olderGraph = leftVersion.version < rightVersion.version ? leftVersion.graph : rightVersion.graph;
    const newerGraph = leftVersion.version < rightVersion.version ? rightVersion.graph : leftVersion.graph;

    const olderNodeIds = new Set(olderGraph?.nodes?.map((n: Node) => n.id) || []);
    const newerNodeIds = new Set(newerGraph?.nodes?.map((n: Node) => n.id) || []);

    diff.addedNodes.forEach(node => {
      map[node.id] = "added";
    });
    diff.removedNodes.forEach(node => {
      map[node.id] = "removed";
    });
    diff.modifiedNodes.forEach(nodeChange => {
      map[nodeChange.nodeId] = "modified";
    });

    const allNodeIds = new Set([...olderNodeIds, ...newerNodeIds]);
    allNodeIds.forEach(id => {
      if (!map[id]) {
        map[id] = "unchanged";
      }
    });

    return map;
  }, [diff, leftVersion, rightVersion]);

  const handleSwapVersions = useCallback(() => {
    const temp = leftVersionId;
    setLeftVersionId(rightVersionId);
    setRightVersionId(temp);
  }, [leftVersionId, rightVersionId]);

  const handleRestoreLeft = useCallback(() => {
    if (leftVersion && onRestore) {
      onRestore(leftVersion);
    }
  }, [leftVersion, onRestore]);

  const handleRestoreRight = useCallback(() => {
    if (rightVersion && onRestore) {
      onRestore(rightVersion);
    }
  }, [rightVersion, onRestore]);

  const formatVersionLabel = (version: WorkflowVersion) => {
    const date = new Date(version.created_at).toLocaleString();
    const saveType = version.save_type || "auto";
    return `v${version.version} (${saveType}) - ${date}`;
  };

  return (
    <Box sx={{ width: "100%" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
        <Typography variant="subtitle1" fontWeight="medium">
          Version Comparison
        </Typography>
        <Box sx={{ display: "flex", gap: 0.5 }}>
          <Chip
            icon={<Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "success.main" }} />}
            label="Added"
            size="small"
            sx={{ height: 20, fontSize: "0.65rem" }}
          />
          <Chip
            icon={<Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "error.main" }} />}
            label="Removed"
            size="small"
            sx={{ height: 20, fontSize: "0.65rem" }}
          />
          <Chip
            icon={<Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "warning.main" }} />}
            label="Modified"
            size="small"
            sx={{ height: 20, fontSize: "0.65rem" }}
          />
        </Box>
      </Box>

      <Box sx={{ display: "flex", gap: 2, alignItems: "flex-start" }}>
        <Box sx={{ flex: 1 }}>
          <FormControl fullWidth size="small" sx={{ mb: 1 }}>
            <InputLabel>Left Version (Older)</InputLabel>
            <Select
              value={leftVersionId || leftVersion?.id || ""}
              label="Left Version (Older)"
              onChange={(e) => setLeftVersionId(e.target.value || null)}
            >
              {sortedVersions.map((v) => (
                <MenuItem key={v.id} value={v.id}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <HistoryIcon fontSize="small" color="action" />
                    <span>{formatVersionLabel(v)}</span>
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <MiniGraphView
            graph={leftVersion?.graph}
            diff={diff}
            nodeStatusMap={nodeStatusMap}
            zoom={leftZoom}
            onZoomChange={setLeftZoom}
            versionLabel={`Version ${leftVersion?.version || 0}`}
            width={width}
            height={height - 60}
          />
          <Button
            size="small"
            onClick={handleRestoreLeft}
            disabled={!leftVersion || !onRestore}
            sx={{ mt: 1 }}
          >
            Restore This Version
          </Button>
        </Box>

        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", py: 4 }}>
          <Tooltip title="Swap versions">
            <IconButton onClick={handleSwapVersions} size="small">
              <SwapIcon />
            </IconButton>
          </Tooltip>
          <Divider sx={{ my: 1, width: 40 }} />
          <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0.5 }}>
            <ArrowBackIcon color="action" fontSize="small" />
            <Typography variant="caption" color="text.secondary">
              Time →
            </Typography>
            <ArrowForwardIcon color="action" fontSize="small" />
          </Box>
        </Box>

        <Box sx={{ flex: 1 }}>
          <FormControl fullWidth size="small" sx={{ mb: 1 }}>
            <InputLabel>Right Version (Newer)</InputLabel>
            <Select
              value={rightVersionId || rightVersion?.id || ""}
              label="Right Version (Newer)"
              onChange={(e) => setRightVersionId(e.target.value || null)}
            >
              {sortedVersions.map((v) => (
                <MenuItem key={v.id} value={v.id}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <HistoryIcon fontSize="small" color="action" />
                    <span>{formatVersionLabel(v)}</span>
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <MiniGraphView
            graph={rightVersion?.graph}
            diff={diff}
            nodeStatusMap={nodeStatusMap}
            zoom={rightZoom}
            onZoomChange={setRightZoom}
            versionLabel={`Version ${rightVersion?.version || 0}`}
            width={width}
            height={height - 60}
          />
          <Button
            size="small"
            onClick={handleRestoreRight}
            disabled={!rightVersion || !onRestore}
            sx={{ mt: 1 }}
          >
            Restore This Version
          </Button>
        </Box>
      </Box>

      {diff && diff.hasChanges && (
        <Box sx={{ mt: 2, p: 1.5, bgcolor: "action.hover", borderRadius: 1 }}>
          <Typography variant="subtitle2" gutterBottom>
            Change Summary
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {diff.addedNodes.length > 0 && (
              <Chip label={`+${diff.addedNodes.length} nodes added`} size="small" color="success" variant="outlined" />
            )}
            {diff.removedNodes.length > 0 && (
              <Chip label={`-${diff.removedNodes.length} nodes removed`} size="small" color="error" variant="outlined" />
            )}
            {diff.modifiedNodes.length > 0 && (
              <Chip label={`~${diff.modifiedNodes.length} nodes modified`} size="small" color="warning" variant="outlined" />
            )}
            {diff.addedEdges.length > 0 && (
              <Chip label={`+${diff.addedEdges.length} connections added`} size="small" color="success" variant="outlined" />
            )}
            {diff.removedEdges.length > 0 && (
              <Chip label={`-${diff.removedEdges.length} connections removed`} size="small" color="error" variant="outlined" />
            )}
          </Stack>
        </Box>
      )}
    </Box>
  );
};

export default SideBySideVersionDiff;
