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
import { TOOLTIP_ENTER_DELAY } from "../node/BaseNode";
import { useQuery } from "@tanstack/react-query";
import {
  ModelComponentProps,
  formatId,
  modelSize,
  renderModelSecondaryInfo,
  renderModelActions,
  fetchOllamaModelInfo,
  HuggingFaceLink,
  OllamaLink
} from "./ModelUtils";
import { fetchModelInfo } from "../../utils/huggingFaceUtils";
import ThemeNodetool from "../themes/ThemeNodetool";

const styles = (theme: any) =>
  css({
    "&.model-list-item-container": {
      padding: "0 0 1em 1em",
      marginBottom: ".5em",
      backgroundColor: theme.palette.c_gray1,

      "& .model-name": {
        fontWeight: "bold",
        textTransform: "uppercase",
        color: theme.palette.c_hl1
      },
      "& .model-info": {
        color: theme.palette.text.secondary,
        fontSize: "0.875rem"
      },
      "& .pipeline-tag": {
        marginRight: "1em"
      },
      "& .model-stats": {
        display: "flex",
        alignItems: "center",
        gap: "1em",
        marginRight: "16px"
      }
    },
    ".model-external-link-icon": {
      boxShadow: "none",
      cursor: "pointer",
      backgroundColor: "transparent",
      filter: "saturate(0)",
      transition: "transform 0.125s ease-in, filter 0.2s ease-in",
      "&:hover": {
        backgroundColor: "transparent",
        transform: "scale(1.5)",
        filter: "saturate(1)"
      }
    },
    ".model-external-link-icon img": {
      cursor: "pointer"
    }
  });

const ModelListItem: React.FC<ModelComponentProps> = ({
  model,
  onDownload,
  handleDelete
}) => {
  const isHuggingFace = model.type.startsWith("hf.");
  const isOllama = model.type.toLowerCase().includes("ollama");
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
      <Box css={styles} className="model-list-item-container">
        <ListItem>
          <ListItemText
            primary={formatId(model.id)}
            secondary={
              isOllama ? (
                "Model not downloaded."
              ) : (
                <span style={{ color: ThemeNodetool.palette.c_warning }}>
                  Failed to find matching repository.
                </span>
              )
            }
          />
          <ListItemSecondaryAction
            sx={{
              display: "flex",
              gap: "1em",
              alignItems: "center"
            }}
          >
            {isHuggingFace && <HuggingFaceLink modelId={model.id} />}
            {isOllama && <OllamaLink modelId={model.id} />}
            {renderModelActions(
              { model, handleDelete, onDownload },
              downloaded
            )}
          </ListItemSecondaryAction>
        </ListItem>
      </Box>
    );
  }

  return (
    <Box css={styles} className="model-list-item-container">
      <ListItem className="model-list-item">
        <ListItemText
          primary={<Typography className="model-name">{model.id}</Typography>}
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
        <ListItemSecondaryAction
          sx={{
            display: "flex",
            gap: "1em",
            alignItems: "center"
          }}
        >
          {isHuggingFace && (
            <Box className="model-stats" sx={{ display: "flex", gap: ".5em" }}>
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
          {isHuggingFace && <HuggingFaceLink modelId={model.id} />}
          {isOllama && <OllamaLink modelId={model.id} />}
          <Box sx={{ display: "flex", gap: "1.5em" }}>
            {renderModelActions(
              { model, handleDelete, onDownload },
              downloaded
            )}
          </Box>
        </ListItemSecondaryAction>
      </ListItem>
    </Box>
  );
};

export default ModelListItem;
