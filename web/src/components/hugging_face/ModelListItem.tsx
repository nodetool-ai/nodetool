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
import {
  ModelComponentProps,
  formatId,
  modelSize,
  renderModelSecondaryInfo,
  renderModelActions,
  HuggingFaceLink,
  OllamaLink
} from "./ModelUtils";
import ThemeNodetool from "../themes/ThemeNodetool";
import { useModelInfo } from "./ModelUtils";

const styles = (theme: any) =>
  css({
    "&.model-list-item": {
      padding: "0 0 1em 1em",
      marginBottom: ".5em",
      backgroundColor: theme.palette.c_gray1,
      boxSizing: "border-box",
      border: "1px solid transparent",
      borderRadius: ".25em",
      transition: "border 0.125s ease-in",

      "&.compact": {
        padding: 0,
        backgroundColor: theme.palette.c_gray0
      },
      "&.compact li": {
        display: "flex",
        flexDirection: "column",
        gap: ".5em",
        alignItems: "flex-start"
      },
      "&.model-list-item:hover": {
        border: "1px solid" + theme.palette.c_gray2
      },
      "& .model-name": {
        fontWeight: "bold",
        textTransform: "uppercase",
        color: theme.palette.c_hl1,
        width: "400px",
        display: "inline-block"
      },
      "& .model-path": {},
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
      },
      "& .secondary-action": {
        display: "flex",
        gap: ".1em",
        alignItems: "center",
        position: "absolute"
      },
      "&.compact .secondary-action": {
        position: "relative",
        right: "unset",
        left: "1em"
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
  handleDelete,
  compactView = false
}) => {
  const { modelData, isLoading, downloaded, isHuggingFace, isOllama } =
    useModelInfo(model);

  if (isLoading) {
    return (
      <Box
        css={styles}
        className={`model-list-item ${compactView ? "compact" : ""}`}
      >
        <ListItem className={`model-list-item ${compactView ? "compact" : ""}`}>
          <CircularProgress size={24} />
        </ListItem>
      </Box>
    );
  }

  if (!modelData) {
    return (
      <Box
        css={styles}
        className={`model-list-item ${compactView ? "compact" : ""}`}
      >
        <ListItem className={`model-list-item ${compactView ? "compact" : ""}`}>
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
          <ListItemSecondaryAction className="secondary-action">
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
    <Box
      css={styles}
      className={`model-list-item ${compactView ? "compact" : ""}`}
    >
      <ListItem>
        <ListItemText
          primary={
            <>
              <Typography component="span" className="model-name">
                {model.repo_id ? model.repo_id : model.id}{" "}
              </Typography>
              {model.path && (
                <Typography component="span" className="model-path">
                  {model.path}
                </Typography>
              )}
            </>
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
                  component="span"
                />
              )}
            </React.Fragment>
          }
          secondaryTypographyProps={{ component: "div" }} // Add this line
        />
        <ListItemSecondaryAction className="secondary-action">
          {isHuggingFace && (
            <Box className="model-stats" sx={{ display: "flex", gap: ".5em" }}>
              <Tooltip title="Downloads on HF last month">
                <CloudDownloadIcon fontSize="small" />
              </Tooltip>
              <Typography component="span" variant="body2">
                {modelData.downloads?.toLocaleString() || "N/A"}
              </Typography>
              <Tooltip title="Likes on HF">
                <FavoriteIcon fontSize="small" />
              </Tooltip>
              <Typography component="span" variant="body2">
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
