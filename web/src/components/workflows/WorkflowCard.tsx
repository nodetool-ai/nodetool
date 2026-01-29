/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import {
  Box,
  Typography,
  CircularProgress,
  Fade,
  Chip,
  Tooltip
} from "@mui/material";
import type { Theme } from "@mui/material/styles";
import { useTheme } from "@mui/material/styles";
import { memo, useCallback, useMemo } from "react";
import { chipsContainerSx, chipSx } from "./WorkflowCard.styles";
import { Workflow } from "../../stores/ApiTypes";
import { BASE_URL } from "../../stores/BASE_URL";
import { getNodeDisplayName, getNodeNamespace } from "../../utils/nodeDisplay";

interface WorkflowCardProps {
  workflow: Workflow;
  matchedNodes: { text: string }[];
  nodesOnlySearch: boolean;
  isLoading: boolean;
  onClick: (workflow: Workflow) => void;
}

const cardStyles = (theme: Theme) =>
  css({
    position: "relative",
    display: "flex",
    flexDirection: "column",
    width: "100%",
    height: "100%",
    minHeight: "260px",
    borderRadius: "12px",
    overflow: "hidden",
    cursor: "pointer",
    background: theme.vars.palette.grey[900],
    border: `1px solid ${theme.vars.palette.grey[800]}`,
    transition: "transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease",
    "&:hover": {
      transform: "translateY(-2px)",
      borderColor: theme.vars.palette.primary.main,
      boxShadow: `0 8px 24px rgba(0, 0, 0, 0.3)`
    },

    "&:hover .chips-container": {
      opacity: 1,
      maxHeight: "60px"
    },
    "&:hover .matched-nodes": {
      display: "flex"
    },
    "&.loading": {
      cursor: "wait",
      pointerEvents: "none"
    },
    ".loading-overlay": {
      position: "absolute",
      inset: 0,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(0, 0, 0, 0.75)",
      backdropFilter: "blur(4px)",
      zIndex: 10,
      borderRadius: "12px"
    },
    ".loading-text": {
      color: theme.vars.palette.primary.main,
      fontSize: "0.85rem",
      marginTop: "12px",
      textAlign: "center",
      fontWeight: 500
    },
    ".card-image-container": {
      position: "relative",
      width: "100%",
      aspectRatio: "16 / 10",
      overflow: "hidden",
      backgroundColor: theme.vars.palette.grey[850],
      flexShrink: 0
    },
    ".card-image": {
      width: "100%",
      height: "100%",
      objectFit: "cover",
      transition: "transform 0.3s ease"
    },
    "&:hover .card-image": {
      transform: "scale(1.03)"
    },
    ".package-badge": {
      position: "absolute",
      top: "8px",
      right: "8px",
      fontSize: "0.65rem",
      fontWeight: 600,
      letterSpacing: "0.5px",
      backgroundColor: "rgba(0, 0, 0, 0.6)",
      backdropFilter: "blur(4px)",
      color: theme.vars.palette.grey[200],
      padding: "4px 8px",
      borderRadius: "6px",
      textTransform: "uppercase"
    },
    ".matched-nodes": {
      position: "absolute",
      top: "8px",
      left: "8px",
      display: "none",
      flexDirection: "column",
      gap: "4px",
      maxWidth: "calc(100% - 80px)",
      zIndex: 5
    },
    ".matched-item": {
      fontSize: "0.7rem",
      fontWeight: 600,
      padding: "4px 8px",
      borderRadius: "6px",
      backgroundColor: theme.vars.palette.grey[100],
      color: theme.vars.palette.grey[900]
    },
    ".matched-item-name": {
      display: "block",
      fontSize: "0.75rem",
      color: theme.vars.palette.grey[900]
    },
    ".matched-item-namespace": {
      display: "block",
      fontSize: "0.65rem",
      color: theme.vars.palette.grey[700],
      fontWeight: 500
    },
    ".card-content": {
      display: "flex",
      flexDirection: "column",
      padding: "12px 14px",
      flex: 1,
      minHeight: "60px"
    },
    ".card-title": {
      fontSize: "0.95rem",
      fontWeight: 600,
      color: theme.vars.palette.text.primary,
      lineHeight: 1.3,
      display: "-webkit-box",
      WebkitLineClamp: 2,
      WebkitBoxOrient: "vertical",
      overflow: "hidden",
      margin: 0
    },

    ".chips-container": {
      display: "flex",
      flexWrap: "wrap",
      gap: "4px",
      marginTop: "8px",
      maxHeight: 0,
      opacity: 0,
      overflow: "hidden",
      transition: "max-height 0.3s ease, opacity 0.3s ease"
    }
  });

const WorkflowCard: React.FC<WorkflowCardProps> = ({
  workflow,
  matchedNodes,
  nodesOnlySearch,
  isLoading,
  onClick
}) => {
  const theme = useTheme();

  const handleClick = useCallback(() => {
    onClick(workflow);
  }, [onClick, workflow]);

  const imageUrl = useMemo(() => {
    return `${BASE_URL}/api/assets/packages/${workflow.package_name}/${workflow.name}.jpg`;
  }, [workflow.package_name, workflow.name]);

  const packageNameDisplay = useMemo(() => {
    return workflow.package_name?.replace("nodetool-", "") || "N/A";
  }, [workflow.package_name]);

  return (
    <Tooltip
      title={workflow.description || ""}
      placement="top"
      arrow
      enterDelay={300}
      leaveDelay={0}
      slotProps={{
        tooltip: {
          sx: {
            backgroundColor: theme.vars.palette.grey[800],
            color: theme.vars.palette.text.primary,
            fontSize: "0.85rem",
            padding: "10px 14px",
            maxWidth: 300,
            borderRadius: "8px",
            boxShadow: "0 4px 20px rgba(0, 0, 0, 0.3)"
          }
        },
        arrow: {
          sx: {
            color: theme.vars.palette.grey[800]
          }
        }
      }}
    >
      <Box
        css={cardStyles(theme)}
        className={isLoading ? "loading" : ""}
        onClick={handleClick}
      >
        {isLoading && (
          <Fade in={true}>
            <Box className="loading-overlay">
              <CircularProgress size={36} color="primary" />
              <Typography className="loading-text">
                Creating workflow...
              </Typography>
            </Box>
          </Fade>
        )}

        <Box className="card-image-container">
          <img
            className="card-image"
            src={imageUrl}
            alt={workflow.name}
            loading="lazy"
          />
          <Typography className="package-badge">
            {packageNameDisplay}
          </Typography>
          {nodesOnlySearch && matchedNodes.length > 0 && (
            <Box className="matched-nodes">
              {matchedNodes.slice(0, 3).map((match, idx) => (
                <Typography key={idx} className="matched-item">
                  {getNodeDisplayName(match.text) && (
                    <span className="matched-item-name">
                      {getNodeDisplayName(match.text)}
                    </span>
                  )}
                  <span className="matched-item-namespace">
                    {getNodeNamespace(match.text)}
                  </span>
                </Typography>
              ))}
              {matchedNodes.length > 3 && (
                <Typography className="matched-item">
                  +{matchedNodes.length - 3} more
                </Typography>
              )}
            </Box>
          )}
        </Box>

        <Box className="card-content">
          <Typography component="h3" className="card-title">
            {workflow.name}
          </Typography>
        </Box>
      </Box>
    </Tooltip>
  );
};

export default memo(WorkflowCard);
