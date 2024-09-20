/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useState } from "react";
import { Card, CardContent, CircularProgress } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { ModelComponentProps, fetchOllamaModelInfo } from "./ModelUtils";
import { fetchModelInfo } from "../../utils/huggingFaceUtils";
import ModelCardContent from "./ModelCardContent";
import ModelCardActions from "./ModelCardActions";
import ThemeNodetool from "../themes/ThemeNodetool";

const styles = (theme: any) =>
  css({
    "&.model-card": {
      position: "relative",
      height: "300px",
      width: "100%",
      marginTop: ".5em",
      maxWidth: "370px",
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
      background: theme.palette.c_gray1
    },
    "&.missing:hover": {
      background: theme.palette.c_gray1
    },
    ".model-download-button": {
      color: theme.palette.c_hl1,
      margin: "1em 0.1em 0 1em",
      padding: ".25em .5em",
      border: "1px solid" + theme.palette.c_gray3,
      "&:hover": {
        borderColor: theme.palette.c_hl1
      }
    },
    ".downloaded-indicator": {
      color: theme.palette.success.main
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
      fontSize: "1em"
    },
    ".repo-name .owner": {
      fontSize: ".8em",
      color: theme.palette.c_info,
      padding: "0 "
    },
    "&.missing .repo-name": {
      color: theme.palette.c_warning
    },
    ".tags-container": {
      position: "relative"
    },
    ".pipeline-tag": {
      fontFamily: theme.fontFamily2,
      lineHeight: "1.1em",
      width: "fit-content",
      wordBreak: "break-word",
      color: theme.palette.c_gray0,
      backgroundColor: theme.palette.c_gray5,
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
      color: theme.palette.c_gray6,
      backgroundColor: theme.palette.c_gray1,
      padding: "0 0.1em",
      borderRadius: 8,
      border: "1px solid" + theme.palette.c_gray3,
      fontSize: theme.fontSizeSmaller
    },
    ".text-license": {
      margin: 0,
      padding: 0,
      fontFamily: theme.fontFamily2,
      color: theme.palette.c_gray5,
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
      color: theme.palette.c_warning
    },
    ".download": {
      boxShadow: "none",
      backgroundColor: theme.palette.c_gray1,
      border: "1px solid" + ThemeNodetool.palette.c_gray1,
      "&:hover": {
        backgroundColor: theme.palette.c_gray0,
        border: "1px solid" + ThemeNodetool.palette.c_gray0
      }
    },
    ".model-external-link-icon ": {
      boxShadow: "none",
      cursor: "pointer",
      position: "absolute",
      right: ".5em",
      bottom: ".5em",
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
    },
    ".delete-button": {
      position: "absolute",
      top: ".25em",
      right: ".25em",
      color: theme.palette.c_gray5
    },
    ".delete-button:hover": {
      color: theme.palette.c_delete
    },
    ".button-link": {
      boxShadow: "none",
      backgroundColor: theme.palette.c_gray2,
      color: theme.palette.c_gray5,
      textDecoration: "none",
      lineHeight: "1.1em",
      "&:hover": {
        color: theme.palette.c_white
      }
    },
    ".readme-toggle-button": {
      position: "absolute",
      bottom: "2.5em",
      right: "0em",
      color: theme.palette.c_gray5,
      "&:hover": {
        color: theme.palette.c_white
      }
    }
  });

const ModelCard: React.FC<ModelComponentProps> = React.memo(function ModelCard({
  model,
  onDownload,
  handleDelete
}) {
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const [readmeDialogOpen, setReadmeDialogOpen] = useState(false);

  const isHuggingFace = model.type.startsWith("hf.");
  const isOllama = model.type.toLowerCase().includes("llama_model");
  const { data: modelData, isLoading } = useQuery({
    queryKey: ["modelInfo", model.id],
    queryFn: () => {
      if (isHuggingFace) {
        return fetchModelInfo(model.repo_id || "");
      } else if (isOllama) {
        return fetchOllamaModelInfo(model.id);
      }
      return null;
    },
    staleTime: Infinity,
    gcTime: 1000 * 60,
    refetchOnWindowFocus: false
  });

  const downloaded = model.type.startsWith("hf.lora_sd")
    ? model.downloaded ?? false
    : model.type.startsWith("hf.")
    ? !!model.size_on_disk
    : !!modelData;

  const toggleTags = () => setTagsExpanded(!tagsExpanded);

  if (isLoading) {
    return (
      <Card className="model-card" css={styles}>
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

  return (
    <Card className={`model-card ${!modelData ? "missing" : ""}`} css={styles}>
      <ModelCardContent
        model={model}
        modelData={modelData}
        downloaded={downloaded}
        tagsExpanded={tagsExpanded}
        toggleTags={toggleTags}
        readmeDialogOpen={readmeDialogOpen}
        setReadmeDialogOpen={setReadmeDialogOpen}
      />
      <ModelCardActions
        model={model}
        modelData={modelData}
        isHuggingFace={isHuggingFace}
        isOllama={isOllama}
        handleDelete={handleDelete}
        onDownload={onDownload}
        downloaded={downloaded}
      />
    </Card>
  );
});

export default ModelCard;
