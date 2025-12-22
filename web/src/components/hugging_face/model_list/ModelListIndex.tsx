/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { useState, useCallback, useMemo, useEffect } from "react";
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
import { isElectron } from "../../../stores/ApiClient";
import { useHfCacheStatusStore } from "../../../stores/HfCacheStatusStore";
import {
  buildHfCacheRequest,
  canCheckHfCache,
  getHfCacheKey
} from "../../../utils/hfCache";

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

type VisibleRange = {
  visibleStartIndex: number;
  visibleStopIndex: number;
};

const ModelListIndex: React.FC = () => {
  const theme = useTheme();
  const [modelToDelete, setModelToDelete] = useState<string | null>(null);
  const { selectedModelType, modelSearchTerm, filterStatus } = useModelManagerStore();
  const [visibleRange, setVisibleRange] = useState({ start: 0, stop: -1 });
  const cacheStatuses = useHfCacheStatusStore((state) => state.statuses);
  const cachePending = useHfCacheStatusStore((state) => state.pending);
  const cacheVersion = useHfCacheStatusStore((state) => state.version);
  const ensureStatuses = useHfCacheStatusStore(
    (state) => state.ensureStatuses
  );

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
      const path = model.path ?? null;
      const allowPatterns = path ? null : model.allow_patterns ?? null;
      const ignorePatterns = path ? null : model.ignore_patterns ?? null;
      downloadStore.startDownload(
        repoId,
        model.type ?? "",
        path ?? undefined,
        allowPatterns,
        ignorePatterns
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

  const visibleModels = useMemo(() => {
    if (visibleRange.stop < visibleRange.start) {
      return [];
    }
    const models: UnifiedModel[] = [];
    for (let i = visibleRange.start; i <= visibleRange.stop; i += 1) {
      const item = flattenedList[i];
      if (item?.type === "model") {
        models.push(item.model);
      }
    }
    return models;
  }, [flattenedList, visibleRange]);

  useEffect(() => {
    const requests = visibleModels
      .map((model) => buildHfCacheRequest(model))
      .filter((request): request is NonNullable<typeof request> => request !== null);

    if (requests.length === 0) {
      return;
    }

    void ensureStatuses(requests);
  }, [ensureStatuses, visibleModels, cacheVersion]);

  // When filtering by download status, pre-fetch cache statuses for ALL models
  // so filtering works correctly even for models not yet visible
  useEffect(() => {
    if (filterStatus === "all" || !allModels) {
      return;
    }

    const requests = allModels
      .map((model) => buildHfCacheRequest(model))
      .filter((request): request is NonNullable<typeof request> => request !== null);

    if (requests.length === 0) {
      return;
    }

    void ensureStatuses(requests);
  }, [ensureStatuses, allModels, filterStatus, cacheVersion]);

  const handleItemsRendered = useCallback(
    ({ visibleStartIndex, visibleStopIndex }: VisibleRange) => {
      setVisibleRange((prev) => {
        if (
          prev.start === visibleStartIndex &&
          prev.stop === visibleStopIndex
        ) {
          return prev;
        }
        return { start: visibleStartIndex, stop: visibleStopIndex };
      });
    },
    []
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
    // Extract error message - API returns {detail: "..."} or {detail: [{msg: "..."}]}
    const err = error as any;
    const errorMessage =
      typeof err?.detail === "string"
        ? err.detail
        : err?.detail?.[0]?.msg || err?.message || "Unknown error";

    const isOllamaError = errorMessage.toLowerCase().includes("ollama");

    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          gap: 2,
          p: 4,
          textAlign: "center"
        }}
      >
        <Typography variant="h4" color="error">
          Could not load models
        </Typography>
        <Typography
          variant="body1"
          color="text.secondary"
          sx={{ maxWidth: 600 }}
        >
          {errorMessage}
        </Typography>
        {isOllamaError && (
          <Box sx={{ mt: 1, display: "flex", flexDirection: "column", gap: 1 }}>
            {isElectron ? (
              <Typography variant="body2" color="warning.main">
                Ollama should be running automatically. Please try restarting
                the application.
              </Typography>
            ) : (
              <Typography
                variant="body2"
                component="a"
                href="https://ollama.com/download"
                target="_blank"
                rel="noopener noreferrer"
                sx={{ color: "primary.main", textDecoration: "underline" }}
              >
                Download Ollama →
              </Typography>
            )}
          </Box>
        )}
      </Box>
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
              onItemsRendered={handleItemsRendered}
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
                  const cacheKey = getHfCacheKey(item.model);
                  const isCacheableHf = canCheckHfCache(item.model);
                  const isCheckingCache =
                    isCacheableHf &&
                    (cachePending[cacheKey] ||
                      cacheStatuses[cacheKey] === undefined);
                  const isDownloaded =
                    item.model.type === "llama_model" ||
                    !!cacheStatuses[cacheKey];
                  const displayModel = {
                    ...item.model,
                    downloaded: isDownloaded
                  } as UnifiedModel & { downloaded: boolean };
                  return (
                    <Box style={style}>
                      <ModelListItem
                        model={displayModel}
                        handleModelDelete={
                          displayModel.downloaded ? handleDeleteClick : undefined
                        }
                        onDownload={
                          !displayModel.downloaded
                            ? () => startDownload(item.model)
                            : undefined
                        }
                        handleShowInExplorer={
                          displayModel.downloaded
                            ? handleShowInExplorer
                            : undefined
                        }
                        showModelStats={true}
                        compatibility={compatibility}
                        isCheckingCache={isCheckingCache}
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
