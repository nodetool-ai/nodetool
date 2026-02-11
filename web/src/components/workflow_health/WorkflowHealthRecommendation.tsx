/** @jsxImportSource @emotion/react */
import React, { memo } from "react";
import { Alert, Box, Typography, useTheme, Button, Collapse } from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import type { HealthRecommendation } from "../../stores/WorkflowHealthStore";

export interface RecommendationCardProps {
  recommendation: HealthRecommendation;
  onNodeClick?: (nodeId: string) => void;
}

/**
 * WorkflowHealthRecommendation displays a single health recommendation.
 *
 * Shows actionable insights with appropriate severity styling and
 * optional navigation to affected nodes.
 *
 * @example
 * ```typescript
 * <WorkflowHealthRecommendation
 *   recommendation={{
 *     type: "warning",
 *     title: "Performance Bottleneck",
 *     description: "Node averaging 8s execution time",
 *     actionable: true,
 *     affectedNodeIds: ["node-1"]
 *   }}
 *   onNodeClick={(nodeId) => console.log("Navigate to", nodeId)}
 * />
 * ```
 */
const WorkflowHealthRecommendation: React.FC<RecommendationCardProps> = memo(
  function WorkflowHealthRecommendation({ recommendation, onNodeClick }) {
    const theme = useTheme();
    const [expanded, setExpanded] = React.useState(false);

    const getSeverity = (): "error" | "warning" | "info" | "success" => {
      switch (recommendation.type) {
        case "error":
          return "error";
        case "warning":
          return "warning";
        case "info":
          return "info";
        case "success":
          return "success";
        default:
          return "info";
      }
    };

    const severity = getSeverity();

    return (
      <Alert
        severity={severity}
        sx={{
          alignItems: "flex-start",
          mb: 1,
          "& .MuiAlert-message": {
            width: "100%",
          },
        }}
      >
        <Box
          sx={{
            width: "100%",
            display: "flex",
            flexDirection: "column",
            gap: 0.5,
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 1,
            }}
          >
            <Typography
              variant="subtitle2"
              sx={{
                fontWeight: 600,
              }}
            >
              {recommendation.title}
            </Typography>
            {recommendation.actionable && recommendation.affectedNodeIds && recommendation.affectedNodeIds.length > 0 && (
              <Button
                size="small"
                onClick={() => setExpanded(!expanded)}
                endIcon={expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                sx={{ minWidth: "auto", ml: "auto" }}
              >
                {expanded ? "Hide" : "View Nodes"}
              </Button>
            )}
          </Box>
          <Typography
            variant="body2"
            sx={{
              color: "text.secondary",
            }}
          >
            {recommendation.description}
          </Typography>
          {expanded && recommendation.affectedNodeIds && recommendation.affectedNodeIds.length > 0 && (
            <Collapse in={expanded}>
              <Box
                sx={{
                  mt: 1,
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 0.5,
                }}
              >
                {recommendation.affectedNodeIds.map((nodeId) => (
                  <Button
                    key={nodeId}
                    size="small"
                    variant="outlined"
                    onClick={() => onNodeClick?.(nodeId)}
                    sx={{
                      fontSize: "0.75rem",
                      textTransform: "none",
                    }}
                  >
                    {nodeId}
                  </Button>
                ))}
              </Box>
            </Collapse>
          )}
        </Box>
      </Alert>
    );
  }
);

export default WorkflowHealthRecommendation;
