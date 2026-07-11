import React, { memo, useState, useMemo, useEffect, useCallback } from "react";

import {
  Text,
  Caption,
  EditorButton,
  ToolbarIconButton,
  Chip,
  Box,
  ProgressBar,
  Collapse,
  MOTION,
  Card,
  BORDER_RADIUS,
  List,
  ListItem,
  ListItemText
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

interface ModelPackCardProps {
  pack: ModelPack;
  onDownloadAll: (models: UnifiedModel[]) => void;
}

const ModelPackCard: React.FC<ModelPackCardProps> = ({
  pack,
  onDownloadAll
}) => {
  const [expanded, setExpanded] = useState(false);
  const downloads = useModelDownloadStore((state) => state.downloads);
  const { cacheStatuses, cacheVersion, ensureStatuses } = useHfCacheStatusStore(
    useShallow((state) => ({
      cacheStatuses: state.statuses,
      cacheVersion: state.version,
      ensureStatuses: state.ensureStatuses
    }))
  );

  const activeDownloads = useMemo(() => {
    const activeDownloadIds = new Set(
      Object.values(downloads)
        .filter((d) => d.status === "running" || d.status === "progress")
        .map((d) => d.id)
    );
    return pack.models.filter((model) => activeDownloadIds.has(model.id));
  }, [downloads, pack.models]);

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
      sx={{
        mb: 2,
        backgroundColor: "var(--palette-grey-900)",
        border: "1px solid var(--palette-grey-700)",
        borderRadius: BORDER_RADIUS.sm,
        transition: MOTION.border,
        "&:hover": {
          borderColor: "var(--palette-grey-500)"
        }
      }}
    >
      <Box sx={{ p: 2, pb: 1 }}>
        <Box display="flex" alignItems="flex-start" gap={2}>
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
            <Box display="flex" alignItems="center" gap={1} mb={0.5}>
              <Text size="normal" weight={600}>
                {pack.title}
              </Text>
              {allDownloaded && (
                <CheckCircleIcon
                  sx={{ color: "var(--palette-success-main)", fontSize: 20 }}
                />
              )}
            </Box>
            <Text
              size="small"
              color="secondary"
              sx={{ mb: 1 }}
            >
              {pack.description}
            </Text>
            <Box display="flex" gap={1} flexWrap="wrap">
              {pack.tags?.slice(0, 4).map((tag) => (
                <Chip
                  key={tag}
                  label={tag}
                  size="small"
                  sx={{
                    backgroundColor: "var(--palette-grey-800)",
                    color: "var(--palette-grey-200)"
                  }}
                />
              ))}
              <Chip
                label={`${pack.models.length} model${pack.models.length > 1 ? "s" : ""}`}
                size="small"
                sx={{
                  backgroundColor: "var(--palette-grey-700)",
                  color: "var(--palette-grey-100)"
                }}
              />
              {pack.total_size && (
                <Chip
                  label={formatBytes(pack.total_size)}
                  size="small"
                  sx={{
                    backgroundColor: "var(--palette-grey-700)",
                    color: "var(--palette-grey-100)"
                  }}
                />
              )}
            </Box>
          </Box>
        </Box>

        {isDownloading && (
          <Box mt={2}>
            <ProgressBar
              value={downloadProgress}
              showValue={false}
              sx={{
                borderRadius: BORDER_RADIUS.lg,
                backgroundColor: "var(--palette-grey-700)"
              }}
            />
            <Caption color="secondary">
              Downloading {activeDownloads.length} of {pack.models.length} models…
            </Caption>
          </Box>
        )}
      </Box>

      <Box sx={{ px: 2, pb: 2, pt: 0, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
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
            ? "All Downloaded"
            : someDownloaded
              ? `Download ${pack.models.length - downloadedModels.size} Remaining`
              : "Download All"}
        </EditorButton>

        <ToolbarIconButton
          icon={<ExpandMoreIcon />}
          tooltip={expanded ? "Collapse model pack details" : "Expand model pack details"}
          onClick={handleToggleExpanded}
          sx={{
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            transition: MOTION.transform
          }}
          size="small"
        />
      </Box>

      <Collapse in={expanded}>
        <Box px={2} pb={2}>
          <Text
            size="small" weight={500}
            color="secondary"
            sx={{ mb: 1 }}
          >
            Included Models:
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
                      fontSize: 18,
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
