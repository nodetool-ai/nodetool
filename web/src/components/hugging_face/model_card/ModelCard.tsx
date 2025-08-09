/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { useState } from "react";
import { Card, CardContent, CircularProgress } from "@mui/material";
import { ModelComponentProps } from "../ModelUtils";
import { useModelInfo } from "../../../hooks/useModelInfo";
import ModelCardActions from "./ModelCardActions";
import ModelCardContent from "./ModelCardContent";
import { isEqual } from "lodash";
import { useModelDownloadStore } from "../../../stores/ModelDownloadStore";
import { DownloadProgress } from "../DownloadProgress";

const styles = (theme: Theme) =>
  css({
    "&.model-card": {
      position: "relative",
      height: "300px",
      width: "100%",
      marginTop: ".5em",
      display: "flex",
      flexDirection: "column",
      boxShadow:
        "3px 3px 6px rgba(0, 0, 0, 0.35), -1px -2px 3px rgba(200, 200, 100, 0.1)",
      border: "4px solid rgba(0, 0, 0, .2)",
      borderRadius: "10px",
      outline: "2px solid #111",
      outlineOffset: "-3px",
      background:
        "linear-gradient(10deg, #333, #363636 65%, #363636 75%, #333)",
      transition: "all 0.15s ease-out"
    },
    "&.model-card:hover": {
      boxShadow:
        "2px 2px 3px rgba(0, 0, 0, 0.2), -1px -2px 2px rgba(180, 200, 200, 0.35)",
      background: "linear-gradient(55deg, #333, #393939 65%, #393939 75%, #333)"
    },
    "&.missing": {
      background: theme.vars.palette.grey[800]
    },
    "&.missing:hover": {
      background: theme.vars.palette.grey[800]
    },
    ".model-download-button": {
      color: "var(--palette-primary-main)",
      margin: "1em 0.1em 0 1em",
      padding: ".25em .5em",
      border: "1px solid" + theme.vars.palette.grey[500],
      "&:hover": {
        borderColor: "var(--palette-primary-main)"
      }
    },
    ".downloaded-indicator": {
      color: theme.vars.palette.success.main
    },
    ".model-downloaded-icon": {
      position: "absolute",
      top: ".6em",
      right: "2em"
    },
    ".repo-name": {
      width: "calc(100% - 2.5em)",
      padding: "0",
      margin: "0 0 .5em 0",
      fontSize: "1em",
      lineHeight: "1.3em",
      wordBreak: "break-word",
      paddingRight: "1.5em"
    },
    ".repo-name .owner": {
      fontSize: ".8em",
      color: theme.vars.palette.info.main,
      padding: "0 "
    },
    "&.missing .repo-name": {
      color: theme.vars.palette.warning.main
    },
    ".tags-container": {
      position: "relative"
    },
    ".pipeline-tag": {
      fontFamily: theme.fontFamily2,
      lineHeight: "1.1em",
      width: "fit-content",
      wordBreak: "break-word",
      color: theme.vars.palette.grey[900],
      backgroundColor: theme.vars.palette.grey[200],
      marginTop: ".5em",
      padding: "0.1em 0.4em",
      borderRadius: 5,
      textTransform: "uppercase",
      fontWeight: "bold",
      fontSize: theme.fontSizeSmall
    },
    ".tags-list": {
      display: "block",
      position: "absolute",
      maxHeight: "120px",
      paddingBottom: "1em",
      left: "0",
      flexWrap: "wrap",
      gap: 2,
      zIndex: 100,
      transition: "all 0.2s ease-out",
      overflow: "hidden auto"
    },
    ".tag": {
      fontFamily: theme.fontFamily2,
      color: theme.vars.palette.grey[100],
      backgroundColor: theme.vars.palette.grey[800],
      padding: "0 0.1em",
      borderRadius: 8,
      border: "1px solid" + theme.vars.palette.grey[500],
      fontSize: theme.fontSizeSmaller
    },
    ".text-license": {
      margin: "0 0 .5em 0",
      padding: 0,
      fontFamily: theme.fontFamily2,
      color: theme.vars.palette.grey[500],
      fontSize: theme.fontSizeSmaller
    },
    ".text-model-type": {
      margin: 0,
      padding: 0,
      fontSize: theme.fontSizeSmaller
    },
    ".text-model-size": {
      float: "right",
      padding: 0,
      color: theme.vars.palette.warning.main
    },
    ".download": {
      boxShadow: "none",
      backgroundColor: theme.vars.palette.grey[800],
      border: "1px solid" + theme.vars.palette.grey[800],
      "&:hover": {
        backgroundColor: theme.vars.palette.grey[900],
        border: "1px solid" + theme.vars.palette.grey[900]
      }
    },

    ".delete-button": {
      position: "absolute",
      top: ".25em",
      right: ".25em",
      color: theme.vars.palette.grey[200]
    },
    ".delete-button:hover": {
      color: theme.vars.palette.c_delete
    },
    ".button-link": {
      boxShadow: "none",
      backgroundColor: theme.vars.palette.grey[600],
      color: theme.vars.palette.grey[200],
      textDecoration: "none",
      lineHeight: "1.1em",
      "&:hover": {
        color: theme.vars.palette.grey[0]
      }
    },
    ".readme-toggle-button": {
      position: "absolute",
      bottom: "2.5em",
      right: "0em",
      color: theme.vars.palette.grey[200],
      "&:hover": {
        color: theme.vars.palette.grey[0]
      }
    },
    "& .model-external-link-icon": {
      boxShadow: "none",
      cursor: "pointer",
      padding: "1em",
      backgroundColor: "transparent",
      filter: "saturate(0)",
      transition: "transform 0.125s ease-in, filter 0.2s ease-in",
      "&:hover": {
        backgroundColor: "transparent",
        transform: "scale(1.25)",
        filter: "saturate(1)"
      }
    },
    ".model-external-link-icon img": {
      cursor: "pointer"
    }
  });

