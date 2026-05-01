/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { Box, Button } from "@mui/material";
import { LoadingSpinner, Text } from "../../ui_primitives";
import SearchOffIcon from "@mui/icons-material/SearchOff";
import DownloadIcon from "@mui/icons-material/Download";
import { useVirtualizer } from "@tanstack/react-virtual";

import { useModels } from "./useModels";
import ModelListHeader from "./ModelListHeader";
import ModelTypeSidebar from "./ModelTypeSidebar";
import DeleteModelDialog from "./DeleteModelDialog";
import { prettifyModelType } from "../../../utils/modelFormatting";
import { IconForType } from "../../../config/data_types";
import { useModelManagerStore } from "../../../stores/ModelManagerStore";
import ModelListItem from "./ModelListItem";
import { useModelDownloadStore } from "../../../stores/ModelDownloadStore";
import type { UnifiedModel } from "../../../stores/ApiTypes";
import { useModelCompatibility } from "./useModelCompatibility";
import { isElectron } from "../../../lib/env";
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
      background: "transparent",
      overflow: "hidden"
    },
    ".main": {
      display: "flex",
      flexDirection: "row",
      flexGrow: 1,
      overflow: "hidden",
      minHeight: 0
    },
    ".sidebar": {
      width: "300px",
      minWidth: "300px",
      maxWidth: "300px",
      height: "100%",
      padding: "1em",
      overflowY: "auto",
      borderRight: `1px solid ${theme.vars.palette.divider}`,
      background: theme.vars.palette.action.hover
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
      backdropFilter: theme.vars.palette.glass.blur,
      background: theme.vars.palette.background.paper,
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
      color: theme.vars.palette.text.primary,
      transition: "background-color 0.2s ease-in",
      borderRadius: 8,
      backgroundColor: theme.vars.palette.action.selected
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
      flexGrow: 1,
      height: "100%",
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
  const selectedModelType = useModelManagerStore((state) => state.selectedModelType);
  const modelSearchTerm = useModelManagerStore((state) => state.modelSearchTerm);
  const filterStatus = useModelManagerStore((state) => state.filterStatus);
  const setFilterStatus = useModelManagerStore((state) => state.setFilterStatus);
  const [visibleRange, setVisibleRange] = useState({ start: 0, stop: -1 });
  const cacheStatuses = useHfCacheStatusStore((state) => state.statuses);
  const cachePending = useHfCacheStatusStore((state) => state.pending);
  const cacheVersion = useHfCacheStatusStore((state) => state.version);
  const ensureStatuses = useHfCacheStatusStore((state) => state.ensureStatuses);

  const {
    modelTypes,
    filteredModels,
    allModels,
    isLoading,
    isFetching,
    error,
    handleShowInExplorer
  } = useModels();

  const startDownload = useModelDownloadStore((state) => state.startDownload);
  const openDialog = useModelDownloadStore((state) => state.openDialog);
  const { getModelCompatibility } = useModelCompatibility();

  const handleDeleteClick = (modelId: string) => {
    setModelToDelete(modelId);
  };

  const handleCancelDelete = () => {
    setModelToDelete(null);
  };

  const handleStartDownload = useCallback(
    (model: UnifiedModel) => {
      const repoId = model.repo_id || model.id;
      const path = model.path ?? null;
      const allowPatterns = path ? null : model.allow_patterns ?? null;
      const ignorePatterns = path ? null : model.ignore_patterns ?? null;
      startDownload(
        repoId,
        model.type ?? "",
        path ?? undefined,
        allowPatterns,
        ignorePatterns
      );
      openDialog();
    },
    [startDownload, openDialog]
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

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: flattenedList.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) =>
      flattenedList[index]?.type === "header" ? 48 : 168,
    overscan: 5,
    getItemKey: (index) => {
      const item = flattenedList[index];
      return item.type === "header"
        ? `header-${item.modelType}`
        : `model-${item.model.id}`;
    },
  });

  const virtualItems = virtualizer.getVirtualItems();
  const firstVirtualIndex = virtualItems[0]?.index ?? 0;
  const lastVirtualIndex =
    virtualItems[virtualItems.length - 1]?.index ?? -1;

  useEffect(() => {
    setVisibleRange((prev) => {
      if (prev.start === firstVirtualIndex && prev.stop === lastVirtualIndex) {
        return prev;
      }
      return { start: firstVirtualIndex, stop: lastVirtualIndex };
    });
  }, [firstVirtualIndex, lastVirtualIndex]);

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
      .filter(
        (request): request is NonNullable<typeof request> => request !== null
      );

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
      .filter(
        (request): request is NonNullable<typeof request> => request !== null
      );

    if (requests.length === 0) {
      return;
    }

    void ensureStatuses(requests);
  }, [ensureStatuses, allModels, filterStatus, cacheVersion]);

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
        <LoadingSpinner size="medium" text="Loading models" />
      </Box>
    );
  }

  if (error) {
    // Extract error message - API returns {detail: "..."} or {detail: [{msg: "..."}]}
    interface ApiErrorShape {
      detail?: string | Array<{ msg: string }>;
      message?: string;
    }
    const err = error as ApiErrorShape;
    const errorMessage =
      typeof err?.detail === "string"
        ? err.detail
        : (err?.detail as Array<{ msg: string }>)?.[0]?.msg || err?.message || "Unknown error";

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
        <Text size="big" color="error">
          Could not load models
        </Text>
        <Text
          color="secondary"
          sx={{ maxWidth: 600 }}
        >
          {errorMessage}
        </Text>
        {isOllamaError && (
          <Box sx={{ mt: 1, display: "flex", flexDirection: "column", gap: 1 }}>
            {isElectron ? (
              <Text size="small" color="warning">
                Ollama should be running automatically. Please try restarting
                the application.
              </Text>
            ) : (
              <Text
                size="small"
                component="a"
                href="https://ollama.com/download"
                target="_blank"
                rel="noopener noreferrer"
                sx={{ color: "primary.main", textDecoration: "underline" }}
              >
                Download Ollama →
              </Text>
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
            <Box sx={{ position: "absolute", top: "1em", right: "1em", zIndex: 1 }}>
              <LoadingSpinner size="small" />
            </Box>
          )}
          {modelSearchTerm && selectedModelType === "All" && (
            <Text size="normal" weight={600} sx={{ mb: 2 }}>
              Searched models for &quot;{modelSearchTerm}&quot;
            </Text>
          )}
          {selectedModelType !== "All" && (
            <Box
              sx={{
                display: "flex",
                alignItems: "flex-start",
                gap: 2,
                pt: 1,
                pb: 2.5,
                mb: 1,
                borderBottom: `1px solid ${theme.vars.palette.divider}`
              }}
            >
              <Box
                sx={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 40,
                  height: 40,
                  borderRadius: "var(--rounded-lg)",
                  background:
                    "rgba(var(--palette-primary-main-channel) / 0.12)",
                  flexShrink: 0
                }}
              >
                <IconForType
                  iconName={selectedModelType.replace(/^hf\./, "") || "model"}
                  containerStyle={{ display: "flex" }}
                  svgProps={{
                    style: {
                      width: 22,
                      height: 22,
                      color: theme.vars.palette.primary.main
                    }
                  }}
                  showTooltip={false}
                />
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Text size="bigger" weight={700} sx={{ fontSize: "1.5em", lineHeight: 1.2 }}>
                  {prettifyModelType(selectedModelType)}
                </Text>
                <Text
                  size="small"
                  color="secondary"
                  sx={{ mt: 0.5, display: "block" }}
                >
                  {filteredModels.length} model
                  {filteredModels.length === 1 ? "" : "s"} in this category
                </Text>
              </Box>
            </Box>
          )}
          {flattenedList.length > 0 ? (
            <div
              ref={scrollRef}
              className="model-list"
              style={{
                height: "100%",
                width: "100%",
                overflow: "auto",
              }}
            >
              <div
                style={{
                  height: virtualizer.getTotalSize(),
                  width: "100%",
                  position: "relative",
                }}
              >
                {virtualItems.map((vi) => {
                  const item = flattenedList[vi.index];
                  const itemStyle: React.CSSProperties = {
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: vi.size,
                    transform: `translateY(${vi.start}px)`,
                  };
                  if (item.type === "header") {
                    return (
                      <Box key={vi.key} style={itemStyle} sx={{ pt: 2, pb: 1 }}>
                        <Text size="bigger" sx={{ fontSize: "1.25em" }}>
                          {prettifyModelType(item.modelType)}
                        </Text>
                      </Box>
                    );
                  }
                  const compatibility = getModelCompatibility(item.model);
                  const cacheKey = getHfCacheKey(item.model);
                  const isCacheableHf = canCheckHfCache(item.model);
                  const isCheckingCache =
                    isCacheableHf &&
                    (cachePending[cacheKey] ||
                      cacheStatuses[cacheKey] === undefined);
                  const isDownloaded =
                    item.model.type === "llama_model"
                      ? !!item.model.downloaded
                      : cacheStatuses[cacheKey] !== undefined
                        ? !!cacheStatuses[cacheKey]
                        : !!item.model.downloaded;
                  const displayModel = {
                    ...item.model,
                    downloaded: isDownloaded
                  } as UnifiedModel & { downloaded: boolean };
                  return (
                    <Box key={vi.key} style={itemStyle}>
                      <ModelListItem
                        model={displayModel}
                        handleModelDelete={
                          displayModel.downloaded
                            ? handleDeleteClick
                            : undefined
                        }
                        onDownload={
                          !displayModel.downloaded
                            ? () => handleStartDownload(item.model)
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
                })}
              </div>
            </div>
          ) : (
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                height: "50%",
                gap: 2,
                opacity: 0.7
              }}
            >
              {modelSearchTerm ? (
                <>
                  <SearchOffIcon sx={{ fontSize: 48, opacity: 0.5 }} />
                  <Text size="normal" weight={600} color="secondary">
                    No models found for &quot;{modelSearchTerm}&quot;
                  </Text>
                  <Text size="small" color="secondary">
                    Try a different search term or adjust your filters
                  </Text>
                </>
              ) : filterStatus === "downloaded" ? (
                <>
                  <DownloadIcon sx={{ fontSize: 48, opacity: 0.5 }} />
                  <Text size="normal" weight={600} color="secondary">
                    No downloaded models
                  </Text>
                  <Text size="small" color="secondary">
                    Switch to &quot;All&quot; or &quot;Available&quot; to find
                    models to download
                  </Text>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => setFilterStatus("all")}
                    sx={{ mt: 1 }}
                  >
                    Show all models
                  </Button>
                </>
              ) : (
                <>
                  <SearchOffIcon sx={{ fontSize: 48, opacity: 0.5 }} />
                  <Text size="normal" weight={600} color="secondary">
                    No models available
                  </Text>
                  <Text size="small" color="secondary">
                    Try adjusting the size filter or selecting a different
                    category
                  </Text>
                </>
              )}
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
