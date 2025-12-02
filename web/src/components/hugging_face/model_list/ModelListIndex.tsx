/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { useState, useCallback, useMemo } from "react";
import { Box, CircularProgress, Typography } from "@mui/material";
import { VariableSizeList as VirtualList } from "react-window";

import { useModels } from "./useModels";
import ModelListHeader from "./ModelListHeader";
import ModelTypeSidebar from "./ModelTypeSidebar";
import DeleteModelDialog from "./DeleteModelDialog";
import { prettifyModelType } from "../../../utils/modelFormatting";
import { useModelManagerStore } from "../../../stores/ModelManagerStore";
import ModelListItem from "./ModelListItem";
import { useModelDownloadStore } from "../../../stores/ModelDownloadStore";
import type { UnifiedModel } from "../../../stores/ApiTypes";
import { useModelCompatibility } from "./useModelCompatibility";

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
      width: "240px",
      minWidth: "240px",
      maxWidth: "240px",
      padding: "1em",
      overflowY: "auto",
      borderRight: `1px solid ${theme.vars.palette.divider}`,
      background: "rgba(0, 0, 0, 0.2)"
    },
    ".model-list": {
      paddingBottom: "250px"
    },
    ".model-list-header": {
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing(2),
      padding: "1em 1.5em",
      position: "sticky",
      top: 0,
      zIndex: 2,
      width: "100%",
      backdropFilter: "blur(12px)",
      background: "rgba(18, 18, 18, 0.4)",
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)"
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
      overflow: "hidden",
      padding: "0 1em 4em 1em",
      position: "relative"
    },
    ".model-list-section": {
      marginBottom: theme.spacing(5)
    }
  });

type ListItem =
  | { type: "header"; modelType: string }
  | { type: "model"; model: UnifiedModel };

const ModelListIndex: React.FC = () => {
  const theme = useTheme();
  const [modelToDelete, setModelToDelete] = useState<string | null>(null);
  const { selectedModelType, modelSearchTerm } = useModelManagerStore();

  const {
    modelTypes,
    filteredModels,
    allModels,
    isLoading,
    isFetching,
    error,
    handleShowInExplorer
  } = useModels();

  const downloadStore = useModelDownloadStore();
  const { getModelCompatibility } = useModelCompatibility();

  const handleDeleteClick = (modelId: string) => {
    setModelToDelete(modelId);
  };

  const handleCancelDelete = () => {
    setModelToDelete(null);
  };

  const startDownload = useCallback(
    (model: UnifiedModel) => {
      const repoId = model.repo_id || model.id;
      downloadStore.startDownload(
        repoId,
        model.type ?? "",
        model.path ?? undefined
      );
      downloadStore.openDialog();
    },
    [downloadStore]
  );

  // Flatten the model list with headers for "All" view
  const flattenedList = useMemo(() => {
    if (selectedModelType !== "All") {
      return filteredModels.map(
        (model): ListItem => ({ type: "model", model })
      );
    }

    const items: ListItem[] = [];
    modelTypes.slice(1).forEach((modelType) => {
      const models = filteredModels.filter((m) => m.type === modelType);
      // Only add header if there are models in this section
      if (models.length > 0) {
        items.push({ type: "header", modelType });
        models.forEach((model) => {
          items.push({ type: "model", model });
        });
      }
    });
    return items;
  }, [selectedModelType, modelTypes, filteredModels]);

  const getItemSize = useCallback(
    (index: number) => {
      const item = flattenedList[index];
      return item.type === "header" ? 60 : 180;
    },
    [flattenedList]
  );

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
        <ModelListHeader
          totalCount={allModels?.length || 0}
          filteredCount={filteredModels.length}
        />
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
          {modelSearchTerm && selectedModelType === "All" && (
            <Typography variant="h5" mb={2}>
              Searched models for &quot;{modelSearchTerm}&quot;
            </Typography>
          )}
          {selectedModelType !== "All" && (
            <Typography variant="h2" fontSize="1.25em" mb={2}>
              {prettifyModelType(selectedModelType)}
            </Typography>
          )}
          {flattenedList.length > 0 ? (
            <VirtualList
              className="model-list"
              key={`${selectedModelType}-${flattenedList.length}`}
              height={window.innerHeight - 200}
              width="100%"
              itemCount={flattenedList.length}
              itemSize={getItemSize}
              itemKey={(index) => {
                const item = flattenedList[index];
                return item.type === "header"
                  ? `header-${item.modelType}`
                  : `model-${item.model.id}`;
              }}
            >
              {({ index, style }) => {
                const item = flattenedList[index];
                if (item.type === "header") {
                  return (
                    <Box style={style} sx={{ pt: 2, pb: 1 }}>
                      <Typography variant="h2" fontSize="1.25em">
                        {prettifyModelType(item.modelType)}
                      </Typography>
                    </Box>
                  );
                } else {
                  const compatibility = getModelCompatibility(item.model);
                  return (
                    <Box style={style}>
                      <ModelListItem
                        model={item.model}
                        handleModelDelete={
                          item.model.downloaded ? handleDeleteClick : undefined
                        }
                        onDownload={
                          !item.model.downloaded
                            ? () => startDownload(item.model)
                            : undefined
                        }
                        handleShowInExplorer={
                          item.model.downloaded
                            ? handleShowInExplorer
                            : undefined
                        }
                        showModelStats={true}
                        compatibility={compatibility}
                      />
                    </Box>
                  );
                }
              }}
            </VirtualList>
          ) : (
            <Typography variant="body1" sx={{ mt: 2 }}>
              {modelSearchTerm
                ? `No models found for "${modelSearchTerm}"`
                : "No models available"}
            </Typography>
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
