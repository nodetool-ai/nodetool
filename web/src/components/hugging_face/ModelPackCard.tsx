/**
 * ModelPackCard - Displays a curated model pack as an expandable card.
 * Shows title, description, total size, and allows one-click download of all models.
 */

import React, { useState, useMemo, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardActions,
  Typography,
  Button,
  Box,
  Collapse,
  IconButton,
  LinearProgress,
  Chip,
  List,
  ListItem,
  ListItemText
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import DownloadIcon from "@mui/icons-material/Download";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import InventoryIcon from "@mui/icons-material/Inventory";
import { ModelPack, UnifiedModel } from "../../stores/ApiTypes";
import { useModelDownloadStore } from "../../stores/ModelDownloadStore";
import { formatBytes } from "../../utils/modelFormatting";
import { useHfCacheStatusStore } from "../../stores/HfCacheStatusStore";
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
  const cacheStatuses = useHfCacheStatusStore((state) => state.statuses);
  const cacheVersion = useHfCacheStatusStore((state) => state.version);
  const ensureStatuses = useHfCacheStatusStore(
    (state) => state.ensureStatuses
  );

  // Track download progress
  const activeDownloads = useMemo(() => {
    return pack.models.filter((model) => {
      const download = Object.values(downloads).find(
        (d) => d.id === model.id && (d.status === "running" || d.status === "progress")
      );
      return !!download;
    });
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
      sx={{
        mb: 2,
        backgroundColor: "var(--palette-grey-900)",
        border: "1px solid var(--palette-grey-700)",
        borderRadius: 2,
        transition: "border-color 0.2s",
        "&:hover": {
          borderColor: "var(--palette-grey-500)"
        }
      }}
    >
      <CardContent sx={{ pb: 1 }}>
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
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                {pack.title}
              </Typography>
              {allDownloaded && (
                <CheckCircleIcon
                  sx={{ color: "var(--palette-success-main)", fontSize: 20 }}
                />
              )}
            </Box>
            <Typography
              variant="body2"
              sx={{ color: "var(--palette-grey-300)", mb: 1 }}
            >
              {pack.description}
            </Typography>
            <Box display="flex" gap={1} flexWrap="wrap">
              {pack.tags.slice(0, 4).map((tag) => (
                <Chip
                  key={tag}
                  label={tag}
                  size="small"
                  sx={{
                    backgroundColor: "var(--palette-grey-800)",
                    color: "var(--palette-grey-200)",
                    fontSize: "0.7rem"
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
            <LinearProgress
              variant="determinate"
              value={downloadProgress}
              sx={{
                height: 6,
                borderRadius: 3,
                backgroundColor: "var(--palette-grey-700)"
              }}
            />
            <Typography variant="caption" sx={{ color: "var(--palette-grey-400)" }}>
              Downloading {activeDownloads.length} of {pack.models.length} models...
            </Typography>
          </Box>
        )}
      </CardContent>

      <CardActions sx={{ px: 2, pb: 2, pt: 0, justifyContent: "space-between" }}>
        <Button
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
        </Button>

        <IconButton
          onClick={handleToggleExpanded}
          sx={{
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.3s"
          }}
          size="small"
        >
          <ExpandMoreIcon />
        </IconButton>
      </CardActions>

      <Collapse in={expanded}>
        <Box px={2} pb={2}>
          <Typography
            variant="subtitle2"
            sx={{ color: "var(--palette-grey-400)", mb: 1 }}
          >
            Included Models:
          </Typography>
          <List dense disablePadding>
            {pack.models.map((model) => (
              <ListItem
                key={model.id}
                sx={{
                  py: 0.5,
                  px: 1,
                  backgroundColor: "var(--palette-grey-800)",
                  borderRadius: 1,
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
                  <Typography
                    variant="caption"
                    sx={{ color: "var(--palette-grey-500)", ml: 1 }}
                  >
                    {formatBytes(model.size_on_disk)}
                  </Typography>
                )}
              </ListItem>
            ))}
          </List>
        </Box>
      </Collapse>
    </Card>
  );
};

export default ModelPackCard;
