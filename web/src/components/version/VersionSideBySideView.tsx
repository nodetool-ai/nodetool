/**
 * VersionSideBySideView Component
 *
 * Displays two workflow versions side-by-side for visual comparison.
 * Shows a mini visualization of each version's graph structure.
 */

import React, { useMemo } from "react";
import { Box, Typography, Paper, useTheme } from "@mui/material";
import { WorkflowVersion, Graph } from "../../stores/ApiTypes";
import { GraphDiff } from "../../utils/graphDiff";
import GraphVisualDiff from "./GraphVisualDiff";

interface VersionSideBySideViewProps {
  olderVersion: WorkflowVersion;
  newerVersion: WorkflowVersion;
  olderGraph: Graph | null | undefined;
  newerGraph: Graph | null | undefined;
  diff: GraphDiff | null;
}

export const VersionSideBySideView: React.FC<VersionSideBySideViewProps> = ({
  olderVersion,
  newerVersion,
  olderGraph,
  newerGraph,
  diff
}) => {
  const theme = useTheme();

  const width = 280;
  const height = 140;

  const olderGraphWithNodes = useMemo(() => {
    if (olderGraph) {
      return olderGraph;
    }
    return {
      nodes: olderVersion.graph?.nodes || [],
      edges: olderVersion.graph?.edges || []
    } as Graph;
  }, [olderVersion, olderGraph]);

  const newerGraphWithNodes = useMemo(() => {
    if (newerGraph) {
      return newerGraph;
    }
    return {
      nodes: newerVersion.graph?.nodes || [],
      edges: newerVersion.graph?.edges || []
    } as Graph;
  }, [newerVersion, newerGraph]);

  const sideBySideDiff: GraphDiff = useMemo(() => {
    if (diff) {
      return diff;
    }
    return {
      addedNodes: [],
      removedNodes: [],
      modifiedNodes: [],
      addedEdges: [],
      removedEdges: [],
      modifiedEdges: [],
      hasChanges: false
    };
  }, [diff]);

  return (
    <Paper
      elevation={0}
      sx={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        bgcolor: theme.palette.action.hover,
        borderRadius: 1,
        overflow: "hidden"
      }}
    >
      <Box
        sx={{
          p: 1.5,
          borderBottom: 1,
          borderColor: "divider",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between"
        }}
      >
        <Typography variant="subtitle2" fontWeight="medium">
          Side-by-Side Comparison
        </Typography>
        <Typography variant="caption" color="text.secondary">
          v{olderVersion.version} → v{newerVersion.version}
        </Typography>
      </Box>

      <Box
        sx={{
          display: "flex",
          gap: 1,
          p: 1
        }}
      >
        <Box sx={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <Typography
            variant="caption"
            color="text.secondary"
            fontWeight="medium"
            sx={{ mb: 0.5, textAlign: "center" }}
          >
            Version {olderVersion.version}
            {olderVersion.name && ` - ${olderVersion.name}`}
          </Typography>
          <Box
            sx={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              bgcolor: theme.palette.background.paper,
              borderRadius: 1,
              border: 1,
              borderColor: "divider"
            }}
          >
            <GraphVisualDiff
              diff={sideBySideDiff}
              oldGraph={olderGraphWithNodes}
              newGraph={olderGraphWithNodes}
              width={width}
              height={height}
            />
          </Box>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ mt: 0.5, textAlign: "center" }}
          >
            {olderVersion.graph?.nodes?.length || 0} nodes, {olderVersion.graph?.edges?.length || 0} edges
          </Typography>
        </Box>

        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "text.secondary"
          }}
        >
          <Typography variant="h6" color="action.disabled">→</Typography>
        </Box>

        <Box sx={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <Typography
            variant="caption"
            color="text.secondary"
            fontWeight="medium"
            sx={{ mb: 0.5, textAlign: "center" }}
          >
            Version {newerVersion.version}
            {newerVersion.name && ` - ${newerVersion.name}`}
          </Typography>
          <Box
            sx={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              bgcolor: theme.palette.background.paper,
              borderRadius: 1,
              border: 1,
              borderColor: "divider"
            }}
          >
            <GraphVisualDiff
              diff={sideBySideDiff}
              oldGraph={newerGraphWithNodes}
              newGraph={newerGraphWithNodes}
              width={width}
              height={height}
            />
          </Box>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ mt: 0.5, textAlign: "center" }}
          >
            {newerVersion.graph?.nodes?.length || 0} nodes, {newerVersion.graph?.edges?.length || 0} edges
          </Typography>
        </Box>
      </Box>

      {diff && diff.hasChanges && (
        <Box
          sx={{
            p: 1,
            borderTop: 1,
            borderColor: "divider",
            display: "flex",
            gap: 1,
            justifyContent: "center"
          }}
        >
          {diff.addedNodes.length > 0 && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  bgcolor: theme.palette.success.main
                }}
              />
              <Typography variant="caption" color="success.main">
                +{diff.addedNodes.length}
              </Typography>
            </Box>
          )}
          {diff.removedNodes.length > 0 && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  bgcolor: theme.palette.error.main
                }}
              />
              <Typography variant="caption" color="error.main">
                -{diff.removedNodes.length}
              </Typography>
            </Box>
          )}
          {diff.modifiedNodes.length > 0 && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  bgcolor: theme.palette.warning.main
                }}
              />
              <Typography variant="caption" color="warning.main">
                ~{diff.modifiedNodes.length}
              </Typography>
            </Box>
          )}
          {diff.addedEdges.length > 0 && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  bgcolor: theme.palette.info.main
                }}
              />
              <Typography variant="caption" color="info.main">
                +{diff.addedEdges.length} conn
              </Typography>
            </Box>
          )}
        </Box>
      )}
    </Paper>
  );
};

export default VersionSideBySideView;
