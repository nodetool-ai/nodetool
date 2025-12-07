/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React from "react";
import { Box, Typography, CircularProgress, Button } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material";
import { Workflow } from "../../stores/ApiTypes";
import { truncateString } from "../../utils/truncateString";
import { BASE_URL } from "../../stores/BASE_URL";

interface TemplatesPanelProps {
  startTemplates: Workflow[];
  isLoadingTemplates: boolean;
  loadingExampleId: string | null;
  handleExampleClick: (example: Workflow) => void;
  handleViewAllTemplates: () => void;
}

const styles = (theme: Theme) =>
  css({
    borderRadius: theme.spacing(1),
    padding: "1em",
    display: "flex",
    flexDirection: "column",
    overflowY: "auto",
    height: "100%",
    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
    background: theme.vars.palette.c_editor_bg_color,
    ".panel-header": {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "1em"
    },
    ".section-title": {
      color: theme.vars.palette.grey[100],
      fontSize: "1.25rem",
      fontWeight: 500
    },
    ".content-scrollable": {
      flex: 1,
      overflow: "auto",
      paddingRight: theme.spacing(1)
    },
    ".example-grid": {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
      gap: theme.spacing(2)
    },
    ".example-card": {
      position: "relative",
      cursor: "pointer",
      borderRadius: theme.spacing(1),
      overflow: "hidden",
      border: `1px solid ${theme.vars.palette.divider}`,
      background: "rgba(255, 255, 255, 0.02)",
      transition: "all 0.2s ease",
      ":hover": {
        transform: "translateY(-2px)",
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
        borderColor: theme.vars.palette.primary.main
      },
      ".example-description-tooltip": {
        visibility: "hidden",
        width: "200px",
        color: theme.vars.palette.grey[0],
        textAlign: "center",
        borderRadius: "6px",
        padding: "8px",
        background: "rgba(0, 0, 0, 0.9)",
        position: "absolute",
        zIndex: 1,
        bottom: "10px",
        left: "50%",
        transform: "translateX(-50%)",
        opacity: 0,
        transition: "opacity 0.3s",
        fontSize: "0.8rem",
        pointerEvents: "none"
      },
      ":hover .example-description-tooltip": {
        visibility: "visible",
        opacity: 1
      }
    },
    ".example-image": {
      width: "100%",
      height: "140px",
      objectFit: "cover",
      borderBottom: `1px solid ${theme.vars.palette.divider}`
    },
    ".example-info": {
      padding: "0.75em"
    },
    ".example-name": {
      color: theme.vars.palette.text.primary,
      fontSize: "0.95rem",
      fontWeight: 500,
      marginBottom: "0.25em"
    },
    ".loading-container": {
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      height: "300px"
    },
    ".loading-overlay": {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(0, 0, 0, 0.7)",
      zIndex: 10
    }
  });

const TemplatesPanel: React.FC<TemplatesPanelProps> = ({
  startTemplates,
  isLoadingTemplates,
  loadingExampleId,
  handleExampleClick,
  handleViewAllTemplates
}) => {
  const theme = useTheme();
  return (
    <Box className="templates-panel" css={styles(theme)}>
      <Box className="panel-header">
        <Typography variant="h3" className="section-title">
          Start with a Template
        </Typography>
        <Button
          onClick={handleViewAllTemplates}
          size="small"
          variant="text"
          sx={{ color: "primary.main" }}
        >
          View All
        </Button>
      </Box>
      <Box className="content-scrollable">
        {isLoadingTemplates ? (
          <Box className="loading-container">
            <CircularProgress />
          </Box>
        ) : (
          <Box className="example-grid">
            {startTemplates.map((example) => (
              <Box
                key={example.id}
                className="example-card"
                onClick={() => handleExampleClick(example)}
              >
                {loadingExampleId === example.id && (
                  <Box className="loading-overlay">
                    <CircularProgress size={30} />
                  </Box>
                )}
                <img
                  className="example-image"
                  src={`${BASE_URL}/api/assets/packages/${example.package_name}/${example.name}.jpg`}
                  alt={example.name}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
                <div className="example-info">
                  <Typography className="example-name">{example.name}</Typography>
                </div>
                {example.description && (
                  <Typography className="example-description-tooltip">
                    {truncateString(example.description, 100)}
                  </Typography>
                )}
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default TemplatesPanel;
