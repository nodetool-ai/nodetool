/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useState, useCallback } from "react";
import { Box, CircularProgress, Typography } from "@mui/material";

import { useModels } from "./useModels";
import ModelListHeader from "./ModelListHeader";
import ModelTypeSidebar from "./ModelTypeSidebar";
import ModelDisplay from "./ModelDisplay";
import DeleteModelDialog from "./DeleteModelDialog";
import { prettifyModelType } from "../../../utils/modelFormatting";

const styles = (theme: any) =>
  css({
    "&": {
      display: "flex",
      flexDirection: "column",
      height: "100%",
      position: "relative"
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
      overflowY: "auto",
      backgroundColor: theme.palette.c_gray1
    },
    ".model-list-header": {
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing(1),
      padding: "0.5em 1em",
      position: "sticky",
      top: 0,
      zIndex: 2,
      backgroundColor: theme.palette.c_gray1,
      width: "100%"
    },
    ".model-list-header button": {
      padding: ".4em 1em",
      fontSize: "0.9rem"
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
    },
    ".model-item": {
      padding: 0,
      borderBottom: `1px solid ${theme.palette.c_gray0}`,
      marginBottom: theme.spacing(1),
      "&:hover": {
        backgroundColor: theme.palette.c_gray2
      }
    },
    ".model-text": {
      wordBreak: "break-word",
      maxHeight: "3.5em",
      overflow: "hidden"
    },
    ".model-text span": {
      maxHeight: "2.5em",
      overflow: "hidden"
    },
    ".model-text p": {
      paddingTop: theme.spacing(1)
    },
    button: {
      color: theme.palette.c_gray5,
      margin: "0",
      padding: "0 .5em"
    },
    ".model-type-button": {
      padding: "0.25em 1em",
      backgroundColor: theme.palette.c_gray1,
      "&:hover": {
        color: theme.palette.c_gray6,
        backgroundColor: theme.palette.c_gray1
      }
    },
    ".model-type-button.Mui-selected": {
      backgroundColor: theme.palette.c_gray1,
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
      color: theme.palette.c_hl1
    },
    ".model-external-link-icon": {
      boxShadow: "none",
      cursor: "pointer",
      padding: "1em",
      backgroundColor: "transparent",
      filter: "saturate(0)",
      transition: "transform 0.125s ease-in, filter 0.2s ease-in",
      "&:hover": {
        backgroundColor: "transparent",
        transform: "scale(1.25)",
        filter: "saturate(1)"
      }
    },
    ".size-and-license": {
      display: "flex",
      flexDirection: "row",
      fontSize: "var(--fontSizeSmaller)",
      gap: "1em"
    },
    ".model-category": {},
    ".model-category.empty": {
      color: theme.palette.c_gray3,
      marginBottom: "2em"
    },
    ".model-type-button.empty": {
      color: theme.palette.c_gray4,
      "& span": {
        color: theme.palette.c_gray4
      }
    },
    ".model-type-button.Mui-selected.empty span": {
      color: "var(--palette-primary-dark)"
    },
    ".model-type-list .model-type-button:first-of-type": {
      "&, & .MuiListItemText-primary": {
        color: "var(--c_gray6)"
      }
    },
    ".model-type-list .model-type-button:first-of-type.Mui-selected": {
      "&, & .MuiListItemText-primary": {
        color: theme.palette.c_hl1
      }
    }
  });

const ModelListIndex: React.FC = () => {
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [modelToDelete, setModelToDelete] = useState<string | null>(null);

  const {
    modelSource,
    handleModelSourceChange,
    modelSearchTerm,
    setModelSearchTerm,
    selectedModelType,
    setSelectedModelType,
    hfModels,
    ollamaModels,
    modelTypes,
    filteredModels,
    deleteHFModel,
    deleteOllamaModel,
    deleteHFModelMutation,
    handleShowInExplorer,
    ollamaBasePath,
    isLoading,
    isFetching,
    hfError,
    ollamaError,
    recommendedError,
    groupedHFModels,
    groupedRecommendedModels
  } = useModels();

  const handleModelTypeChange = useCallback(
    (newValue: string) => {
      setSelectedModelType(newValue);
    },
    [setSelectedModelType]
  );

  const handleDeleteClick = (modelId: string) => {
    setModelToDelete(modelId);
  };

  const handleConfirmDelete = () => {
    if (modelToDelete) {
      const isOllama = ollamaModels?.find((m) => m.id === modelToDelete);
      if (isOllama) {
        deleteOllamaModel(modelToDelete);
      } else {
        deleteHFModel(modelToDelete);
      }
    }
    setModelToDelete(null);
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
      <>
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
      </>
    );
  }

  return (
    <Box className="model-list-container" css={styles}>
      <Box className="model-list-header">
        <ModelListHeader
          modelSource={modelSource}
          handleModelSourceChange={handleModelSourceChange}
          modelSearchTerm={modelSearchTerm}
          setModelSearchTerm={setModelSearchTerm}
        />
      </Box>
      <Box className="main">
        <Box className="sidebar">
          <ModelTypeSidebar
            modelTypes={modelTypes}
            selectedModelType={selectedModelType}
            handleModelTypeChange={handleModelTypeChange}
            modelSource={modelSource}
            ollamaModels={ollamaModels}
            groupedHFModels={groupedHFModels}
            groupedRecommendedModels={groupedRecommendedModels}
          />
        </Box>

        <Box className="content">
          {isFetching && (
            <CircularProgress
              size={20}
              sx={{ position: "absolute", top: "1em", right: "1em", zIndex: 1 }}
            />
          )}
          {deleteHFModelMutation.isPending && <CircularProgress />}
          {deleteHFModelMutation.isError && (
            <Typography color="error">
              {deleteHFModelMutation.error.message}
            </Typography>
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
                          color: "var(--c_gray4)",
                          display: "inline-block",
                          fontSize: "var(--fontSizeSmaller)"
                        }}
                      >
                        {renderModelCount(modelType)}
                      </span>
                    </Typography>
                    <ModelDisplay
                      models={models}
                      viewMode={viewMode}
                      modelSource={modelSource}
                      modelSearchTerm={modelSearchTerm}
                      handleDeleteClick={handleDeleteClick}
                      handleShowInExplorer={handleShowInExplorer}
                      ollamaBasePath={ollamaBasePath}
                    />
                  </Box>
                );
              })}
            </>
          ) : (
            <Box mt={2}>
              <Typography variant="h2">
                {prettifyModelType(selectedModelType)}{" "}
                {renderModelCount(selectedModelType)}
              </Typography>
              <ModelDisplay
                models={Object.values(filteredModels)[0]}
                viewMode={viewMode}
                modelSource={modelSource}
                modelSearchTerm={modelSearchTerm}
                handleDeleteClick={handleDeleteClick}
                handleShowInExplorer={handleShowInExplorer}
                ollamaBasePath={ollamaBasePath}
              />
            </Box>
          )}

          <DeleteModelDialog
            modelToDelete={modelToDelete}
            handleCancelDelete={handleCancelDelete}
            handleConfirmDelete={handleConfirmDelete}
            handleShowInExplorer={handleShowInExplorer}
            ollamaModels={ollamaModels}
            hfModels={hfModels}
            ollamaBasePath={ollamaBasePath}
          />
        </Box>
      </Box>
    </Box>
  );
};

export default React.memo(ModelListIndex);
