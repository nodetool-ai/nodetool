import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { EditorButton, FlexRow, Text, SearchInput, ListGroup, getSpacingPx, SPACING, LoadingSpinner } from "../ui_primitives";
import { UnifiedModel } from "../../stores/ApiTypes";
import ModelListItem from "./model_list/ModelListItem";
import { useTheme } from "@mui/material/styles";
import AnnouncementIcon from "@mui/icons-material/Announcement";
import FolderOutlined from "@mui/icons-material/FolderOutlined";
import {
  isFileExplorerAvailable,
  openHuggingfacePath,
  openOllamaPath
} from "../../utils/fileExplorer";
import { isLocalhost } from "../../lib/env";
import { useHfCacheStatusStore } from "../../stores/HfCacheStatusStore";
import { useShallow } from "zustand/react/shallow";
import {
  buildHfCacheRequest,
  canCheckHfCache,
  getHfCacheKey
} from "../../utils/hfCache";

interface RecommendedModelsProps {
  recommendedModels: UnifiedModel[];
  startDownload: (model: UnifiedModel) => void;
}

const RecommendedModelsInner: React.FC<RecommendedModelsProps> = ({
  recommendedModels,
  startDownload
}) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const [searchQuery, setSearchQuery] = useState("");
  const { cacheStatuses, cachePending, cacheVersion, ensureStatuses } =
    useHfCacheStatusStore(
      useShallow((state) => ({
        cacheStatuses: state.statuses,
        cachePending: state.pending,
        cacheVersion: state.version,
        ensureStatuses: state.ensureStatuses
      }))
    );

  const filteredModels = useMemo(() => {
    if (!searchQuery) {return recommendedModels;}
    const query = searchQuery.toLowerCase();
    return recommendedModels.filter((model) => {
      const matches =
        model.name.toLowerCase().includes(query) ||
        model.id.toLowerCase().includes(query) ||
        model.pipeline_tag?.toLowerCase().includes(query) ||
        model.tags?.some((tag) => tag.toLowerCase().includes(query));

      return matches;
    });
  }, [recommendedModels, searchQuery]);

  useEffect(() => {
    const requests = filteredModels
      .map((model) => buildHfCacheRequest(model))
      .filter((request): request is NonNullable<typeof request> => request !== null);

    if (requests.length === 0) {
      return;
    }

    void ensureStatuses(requests);
  }, [ensureStatuses, filteredModels, cacheVersion]);

  const displayModels = useMemo(() => {
    return filteredModels.map((model) => {
      const isDownloaded =
        model.type === "llama_model" || !!cacheStatuses[getHfCacheKey(model)];
      return {
        ...model,
        downloaded: isDownloaded
      };
    });
  }, [cacheStatuses, filteredModels]);

  const handleDownload = useCallback(
    (model: UnifiedModel) => {
      startDownload(model);
    },
    [startDownload]
  );

  const downloadHandlers = useMemo(() => {
    const map = new Map<string, () => void>();
    for (const model of displayModels) {
      map.set(model.id, () => handleDownload(model));
    }
    return map;
  }, [displayModels, handleDownload]);

  if (!recommendedModels) {
    return <LoadingSpinner size="small" />;
  }

  return (
    <>
      <FlexRow
        className="search-models-container"
        gap={2}
        align="center"
        sx={{ marginBottom: 2 }}
      >
        <SearchInput
          className="search-models-input"
          placeholder={t("i18n-next55.recommendedModels.searchPlaceholder")}
          size="small"
          value={searchQuery}
          onChange={setSearchQuery}
          fullWidth
        />
      </FlexRow>

      {displayModels.length === 0 ? (
        <Text
          sx={{ color: "var(--palette-grey-200)", ml: 2, mt: 8, mb: 8 }}
        >
          {searchQuery
            ? t("i18n-next55.recommendedModels.noModelsFoundFor", {
                query: searchQuery
              })
            : t("i18n-next55.recommendedModels.noModelsFound")}
        </Text>
      ) : (
        <ListGroup>
          {displayModels.map((model) => {
            const cacheKey = getHfCacheKey(model);
            const isCacheable = canCheckHfCache(model);
            const isCheckingCache =
              isCacheable &&
              (cachePending[cacheKey] || cacheStatuses[cacheKey] === undefined);
            return (
              <ModelListItem
                compactView={true}
                key={model.id}
                model={model}
                onDownload={downloadHandlers.get(model.id)!}
                isCheckingCache={isCheckingCache}
              />
            );
          })}
        </ListGroup>
      )}
      <Text
        sx={{ marginTop: getSpacingPx(SPACING.xl), color: theme.vars.palette.grey[100] }}
        component="div"
      >
        <AnnouncementIcon
          fontSize="small"
          sx={{
            verticalAlign: "middle",
            marginRight: getSpacingPx(SPACING.md),
            color: theme.vars.palette.warning.main
          }}
        />
        {t("i18n-next55.recommendedModels.cacheLocationInfo")}
      </Text>
      <Text
        sx={{
          marginTop: getSpacingPx(SPACING.lg),
          color: theme.vars.palette.grey[200],
          maxWidth: "52rem",
          userSelect: "text",
          cursor: "text"
        }}
        component="div"
        size="small"
      >
        {t("i18n-next55.recommendedModels.accessInfo")}
      </Text>

      {isLocalhost && isFileExplorerAvailable() && (
        <FlexRow gap={2} mt={2}>
          <EditorButton
            variant="outlined"
            density="normal"
            onClick={openHuggingfacePath}
          >
            <FolderOutlined sx={{ mr: 0.5, fontSize: "inherit" }} />
            {t("i18n-next55.recommendedModels.openHuggingFaceFolder")}
          </EditorButton>
          <EditorButton
            variant="outlined"
            density="normal"
            onClick={openOllamaPath}
          >
            <FolderOutlined sx={{ mr: 0.5, fontSize: "inherit" }} />
            {t("i18n-next55.recommendedModels.openOllamaFolder")}
          </EditorButton>
        </FlexRow>
      )}
    </>
  );
};

const RecommendedModels = memo(RecommendedModelsInner);
RecommendedModels.displayName = 'RecommendedModels';

export default RecommendedModels;
