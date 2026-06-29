/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { FlexColumn, FlexRow, Box, MOTION, BORDER_RADIUS, SPACING, getSpacingPx } from "../../ui_primitives";
import { LoadingSpinner, Text } from "../../ui_primitives";
import SearchOffIcon from "@mui/icons-material/SearchOff";
import DownloadIcon from "@mui/icons-material/Download";
import { useVirtualizer } from "@tanstack/react-virtual";

import { useModels } from "./useModels";
import ModelListHeader from "./ModelListHeader";
import ModelTypeSidebar from "./ModelTypeSidebar";
import DeleteModelDialog from "./DeleteModelDialog";
import { useWorkers } from "../../../hooks/useWorkers";
import { prettifyModelType } from "../../../utils/modelFormatting";
import { IconForType } from "../../../config/IconForType";
import { useModelManagerStore } from "../../../stores/ModelManagerStore";
import ModelListItem from "./ModelListItem";
import ModelsRightSidebar from "./ModelsRightSidebar";
import LocalModelsHero from "./LocalModelsHero";
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
      paddingBottom: `calc(${getSpacingPx(SPACING.micro)} * 125)` // was 250px
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
      fontSize: "var(--fontSizeNormal)"
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
      transition: `background-color ${MOTION.normal}`,
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: theme.vars.palette.action.selected
    },
    ".model-type-button span": {
      display: "flex",
      alignItems: "center",
      transition: `color ${MOTION.normal}`
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
      padding: "1em 1em 4em 1em",
      position: "relative",
      minWidth: 0,
      display: "flex",
      flexDirection: "column"
    },
    ".right-sidebar": {
      flexShrink: 0,
      borderLeft: `1px solid ${theme.vars.palette.divider}`
    },
    ".model-list-section": {
      marginBottom: theme.spacing(6)
    }
  });

type ListItem =
  | { type: "header"; modelType: string }
  | { type: "model"; model: UnifiedModel };

