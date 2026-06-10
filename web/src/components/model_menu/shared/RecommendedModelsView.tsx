import React, { useCallback, useEffect, useMemo } from "react";
import { List } from "@mui/material";
import { Caption, FlexColumn, Text, Box } from "../../ui_primitives";
import ModelListItem from "../../hugging_face/model_list/ModelListItem";
import ModelPackCard from "../../hugging_face/ModelPackCard";
import type { ModelPack, UnifiedModel } from "../../../stores/ApiTypes";
import { useModelDownloadStore } from "../../../stores/ModelDownloadStore";
import { useHfCacheStatusStore } from "../../../stores/HfCacheStatusStore";
import { useWorkers } from "../../../hooks/useWorkers";
import { useWorkerCachedModels } from "../../../hooks/useWorkerCachedModels";
import {
  buildHfCacheRequest,
  canCheckHfCache,
  getHfCacheKey
} from "../../../utils/hfCache";

interface RecommendedModelsViewProps {
  recommendedModels: UnifiedModel[];
  modelPacks: ModelPack[];
  searchQuery?: string;
  onSelect?: (model: UnifiedModel) => void;
}

const RecommendedModelsView: React.FC<RecommendedModelsViewProps> = ({
  recommendedModels,
  modelPacks,
  searchQuery = "",
  onSelect
}) => {

  const startDownload = useModelDownloadStore((s) => s.startDownload);
  const cacheStatuses = useHfCacheStatusStore((s) => s.statuses);
  const cachePending = useHfCacheStatusStore((s) => s.pending);
  const cacheVersion = useHfCacheStatusStore((s) => s.version);
  const ensureStatuses = useHfCacheStatusStore((s) => s.ensureStatuses);
  const { activeWorker } = useWorkers();
  const { ids: workerCachedIds, isLoading: workerCacheLoading } =
    useWorkerCachedModels();

  const handleStartDownload = useCallback(
    (model: UnifiedModel) => {
      const repoId = model.repo_id || model.id;
      // When a worker is attached, the node will run on it, so its model must
      // live on the worker — route the download there.
      const downloadScope = activeWorker ? "worker" : "local";
      startDownload(
        repoId,
        model.type ?? "",
        model.path ?? undefined,
        model.path ? undefined : (model.allow_patterns ?? undefined),
        model.path ? undefined : (model.ignore_patterns ?? undefined),
        downloadScope
      );
    },
    [startDownload, activeWorker]
  );

  const handleDownloadAllFromPack = useCallback(
    (models: UnifiedModel[]) => {
      models.forEach((m) => handleStartDownload(m));
    },
    [handleStartDownload]
  );

  const filteredModels = useMemo(() => {
    if (!searchQuery) return recommendedModels;
    const q = searchQuery.toLowerCase();
    return recommendedModels.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        m.pipeline_tag?.toLowerCase().includes(q) ||
        m.tags?.some((tag) => tag.toLowerCase().includes(q))
    );
  }, [recommendedModels, searchQuery]);

  useEffect(() => {
    // When a worker is attached, downloaded state comes from the worker's
    // cache list — local FS cache is irrelevant.
    if (activeWorker) return;
    const requests = filteredModels
      .map(buildHfCacheRequest)
      .filter((r): r is NonNullable<typeof r> => r !== null);
    if (requests.length === 0) return;
    void ensureStatuses(requests);
  }, [ensureStatuses, filteredModels, cacheVersion, activeWorker]);

  const displayModels = useMemo(() => {
    return filteredModels.map((model) => {
      const cacheKey = getHfCacheKey(model);
      // When a worker is attached, authoritative downloaded state comes from
      // the worker's cache list.  Fall back to local HF cache otherwise.
      const downloaded =
        model.downloaded === true ||
        model.type === "llama_model" ||
        (activeWorker
          ? workerCachedIds.has(cacheKey)
          : !!cacheStatuses[cacheKey]);
      return { ...model, downloaded } as UnifiedModel & { downloaded: boolean };
    });
  }, [cacheStatuses, filteredModels, activeWorker, workerCachedIds]);

  return (
    <FlexColumn
      fullHeight
      sx={{ minHeight: 0 }}
    >
      <Box sx={{ flex: 1, overflow: "auto", px: 2, py: 1.5 }}>
        {modelPacks.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Caption
              sx={{
                textTransform: "uppercase",
                fontWeight: 600,
                color: "text.secondary",
                letterSpacing: 0.5,
                mb: 1,
                display: "block"
              }}
            >
              Model Packs
            </Caption>
            {modelPacks.map((pack) => (
              <ModelPackCard
                key={pack.id}
                pack={pack}
                onDownloadAll={handleDownloadAllFromPack}
              />
            ))}
          </Box>
        )}

        {recommendedModels.length > 0 && (
          <Box>
            {modelPacks.length > 0 && (
              <Caption
                sx={{
                  textTransform: "uppercase",
                  fontWeight: 600,
                  color: "text.secondary",
                  letterSpacing: 0.5,
                  mb: 1,
                  display: "block"
                }}
              >
                Individual Models
              </Caption>
            )}
            {displayModels.length === 0 ? (
              <Text sx={{ color: "text.secondary", mt: 4 }}>
                No models found{searchQuery ? ` for "${searchQuery}"` : ""}.
              </Text>
            ) : (
              <List disablePadding>
                {displayModels.map((model) => {
                  const cacheKey = getHfCacheKey(model);
                  const isCacheable = canCheckHfCache(model);
                  // Downloaded state resolves from the worker cache list when
                  // a worker is attached, from the local FS check otherwise.
                  const isCheckingCache = activeWorker
                    ? workerCacheLoading
                    : isCacheable &&
                      (cachePending[cacheKey] ||
                        cacheStatuses[cacheKey] === undefined);
                  return (
                    <ModelListItem
                      compactView
                      key={`${model.provider ?? ""}:${model.id}:${model.path ?? ""}`}
                      model={model}
                      onDownload={() => handleStartDownload(model)}
                      onSelect={onSelect ? () => onSelect(model) : undefined}
                      isCheckingCache={isCheckingCache}
                    />
                  );
                })}
              </List>
            )}
          </Box>
        )}

        {modelPacks.length === 0 && recommendedModels.length === 0 && (
          <Text sx={{ color: "text.secondary", mt: 4 }}>
            No recommended downloads for this node.
          </Text>
        )}
      </Box>
    </FlexColumn>
  );
};

export default React.memo(RecommendedModelsView);
