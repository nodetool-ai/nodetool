/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { useState, useCallback } from "react";
import { Box, CircularProgress, Typography } from "@mui/material";

import { useModels } from "./useModels";
import ModelListHeader from "./ModelListHeader";
import ModelTypeSidebar from "./ModelTypeSidebar";
import ModelDisplay from "./ModelDisplay";
import DeleteModelDialog from "./DeleteModelDialog";
import { prettifyModelType } from "../../../utils/modelFormatting";
import { useModelManagerStore } from "../../../stores/ModelManagerStore";

const styles = (theme: Theme) =>
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
      flexDirection: "row",
      flexGrow: 1,
      height: "100%",
      overflow: "hidden"
    },
    ".sidebar": {
      width: "26%",
      minWidth: "200px",
      maxWidth: "350px",
      paddingRight: "2em",
      overflowY: "auto"
    },
    ".model-list-header": {
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing(1),
      padding: "0.5em 1em",
      position: "sticky",
      top: 0,
      zIndex: 2,
      width: "100%",
      backdropFilter: "saturate(120%) blur(20px)",
      background: "transparent",
      borderBottom: `1px solid ${theme.vars.palette.grey[800]}`
    },
    ".model-list-header button": {
      padding: ".4em 1em",
      fontSize: "0.9rem"
    },
    "& .model-type-button": {
      padding: "0.25em 1em",
      backgroundColor: "transparent",
      "&:hover": {
        color: theme.vars.palette.grey[100]
      }
    },
    ".model-type-button.Mui-selected": {
      color: theme.vars.palette.grey[100],
      transition: "background-color 0.2s ease-in",
      borderRadius: 8,
      backgroundColor: theme.vars.palette.grey[800]
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
      width: "80%",
      height: "95%",
      flexGrow: 1,
      overflowY: "auto",
      padding: "0 0 4em 1em"
    },
    ".model-list-section": {
      marginBottom: theme.spacing(5)
    }
  });

const ModelListIndex: React.FC = () => {
  const theme = useTheme();
  const [modelToDelete, setModelToDelete] = useState<string | null>(null);
  const { selectedModelType, modelSearchTerm } = useModelManagerStore();

  const { modelTypes, filteredModels, isLoading, isFetching, error } =
    useModels();

  const handleDeleteClick = (modelId: string) => {
    setModelToDelete(modelId);
  };

  const handleCancelDelete = () => {
    setModelToDelete(null);
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

  if (error) {
    return (
      <div className="status-container">
        <Typography variant="h3">Could not load models.</Typography>
        {error && (
          <Typography variant="body2" color="error">
            {error.message}
          </Typography>
        )}
      </div>
    );
  }

  return (
    <Box className="model-list-container" css={styles(theme)}>
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
                const models = filteredModels.filter(
                  (model) => model.type === modelType
                );
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
              </Typography>
              <ModelDisplay
                models={Object.values(
                  filteredModels.filter(
                    (model) => model.type === selectedModelType
                  )
                )}
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