const ModelListIndex: React.FC = () => {
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);
  const [modelToDelete, setModelToDelete] = useState<string | null>(null);
  const selectedModelType = useModelManagerStore((state) => state.selectedModelType);
  const setSelectedModelType = useModelManagerStore(
    (state) => state.setSelectedModelType
  );
  const modelSearchTerm = useModelManagerStore((state) => state.modelSearchTerm);
  const setModelSearchTerm = useModelManagerStore(
    (state) => state.setModelSearchTerm
  );
  const scope = useModelManagerStore((state) => state.scope);
  const setScope = useModelManagerStore((state) => state.setScope);
  const source = useModelManagerStore((state) => state.source);
  const setSource = useModelManagerStore((state) => state.setSource);
  const { activeWorker } = useWorkers();
  const workerName = activeWorker?.profile_name ?? activeWorker?.id ?? null;
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
  } = useModels(scope);

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
      // Route to the attached worker whenever one is attached — that's where
      // the model is needed (execution runs there). The Local/Worker view
      // toggle only changes what you SEE, not where downloads land.
      const downloadScope = activeWorker ? "worker" : "local";
      startDownload(
        repoId,
        model.type ?? "",
        path ?? undefined,
        allowPatterns,
        ignorePatterns,
        downloadScope
      );
      openDialog();
    },
    [startDownload, openDialog, activeWorker]
  );

  const handleScopeChange = useCallback(
    (nextScope: typeof scope) => {
      if (nextScope === scope) {
        return;
      }
      // Filters and search are scope-specific; reset them so the new view
      // does not inherit stale cross-scope state.
      setScope(nextScope);
      setModelSearchTerm("");
      setSelectedModelType("All");
    },
    [scope, setScope, setModelSearchTerm, setSelectedModelType]
  );

  const handleSourceChange = useCallback(
    (nextSource: typeof source) => {
      if (nextSource === source) {
        return;
      }
      // The installed and recommended catalogs are different datasets; reset the
      // view filters so the new one starts clean instead of inheriting stale
      // type/status selections.
      setSource(nextSource);
      setModelSearchTerm("");
      setSelectedModelType("All");
    },
    [source, setSource, setModelSearchTerm, setSelectedModelType]
  );

  // Flatten the model list with headers for "All" view
  const flattenedList = useMemo(() => {
    if (selectedModelType !== "All") {
      return filteredModels.map(
        (model): ListItem => ({ type: "model", model })
      );
    }

    const grouped = new Map<string, UnifiedModel[]>();
    for (const model of filteredModels) {
      const key = model.type ?? "";
      const list = grouped.get(key);
      if (list) {
        list.push(model);
      } else {
        grouped.set(key, [model]);
      }
    }

    const items: ListItem[] = [];
    for (const modelType of modelTypes.slice(1)) {
      const models = grouped.get(modelType);
      if (models && models.length > 0) {
        items.push({ type: "header", modelType });
        for (const model of models) {
          items.push({ type: "model", model });
        }
      }
    }
    return items;
  }, [selectedModelType, modelTypes, filteredModels]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: flattenedList.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) =>
      flattenedList[index]?.type === "header" ? 48 : 168,
    overscan: theme.virtualScroll.overscan.small,
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
    // The HF cache store scans the LOCAL filesystem; for the worker scope the
    // list already carries authoritative downloaded flags, so skip it.
    if (scope === "worker") {
      return;
    }
    const requests = visibleModels
      .map((model) => buildHfCacheRequest(model))
      .filter(
        (request): request is NonNullable<typeof request> => request !== null
      );

    if (requests.length === 0) {
      return;
    }

    void ensureStatuses(requests);
  }, [ensureStatuses, visibleModels, cacheVersion, scope]);

  // If the attached worker goes away (detach / instance gone) while the Worker
  // scope is active, fall back to Local. Otherwise the toggle is hidden and the
  // worker-scoped query keeps erroring with no in-session way back.
  useEffect(() => {
    if (scope === "worker" && workerName == null) {
      setScope("local");
    }
  }, [scope, workerName, setScope]);

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
      <FlexColumn
        gap={2}
        align="center"
        justify="center"
        fullHeight
        padding={4}
        sx={{ textAlign: "center" }}
      >
        <Text size="big" color="error">
          Could not load models
        </Text>
        <Text
          size="normal"
          color="secondary"
          sx={{ maxWidth: 600 }}
        >
          {errorMessage}
        </Text>
        {isOllamaError && (
          <FlexColumn gap={1} sx={{ mt: 1 }}>
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
                sx={{ textDecoration: "underline" }}
                color="primary"
              >
                Download Ollama →
              </Text>
            )}
          </FlexColumn>
        )}
      </FlexColumn>
    );
  }

  return (
    <Box className="model-list-container" css={cssStyles}>
      <Box className="model-list-header">
        <ModelListHeader
          totalCount={allModels?.length || 0}
          filteredCount={filteredModels.length}
          scope={scope}
          onScopeChange={handleScopeChange}
          source={source}
          onSourceChange={handleSourceChange}
          workerName={workerName}
          workerSupported={workerName != null}
        />
      </Box>
      <Box className="main">
        <Box className="sidebar">
          <ModelTypeSidebar />
        </Box>

        <Box className="content">
          <LocalModelsHero models={allModels ?? []} />
          {isFetching && (
            <Box sx={{ position: "absolute", top: "1em", right: "1em", zIndex: 1 }}>
              <LoadingSpinner size="small" />
            </Box>
          )}
          {modelSearchTerm && selectedModelType === "All" && (
            <Text size="normal" weight={600} sx={{ mb: 2, display: "block" }}>
              Searched models for &quot;{modelSearchTerm}&quot;
            </Text>
          )}
          {selectedModelType !== "All" && (
            <FlexRow
              gap={2}
              align="flex-start"
              sx={{
                pt: 1,
                pb: 3,
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
                  borderRadius: BORDER_RADIUS.md,
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
                <Text size="bigger" weight={600} sx={{ lineHeight: 1.2 }}>
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
            </FlexRow>
          )}
          {flattenedList.length > 0 ? (
            <div
              ref={scrollRef}
              className="model-list"
              style={{
                flex: 1,
                minHeight: 0,
                width: "100%",
                overflow: "auto"
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
                        <Text size="bigger">
                          {prettifyModelType(item.modelType)}
                        </Text>
                      </Box>
                    );
                  }
                  const compatibility = getModelCompatibility(item.model);
                  const cacheKey = getHfCacheKey(item.model);
                  const isCacheableHf = canCheckHfCache(item.model);
                  // Worker scope: the local cache store is irrelevant — trust
                  // the list's downloaded flag and never show a cache spinner.
                  const isCheckingCache =
                    scope !== "worker" &&
                    isCacheableHf &&
                    (cachePending[cacheKey] ||
                      cacheStatuses[cacheKey] === undefined);
                  const isDownloaded =
                    item.model.type === "llama_model" || scope === "worker"
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
            <FlexColumn
              gap={2}
              align="center"
              justify="center"
              sx={{
                height: "50%",
                opacity: 0.7
              }}
            >
              {modelSearchTerm ? (
                <>
                  <SearchOffIcon sx={{ fontSize: 48, opacity: 0.5 }} />
                  <Text size="normal" weight={600} color="secondary" sx={{ display: "block" }}>
                    No models found for &quot;{modelSearchTerm}&quot;
                  </Text>
                  <Text size="small" color="secondary" sx={{ display: "block" }}>
                    Try a different search term or adjust your filters
                  </Text>
                </>
              ) : source === "hub" ? (
                <>
                  <DownloadIcon sx={{ fontSize: 48, opacity: 0.5 }} />
                  <Text size="normal" weight={600} color="secondary">
                    Search the HuggingFace Hub
                  </Text>
                  <Text size="small" color="secondary">
                    Type a name above, or pick a category, to browse and download
                    any public model from huggingface.co.
                  </Text>
                </>
              ) : source === "recommended" ? (
                <>
                  <DownloadIcon sx={{ fontSize: 48, opacity: 0.5 }} />
                  <Text size="normal" weight={600} color="secondary">
                    No recommended models
                  </Text>
                  <Text size="small" color="secondary">
                    Recommended models are gathered from the nodes you have
                    installed. Add nodes that run models to see suggestions here.
                  </Text>
                </>
              ) : scope === "worker" ? (
                <>
                  <DownloadIcon sx={{ fontSize: 48, opacity: 0.5 }} />
                  <Text size="normal" weight={600} color="secondary">
                    No models cached on this worker yet
                  </Text>
                  <Text size="small" color="secondary">
                    While this worker is attached, any model you download lands
                    on its volume.
                  </Text>
                </>
              ) : (
                <>
                  <SearchOffIcon sx={{ fontSize: 48, opacity: 0.5 }} />
                  <Text size="normal" weight={600} color="secondary" sx={{ display: "block" }}>
                    No models available
                  </Text>
                  <Text size="small" color="secondary" sx={{ display: "block" }}>
                    Try adjusting the size filter or selecting a different
                    category
                  </Text>
                </>
              )}
            </FlexColumn>
          )}

          <DeleteModelDialog
            modelId={modelToDelete}
            onClose={handleCancelDelete}
            scope={scope}
          />
        </Box>

        <Box className="right-sidebar">
          <ModelsRightSidebar />
        </Box>
      </Box>
    </Box>
  );
};

export default React.memo(ModelListIndex);
