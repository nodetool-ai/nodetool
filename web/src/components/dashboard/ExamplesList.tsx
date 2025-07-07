/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React from "react";
import { Box, Typography, CircularProgress, Button } from "@mui/material";
import { Workflow } from "../../stores/ApiTypes";
import { truncateString } from "../../utils/truncateString";
import { BASE_URL } from "../../stores/ApiClient";

interface ExamplesListProps {
  startExamples: Workflow[];
  isLoadingExamples: boolean;
  loadingExampleId: string | null;
  handleExampleClick: (example: Workflow) => void;
  handleViewAllExamples: () => void;
}

const styles = (theme: any) =>
  css({
    backgroundColor: theme?.palette?.grey[800] || "#222",
    borderRadius: theme?.spacing?.(1) || 8,
    padding: theme?.spacing?.(4) || 32,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
    ".section-title": {
      color: theme?.palette?.grey[100] || "#eee",
      marginBottom: theme?.spacing?.(3) || 24
    },
    ".content-scrollable": {
      flex: 1,
      overflow: "auto",
      paddingRight: theme?.spacing?.(1) || 8
    },
    ".example-grid": {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
      gap: theme?.spacing?.(2) || 16
    },
    ".example-card": {
      position: "relative",
      cursor: "pointer",
      borderRadius: theme?.spacing?.(1) || 8,
      overflow: "hidden",
      backgroundColor: "var(--palette-grey-800)",
      ":hover": {
        opacity: 0.9
      },
      ".example-description-tooltip": {
        visibility: "hidden",
        width: "200px",
        backgroundColor: theme?.palette?.grey[1000] || "#111",
        color: theme?.palette?.grey[0] || "#fff",
        textAlign: "center",
        borderRadius: "6px",
        padding: "5px 0",
        position: "absolute",
        zIndex: 1,
        bottom: "125%",
        left: "50%",
        marginLeft: "-100px",
        opacity: 0,
        transition: "opacity 0.3s",
        "&::after": {
          content: '""',
          position: "absolute",
          top: "100%",
          left: "50%",
          marginLeft: "-5px",
          borderWidth: "5px",
          borderStyle: "solid",
          borderColor: `${
            theme?.palette?.grey[1000] || "#111"
          } transparent transparent transparent`
        }
      },
      ":hover .example-description-tooltip": {
        visibility: "visible",
        opacity: 1
      }
    },
    ".example-image": {
      width: "100%",
      height: "180px",
      objectFit: "cover",
      backgroundColor: theme?.palette?.grey[600] || "#444"
    },
    ".example-name": {
      padding: ".2em .5em .5em 0",
      color: theme?.palette?.grey[0] || "#fff",
      backgroundColor: theme?.palette?.grey[800] || "#222",
      fontSize: "var(--fontSizeSmall)"
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

const ExamplesList: React.FC<ExamplesListProps> = ({
  startExamples,
  isLoadingExamples,
  loadingExampleId,
  handleExampleClick,
  handleViewAllExamples
}) => {
  // Try to get theme from MUI, fallback to undefined
  const theme = (window as any).muiTheme || undefined;
  return (
    <Box css={styles(theme)}>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}
      >
        <Typography variant="h2" className="section-title">
          Examples
        </Typography>
      </Box>
      <Box className="content-scrollable">
        {isLoadingExamples ? (
          <Box className="loading-container">
            <CircularProgress />
          </Box>
        ) : (
          <Box className="example-grid">
            {startExamples.map((example) => (
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
                <Typography className="example-name">{example.name}</Typography>
                {example.description && (
                  <Typography className="example-description-tooltip">
                    {truncateString(example.description, 150)}
                  </Typography>
                )}
              </Box>
            ))}
          </Box>
        )}
      </Box>
      <Button
        onClick={handleViewAllExamples}
        sx={{ marginTop: 2, alignSelf: "center" }}
      >
        View All Examples
      </Button>
    </Box>
  );
};

export default ExamplesList;
