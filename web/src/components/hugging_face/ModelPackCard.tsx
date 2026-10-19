import React, { memo, useState, useMemo, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";

import {
  Text,
  Caption,
  EditorButton,
  ToolbarIconButton,
  Chip,
  Box,
  FlexRow,
  ProgressBar,
  Collapse,
  MOTION,
  Card,
  BORDER_RADIUS,
  List,
  ListItem,
  ListItemText,
  ICON_SIZE
} from "../ui_primitives";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import DownloadIcon from "@mui/icons-material/Download";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import InventoryIcon from "@mui/icons-material/Inventory";
import { ModelPack, UnifiedModel } from "../../stores/ApiTypes";
import { useModelDownloadStore } from "../../stores/ModelDownloadStore";
import { formatBytes } from "../../utils/modelFormatting";
import { useHfCacheStatusStore } from "../../stores/HfCacheStatusStore";
import { useShallow } from "zustand/react/shallow";
import {
  buildHfCacheRequest,
  canCheckHfCache,
  getHfCacheKey
} from "../../utils/hfCache";
import { Tooltip } from "../ui_primitives";
import { useModelDownloadTarget } from "../../hooks/useModelDownloadTarget";

interface ModelPackCardProps {
  pack: ModelPack;
  onDownloadAll: (models: UnifiedModel[]) => void;
}

const ModelPackCard: React.FC<ModelPackCardProps> = ({
  pack,
  onDownloadAll
}) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const packModelIds = useMemo(
    () => pack.models.map((m) => m.id),
    [pack.models]
  );
  const activeDownloadSelector = useCallback(
    (state: ReturnType<typeof useModelDownloadStore.getState>) => {
      const parts: string[] = [];
      for (const id of packModelIds) {
        const d = state.downloads[id];
        if (d && (d.status === "running" || d.status === "progress")) {
          parts.push(id);
        }
      }
      return parts.join("\0");
    },
    [packModelIds]
  );
  const activeDownloadKey = useModelDownloadStore(activeDownloadSelector);
  const activeDownloadSet = useMemo(
    () => new Set(activeDownloadKey ? activeDownloadKey.split("\0") : []),
    [activeDownloadKey]
  );
  const { cacheStatuses, cacheVersion, ensureStatuses } = useHfCacheStatusStore(
    useShallow((state) => ({
      cacheStatuses: state.statuses,
      cacheVersion: state.version,
      ensureStatuses: state.ensureStatuses
    }))
  );
  const downloadTarget = useModelDownloadTarget();

  const activeDownloads = useMemo(
    () => pack.models.filter((model) => activeDownloadSet.has(model.id)),
    [activeDownloadSet, pack.models]
  );

  useEffect(() => {
    const requests = pack.models
      .map((model) => buildHfCacheRequest(model))
      .filter((request): request is NonNullable<typeof request> => request !== null);

    if (requests.length === 0) {
      return;
    }

    void ensureStatuses(requests);
  }, [ensureStatuses, pack.models, cacheVersion]);

  const downloadedModels = useMemo(() => {
    const downloaded = new Set<string>();
    pack.models.forEach((model) => {
      if (canCheckHfCache(model)) {
        const key = getHfCacheKey(model);
        if (cacheStatuses[key]) {
          downloaded.add(model.id);
        }
      } else if (model.type === "llama_model") {
        downloaded.add(model.id);
      }
    });
    return downloaded;
  }, [cacheStatuses, pack.models]);

  const allDownloaded = downloadedModels.size === pack.models.length;
  const someDownloaded =
    downloadedModels.size > 0 && downloadedModels.size < pack.models.length;
  const isDownloading = activeDownloads.length > 0;

  const downloadProgress = useMemo(() => {
    if (!isDownloading) {return 0;}
    const total = pack.models.length;
    const completed = downloadedModels.size;
    return (completed / total) * 100;
  }, [isDownloading, pack.models.length, downloadedModels.size]);

  const handleDownloadAll = useCallback(() => {
    const modelsToDownload = pack.models.filter(
      (m) => !downloadedModels.has(m.id)
    );
    if (modelsToDownload.length > 0) {
      onDownloadAll(modelsToDownload);
    }
  }, [onDownloadAll, pack.models, downloadedModels]);

  const handleToggleExpanded = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  return (
    <Card
      padding="none"
      variant="outlined"
      radius="sm"
      sx={{
        mb: 2,
        transition: MOTION.border,
        "&:hover": {
          borderColor: "text.disabled"
        }
      }}
    >
      <Box sx={{ p: 2, pb: 1 }}>
        <FlexRow align="flex-start" gap={2}>
          <InventoryIcon
            sx={{
              color: allDownloaded
                ? "var(--palette-success-main)"
                : "var(--palette-primary-main)",
              fontSize: 32,
              mt: 0.5
            }}
          />
          <Box flex={1}>
            <FlexRow align="center" gap={1} mb={0.5}>
              <Text size="normal" weight={600}>
                {pack.title}
              </Text>
              {allDownloaded && (
                <CheckCircleIcon
                  sx={{ color: "var(--palette-success-main)", fontSize: ICON_SIZE.lg }}
                />
              )}
            </FlexRow>
            <Text
              size="small"
              color="secondary"
              sx={{ mb: 1 }}
            >
              {pack.description}
            </Text>
            <FlexRow gap={1} wrap>
              {pack.tags?.slice(0, 4).map((tag) => (
                <Chip
                  key={tag}
                  label={tag}
                  compact
                />
              ))}
              <Chip
                label={t("i18n-next55.modelPack.modelCount", {
                  count: pack.models.length
                })}
                compact
              />
              {pack.total_size && (
                <Chip
                  label={formatBytes(pack.total_size)}
                  compact
                />
              )}
            </FlexRow>
          </Box>
        </FlexRow>

        {isDownloading && (
          <Box mt={2}>
            <ProgressBar
              value={downloadProgress}
              showValue={false}
            />
            <Caption color="secondary">
              {t("i18n-next55.modelPack.downloadingProgress", {
                active: activeDownloads.length,
                total: pack.models.length,
                count: pack.models.length
              })}
            </Caption>
          </Box>
        )}
      </Box>

      <FlexRow align="center" justify="space-between" sx={{ px: 2, pb: 2, pt: 0 }}>
        <Tooltip
          title={
            pack.total_size
              ? t("i18n-next55.modelPack.downloadToTarget", {
                  size: formatBytes(pack.total_size),
                  target: downloadTarget.label
                })
              : t("i18n-next55.modelPack.downloadsToTarget", {
                  target: downloadTarget.label
                })
          }
        >
          <EditorButton
            variant={allDownloaded ? "outlined" : "contained"}
            size="small"
            startIcon={allDownloaded ? <CheckCircleIcon /> : <DownloadIcon />}
            onClick={handleDownloadAll}
            disabled={allDownloaded || isDownloading}
            sx={{
              textTransform: "none",
              fontWeight: 600
            }}
          >
            {allDownloaded
              ? t("i18n-next55.modelPack.allDownloaded")
              : someDownloaded
                ? t("i18n-next55.modelPack.downloadRemaining", {
                    count: pack.models.length - downloadedModels.size
                  })
                : t("i18n-next55.modelPack.downloadAll")}
          </EditorButton>
        </Tooltip>

        <ToolbarIconButton
          icon={<ExpandMoreIcon />}
          tooltip={
            expanded
              ? t("i18n-next55.modelPack.collapseDetails")
              : t("i18n-next55.modelPack.expandDetails")
          }
          onClick={handleToggleExpanded}
          sx={{
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            transition: MOTION.transform
          }}
          size="small"
        />
      </FlexRow>

      <Collapse in={expanded}>
        <Box px={2} pb={2}>
          <Text
            size="small" weight={500}
            color="secondary"
            sx={{ mb: 1 }}
          >
            {t("i18n-next55.modelPack.includedModels")}
          </Text>
          <List dense disablePadding>
            {pack.models.map((model) => (
              <ListItem
                key={model.id}
                sx={{
                  py: 0.5,
                  px: 1,
                  backgroundColor: "var(--palette-grey-800)",
                  borderRadius: BORDER_RADIUS.xs,
                  mb: 0.5
                }}
              >
                <ListItemText
                  primary={model.name || model.id}
                  secondary={`${model.repo_id}/${model.path}`}
                  primaryTypographyProps={{
                    variant: "body2",
                    sx: { fontWeight: 500 }
                  }}
                  secondaryTypographyProps={{
                    variant: "caption",
                    sx: { color: "var(--palette-grey-500)" }
                  }}
                />
                {downloadedModels.has(model.id) && (
                  <CheckCircleIcon
                    sx={{
                      color: "var(--palette-success-main)",
                      fontSize: ICON_SIZE.md,
                      ml: 1
                    }}
                  />
                )}
                {model.size_on_disk && (
                  <Caption
                    sx={{ color: "var(--palette-grey-500)", ml: 1 }}
                  >
                    {formatBytes(model.size_on_disk)}
                  </Caption>
                )}
              </ListItem>
            ))}
          </List>
        </Box>
      </Collapse>
    </Card>
  );
};

export default memo(ModelPackCard);
