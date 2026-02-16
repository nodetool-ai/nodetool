/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useEffect, useState, useCallback } from "react";
import { Box, CircularProgress, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import type { Asset } from "../../stores/ApiTypes";
import ImageViewer from "../asset_viewer/ImageViewer";
import AudioViewer from "../asset_viewer/AudioViewer";
import VideoViewer from "../asset_viewer/VideoViewer";
import PDFViewer from "../asset_viewer/PDFViewer";
import Model3DViewer from "../asset_viewer/Model3DViewer";
import axios from "axios";
import log from "loglevel";

const isModel3D = (type: string, url?: string): boolean => {
  if (
    type.startsWith("model/") ||
    type === "application/octet-stream" ||
    type.includes("gltf") ||
    type.includes("glb")
  ) {
    return true;
  }
  if (url) {
    try {
      const pathname = new URL(url, "http://localhost").pathname;
      const ext = pathname.toLowerCase().split(".").pop();
      return ["glb", "gltf", "obj", "fbx", "stl", "ply", "usdz"].includes(
        ext || ""
      );
    } catch {
      const ext = url.toLowerCase().split(".").pop()?.split("?")[0];
      return ["glb", "gltf", "obj", "fbx", "stl", "ply", "usdz"].includes(
        ext || ""
      );
    }
  }
  return false;
};

const getLanguageFromAsset = (asset: Asset): string | undefined => {
  const name = asset.name.toLowerCase();
  const type = asset.content_type || "";

  if (name.endsWith(".js") || name.endsWith(".jsx")) {return "javascript";}
  if (name.endsWith(".ts") || name.endsWith(".tsx")) {return "typescript";}
  if (name.endsWith(".py")) {return "python";}
  if (name.endsWith(".json")) {return "json";}
  if (name.endsWith(".css")) {return "css";}
  if (name.endsWith(".html") || name.endsWith(".htm")) {return "html";}
  if (name.endsWith(".xml")) {return "xml";}
  if (name.endsWith(".yaml") || name.endsWith(".yml")) {return "yaml";}
  if (name.endsWith(".md") || name.endsWith(".markdown")) {return "markdown";}
  if (name.endsWith(".sh") || name.endsWith(".bash")) {return "shell";}
  if (name.endsWith(".sql")) {return "sql";}
  if (name.endsWith(".csv")) {return "plaintext";}
  if (type.startsWith("text/")) {return "plaintext";}
  return undefined;
};

const styles = (theme: Theme) =>
  css({
    "&.file-tab-content": {
      width: "100%",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      backgroundColor: theme.vars.palette.background.default
    },
    "& .file-tab-viewer": {
      flex: 1,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      overflow: "auto",
      position: "relative",
      minHeight: 0
    },
    "& .file-tab-text-editor": {
      flex: 1,
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      minHeight: 0,
      "& textarea": {
        flex: 1,
        width: "100%",
        resize: "none",
        border: "none",
        outline: "none",
        padding: "16px",
        fontFamily: "monospace",
        fontSize: "14px",
        lineHeight: 1.6,
        backgroundColor: theme.vars.palette.background.default,
        color: theme.vars.palette.text.primary,
        overflow: "auto"
      }
    },
    "& .unsupported-file": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: "8px",
      padding: "32px",
      color: theme.vars.palette.text.secondary
    }
  });

interface FileTabContentProps {
  asset: Asset;
}

const FileTabContent: React.FC<FileTabContentProps> = ({ asset }) => {
  const theme = useTheme();
  const type = asset.content_type || "";
  const [textContent, setTextContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const isTextFile =
    type.startsWith("text/") ||
    type === "application/json" ||
    getLanguageFromAsset(asset) !== undefined;

  useEffect(() => {
    if (!isTextFile || !asset.get_url) {return;}
    setIsLoading(true);
    axios
      .get(asset.get_url, { responseType: "text" })
      .then((response) => {
        setTextContent(
          typeof response.data === "string"
            ? response.data
            : JSON.stringify(response.data, null, 2)
        );
      })
      .catch(log.error)
      .finally(() => setIsLoading(false));
  }, [asset.get_url, isTextFile]);

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setTextContent(e.target.value);
    },
    []
  );

  const renderContent = () => {
    if (type.startsWith("image/")) {
      return (
        <div className="file-tab-viewer">
          <ImageViewer asset={asset} />
        </div>
      );
    }

    if (type.startsWith("audio/")) {
      return (
        <div className="file-tab-viewer">
          <AudioViewer asset={asset} />
        </div>
      );
    }

    if (type.startsWith("video/")) {
      return (
        <div className="file-tab-viewer">
          <VideoViewer asset={asset} />
        </div>
      );
    }

    if (type === "application/pdf") {
      return (
        <div className="file-tab-viewer">
          <PDFViewer asset={asset} />
        </div>
      );
    }

    if (isModel3D(type, asset.get_url ?? undefined)) {
      return (
        <div className="file-tab-viewer">
          <Model3DViewer asset={asset} />
        </div>
      );
    }

    if (isTextFile) {
      if (isLoading) {
        return (
          <Box
            display="flex"
            alignItems="center"
            justifyContent="center"
            flex={1}
          >
            <CircularProgress />
          </Box>
        );
      }
      return (
        <div className="file-tab-text-editor">
          <textarea
            value={textContent ?? ""}
            onChange={handleTextChange}
            spellCheck={false}
            data-testid="file-tab-textarea"
          />
        </div>
      );
    }

    return (
      <div className="unsupported-file">
        <Typography variant="h6">Cannot preview this file</Typography>
        <Typography variant="body2">{asset.name}</Typography>
        <Typography variant="caption">Type: {type || "unknown"}</Typography>
      </div>
    );
  };

  return (
    <Box className="file-tab-content" css={styles(theme)}>
      {renderContent()}
    </Box>
  );
};

export default FileTabContent;
