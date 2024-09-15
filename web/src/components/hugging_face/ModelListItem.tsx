/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React from "react";
import {
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Typography,
  Tooltip,
  CircularProgress,
  Chip,
  Box
} from "@mui/material";
import CloudDownloadIcon from "@mui/icons-material/CloudDownload";
import FavoriteIcon from "@mui/icons-material/Favorite";
import ThemeNodetool from "../themes/ThemeNodetool";
import { TOOLTIP_ENTER_DELAY } from "../node/BaseNode";
import { useQuery } from "@tanstack/react-query";
import {
  ModelComponentProps,
  formatId,
  modelSize,
  ModelExternalLink,
  renderModelSecondaryInfo,
  renderModelActions,
  fetchOllamaModelInfo
} from "./ModelUtils";
import { fetchModelInfo } from "../../utils/huggingFaceUtils";

const styles = (theme: any) =>
  css({
    "&.model-list-item": {
      borderBottom: `1px solid ${theme.palette.divider}`,
      padding: "16px 0"
    },
    ".model-name": {
      fontWeight: "bold",
      color: theme.palette.text.primary
    },
    ".model-info": {
      color: theme.palette.text.secondary,
      fontSize: "0.875rem"
    },
    ".model-actions": {
      display: "flex",
      gap: "8px",
      alignItems: "center"
    },
    ".pipeline-tag": {
      marginRight: "8px"
    },
    ".model-stats": {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      marginRight: "16px"
    }
  });

const ModelListItem: React.FC<ModelComponentProps> = ({
  model,
  onDownload,
  handleDelete
}) => {
  const isHuggingFace = model.type.startsWith("hf.");
  const isOllama = model.type.startsWith("llama_model");
  const downloaded = !!(model.size_on_disk && model.size_on_disk > 0);

  const { data: modelData, isLoading } = useQuery({
    queryKey: ["modelInfo", model.id],
    queryFn: () => {
      if (isHuggingFace) {
        return fetchModelInfo(model.id);
      } else if (isOllama) {
        return fetchOllamaModelInfo(model.id);
      }
      return null;
    },
    staleTime: Infinity,
    gcTime: 1000 * 60
  });

  if (isLoading) {
    return (
      <ListItem css={styles} className="model-list-item">
        <CircularProgress size={24} />
      </ListItem>
    );
  }

  if (!modelData) {
    return (
      <ListItem css={styles} className="model-list-item">
        <ListItemText
          primary={formatId(model.id)}
          secondary={
            isOllama
              ? "Model not downloaded."
              : "Failed to find matching repository."
          }
        />
        <ListItemSecondaryAction className="model-actions">
          {renderModelActions({ model, handleDelete, onDownload }, downloaded)}
          <ModelExternalLink isHuggingFace={isHuggingFace} modelId={model.id} />
        </ListItemSecondaryAction>
      </ListItem>
    );
  }

  return (
    <ListItem css={styles} className="model-list-item">
      <ListItemText
        primary={
          <Typography className="model-name">{formatId(model.id)}</Typography>
        }
        secondary={
          <React.Fragment>
            <Typography component="span" className="model-info">
              {renderModelSecondaryInfo(modelData, isHuggingFace)}
            </Typography>
            {model.size_on_disk && (
              <Tooltip enterDelay={TOOLTIP_ENTER_DELAY} title="Size on disk">
                <Typography component="span" className="model-info">
                  {" • "}
                  {modelSize(model)}
                </Typography>
              </Tooltip>
            )}
            {modelData.cardData?.pipeline_tag && (
              <Chip
                label={modelData.cardData.pipeline_tag}
                size="small"
                className="pipeline-tag"
              />
            )}
          </React.Fragment>
        }
      />
      <ListItemSecondaryAction className="model-actions">
        {isHuggingFace && (
          <Box className="model-stats">
            <Tooltip title="Downloads last month">
              <CloudDownloadIcon fontSize="small" />
            </Tooltip>
            <Typography variant="body2">
              {modelData.downloads?.toLocaleString() || "N/A"}
            </Typography>
            <FavoriteIcon fontSize="small" />
            <Typography variant="body2">
              {modelData.likes?.toLocaleString() || "N/A"}
            </Typography>
          </Box>
        )}
        {renderModelActions({ model, handleDelete, onDownload }, downloaded)}
        <ModelExternalLink isHuggingFace={isHuggingFace} modelId={model.id} />
      </ListItemSecondaryAction>
    </ListItem>
  );
};

export default ModelListItem;
