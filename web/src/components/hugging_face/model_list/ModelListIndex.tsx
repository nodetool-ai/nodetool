/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { useState, useCallback } from "react";
import { Box, CircularProgress, Typography, useMediaQuery } from "@mui/material";

import { useModels } from "./useModels";
import ModelListHeader from "./ModelListHeader";
import ModelTypeSidebar from "./ModelTypeSidebar";
import ModelDisplay from "./ModelDisplay";
import DeleteModelDialog from "./DeleteModelDialog";
import { prettifyModelType } from "../../../utils/modelFormatting";
import { useModelManagerStore } from "../../../stores/ModelManagerStore";

const styles = (theme: Theme, isMobile: boolean) =>
  css({
    "&": {
      display: "flex",
      flexDirection: "column",
      height: "100%",
      position: "relative",
      background: "transparent"
    },
    ".main": {
      display: "flex",
      flexDirection: isMobile ? "column" : "row",
      flexGrow: 1,
      height: "100%",
      overflow: "hidden"
    },
    ".sidebar": {
      width: isMobile ? "100%" : "26%",
      minWidth: isMobile ? "auto" : "200px",
      maxWidth: isMobile ? "none" : "350px",
      paddingRight: isMobile ? "0" : "2em",
      paddingBottom: isMobile ? "1em" : "0",
      overflowY: "auto",
      maxHeight: isMobile ? "40vh" : "none",
      borderBottom: isMobile ? `1px solid ${theme.vars.palette.grey[800]}` : "none"
    },
    ".model-list-header": {
      display: "flex",
      flexDirection: isMobile ? "column" : "row",
      alignItems: isMobile ? "stretch" : "center",
      justifyContent: "space-between",
      gap: theme.spacing(1),
      padding: isMobile ? "0.5em" : "0.5em 1em",
      position: "sticky",
      top: 0,
      zIndex: 2,
      width: "100%",
      backdropFilter: "saturate(120%) blur(20px)",
      background: "transparent",
      borderBottom: `1px solid ${theme.vars.palette.grey[800]}`
    },
    ".model-list-header button": {
      padding: isMobile ? ".6em 1em" : ".4em 1em",
      fontSize: isMobile ? "0.85rem" : "0.9rem",
      minHeight: isMobile ? "44px" : "auto"
    },
    "& .model-type-button": {
      padding: isMobile ? "0.5em 1em" : "0.25em 1em",
      backgroundColor: "transparent",
      minHeight: isMobile ? "44px" : "auto",
      "&:hover": {
        color: theme.vars.palette.grey[100],
      }
    },
    ".model-type-button.Mui-selected": {
      color: theme.vars.palette.grey[100],
      transition: "background-color 0.2s ease-in"
    },
    ".model-type-button span": {
      display: "flex",
      alignItems: "center",
      transition: "color 0.2s ease-in"
    },
    ".model-type-button img": {
      filter: "saturate(0)"
    },
    ".model-type-button.Mui-selected span": {
      color: "var(--palette-primary-main)"
    },
    ".content": {
      width: isMobile ? "100%" : "80%",
      height: isMobile ? "auto" : "95%",
      flexGrow: 1,
      overflowY: "auto",
      padding: isMobile ? "0.5em" : "0 0 4em 1em"
    },
    ".model-list-section": {
      marginBottom: isMobile ? theme.spacing(3) : theme.spacing(5)
    }
  });

const ModelListIndex: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [modelToDelete, setModelToDelete] = useState<string | null>(null);
  const { selectedModelType, modelSearchTerm, modelSource } =
    useModelManagerStore();

  const {
    modelTypes,
    filteredModels,
    isLoading,
    isFetching,
    hfError,
    ollamaError,
    recommendedError,
    groupedHFModels,
    groupedRecommendedModels
  } = useModels();

  const handleDeleteClick = (modelId: string) => {
    setModelToDelete(modelId);
  };

  const handleCancelDelete = () => {
    setModelToDelete(null);
  };

  const renderModelCount = (modelType: any) => {
    if (modelSource === "recommended" && groupedRecommendedModels[modelType]) {
      return `[${groupedRecommendedModels[modelType].length}]`;
    } else if (modelSource === "downloaded" && groupedHFModels[modelType]) {
      return `[${groupedHFModels[modelType].length}]`;
    }
    return "";
  };

  if (isLoading) {
    return (
      <Box
        className="loading-container"
        sx={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          textAlign: "center"
        }}
      >
        <CircularProgress />
        <Typography variant="h4" mt={2}>
          Loading models
        </Typography>
      </Box>
    );
  }

  if (
    (modelSource === "downloaded" && (hfError || ollamaError)) ||
    (modelSource === "recommended" && recommendedError)
  ) {
    return (
      <div className="status-container">
        <Typography variant="h3">Could not load models.</Typography>
        {hfError && modelSource === "downloaded" && (
          <Typography variant="body2" color="error">
            HuggingFace Error: {hfError.message}
          </Typography>
        )}
        {ollamaError && modelSource === "downloaded" && (
          <Typography variant="body2" color="error">
            Ollama Error: {ollamaError.message}
          </Typography>
        )}
        {recommendedError && modelSource === "recommended" && (
          <Typography variant="body2" color="error">
            {recommendedError.message}
          </Typography>
        )}
      </div>
    );
  }

  return (
    <Box className="model-list-container" css={styles(theme, isMobile)}>
      <Box className="model-list-header">
        <ModelListHeader />
      </Box>
      <Box className="main">
        <Box className="sidebar">
          <ModelTypeSidebar />
        </Box>

        <Box className="content">
          {isFetching && (
            <CircularProgress
              size={20}
              sx={{ position: "absolute", top: "1em", right: "1em", zIndex: 1 }}
            />
          )}
          {selectedModelType === "All" ? (
            <>
              {modelSearchTerm && (
                <Typography variant="h5">
                  Searched models for &quot;{modelSearchTerm}&quot;
                </Typography>
              )}
              {modelTypes.slice(1).map((modelType) => {
                const models = filteredModels[modelType] || [];
                if (modelSearchTerm && models.length === 0) {
                  return null;
                }
                return (
                  <Box
                    className={
                      models.length > 0
                        ? "model-category"
                        : "model-category empty"
                    }
                    key={modelType}
                    mt={2}
                  >
                    <Typography variant="h2" fontSize="1.25em">
                      {prettifyModelType(modelType)}{" "}
                      <span
                        style={{
                          color: "var(--palette-grey-400)",
                          display: "inline-block",
                          fontSize: "var(--fontSizeSmaller)"
                        }}
                      >
                        {renderModelCount(modelType)}
                      </span>
                    </Typography>
                    <ModelDisplay
                      models={models}
                      handleDeleteClick={handleDeleteClick}
                    />
                  </Box>
                );
              })}
            </>
          ) : (
            <Box mt={2}>
              <Typography variant="h2" fontSize="1.25em">
                {prettifyModelType(selectedModelType)}{" "}
                {renderModelCount(selectedModelType)}
              </Typography>
              <ModelDisplay
                models={Object.values(filteredModels)[0]}
                handleDeleteClick={handleDeleteClick}
              />
            </Box>
          )}

          <DeleteModelDialog
            modelId={modelToDelete}
            onClose={handleCancelDelete}
          />
        </Box>
      </Box>
    </Box>
  );
};

export default React.memo(ModelListIndex);