const ModelCard: React.FC<
  ModelComponentProps & { ollamaBasePath?: string | null }
> = ({
  model,
  onDownload,
  handleModelDelete,
  handleShowInExplorer,
  ollamaBasePath
}) => {
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const [readmeDialogOpen, setReadmeDialogOpen] = useState(false);
  const { modelData, isLoading } = useModelInfo(model);
  const downloads = useModelDownloadStore((state) => state.downloads);
  const modelId = model.id;
  const downloaded = model.downloaded ?? !!model.path;
  const theme = useTheme();
  const toggleTags = () => setTagsExpanded(!tagsExpanded);

  if (isLoading) {
    return (
      <Card className="model-card" css={styles(theme)}>
        <CardContent
          sx={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            height: "100%"
          }}
        >
          <CircularProgress />
        </CardContent>
      </Card>
    );
  }

  if (downloads[modelId]) {
    return (
      <Card className="model-card" css={styles(theme)} sx={{ height: "100%" }}>
        <DownloadProgress name={modelId} />
      </Card>
    );
  }

  return (
    <Card
      className={`model-card ${!modelData ? "missing" : ""}`}
      css={styles(theme)}
    >
      <ModelCardContent
        model={model}
        modelData={modelData}
        downloaded={downloaded}
        tagsExpanded={tagsExpanded}
        toggleTags={toggleTags}
        readmeDialogOpen={readmeDialogOpen}
        setReadmeDialogOpen={setReadmeDialogOpen}
        sizeBytes={model.size_on_disk}
      />
      <ModelCardActions
        model={model}
        onDownload={onDownload}
        handleModelDelete={handleModelDelete}
        handleShowInExplorer={handleShowInExplorer}
        ollamaBasePath={ollamaBasePath}
      />
    </Card>
  );
};

export default React.memo(ModelCard, (prevProps, nextProps) => {
  return isEqual(prevProps.model, nextProps.model);
});
