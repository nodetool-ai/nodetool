/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { memo, useCallback, useState, useMemo } from "react";
import { PropertyProps } from "../node/PropertyInput";
import PropertyLabel from "../node/PropertyLabel";
import { Asset } from "../../stores/ApiTypes";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { IconButton, Tooltip, Typography, Button } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import DescriptionIcon from "@mui/icons-material/Description";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import isEqual from "lodash/isEqual";
import { useAssetUpload } from "../../serverState/useAssetUpload";
import { isElectron } from "../../utils/browser";
import { deserializeDragData, hasExternalFiles } from "../../lib/dragdrop";
import { useAssetGridStore } from "../../stores/AssetGridStore";

interface TextItem {
  uri: string;
  type: string;
}

const styles = (theme: Theme) =>
  css({
    ".text-list-property": {
      width: "100%",
      marginBottom: "8px"
    },
    ".property-label": {
      marginBottom: "5px"
    },
    ".native-picker-button": {
      color: theme.vars.palette.grey[500],
      backgroundColor: "transparent",
      minWidth: "unset",
      transition: "all 0.2s ease",
      marginBottom: "4px",
      "&:hover": {
        color: theme.vars.palette.primary.main,
        backgroundColor: theme.vars.palette.action.hover
      },
      "& svg": {
        fontSize: "1.2rem"
      }
    },
    ".text-grid": {
      display: "flex",
      flexDirection: "column",
      gap: "8px",
      marginTop: "8px"
    },
    ".text-item": {
      position: "relative",
      width: "100%",
      backgroundColor: "rgba(0, 0, 0, 0.2)",
      borderRadius: "6px",
      overflow: "hidden",
      border: `1px solid ${theme.vars.palette.grey[700]}`,
      transition: "all 0.2s ease",
      padding: "8px 12px",
      display: "flex",
      alignItems: "center",
      gap: "8px",
      "&:hover": {
        borderColor: theme.vars.palette.grey[500],
        ".remove-button": {
          opacity: 1
        }
      }
    },
    ".text-icon": {
      color: theme.vars.palette.grey[400],
      fontSize: "20px",
      flexShrink: 0
    },
    ".text-content": {
      flex: 1,
      display: "flex",
      alignItems: "center",
      minWidth: 0
    },
    ".text-filename": {
      fontSize: "12px",
      color: theme.vars.palette.grey[300],
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },
    ".remove-button": {
      opacity: 0,
      transition: "opacity 0.2s ease",
      backgroundColor: "rgba(0, 0, 0, 0.7)",
      color: theme.vars.palette.grey[100],
      padding: "2px",
      width: "20px",
      height: "20px",
      flexShrink: 0,
      "&:hover": {
        backgroundColor: theme.vars.palette.error.main,
        color: theme.vars.palette.common.white
      }
    },
    ".remove-button .MuiSvgIcon-root": {
      fontSize: "14px"
    },
    ".dropzone": {
      position: "relative",
      minHeight: "80px",
      width: "100%",
      border: "0",
      maxWidth: "none",
      textAlign: "center",
      transition: "all 0.2s ease",
      outline: `1px dashed ${theme.vars.palette.grey[600]}`,
      margin: "5px 0",
      backgroundColor: "rgba(0, 0, 0, 0.2)",
      borderRadius: "6px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      "&:hover": {
        outline: `1px dashed ${theme.vars.palette.grey[400]}`,
        backgroundColor: "rgba(0, 0, 0, 0.3)"
      },
      "&.drag-over": {
        backgroundColor: theme.vars.palette.grey[600],
        outline: `2px dashed ${theme.vars.palette.grey[100]}`,
        outlineOffset: "-2px"
      }
    },
    ".dropzone p": {
      textAlign: "center",
      fontFamily: theme.fontFamily2,
      textTransform: "uppercase",
      letterSpacing: "1px",
      fontSize: "10px",
      color: theme.vars.palette.grey[500],
      margin: "1em",
      lineHeight: "1.1em"
    }
  });

// Text file extensions and MIME types
const TEXT_EXTENSIONS = [".txt", ".md", ".json", ".csv", ".xml", ".html", ".htm", ".yaml", ".yml", ".log", ".ini", ".cfg", ".conf"];
const TEXT_MIME_TYPES = ["text/", "application/json", "application/xml", "application/yaml"];

const isTextFile = (file: File): boolean => {
  // Check by MIME type
  if (TEXT_MIME_TYPES.some((type) => file.type.startsWith(type))) {
    return true;
  }
  // Check by extension
  const fileName = file.name.toLowerCase();
  return TEXT_EXTENSIONS.some((ext) => fileName.endsWith(ext));
};

// Helper to check if an asset is a text file by content_type
const isTextAsset = (contentType: string | undefined): boolean => {
  if (!contentType) {
    return false;
  }
  return TEXT_MIME_TYPES.some((type) => contentType.startsWith(type));
};

// Helper to get MIME type from file extension
const getTextMimeType = (fileName: string): string => {
  const ext = fileName.toLowerCase().split(".").pop();
  const mimeTypes: Record<string, string> = {
    txt: "text/plain",
    md: "text/markdown",
    json: "application/json",
    csv: "text/csv",
    xml: "application/xml",
    html: "text/html",
    htm: "text/html",
    yaml: "application/yaml",
    yml: "application/yaml",
    log: "text/plain",
    ini: "text/plain",
    cfg: "text/plain",
    conf: "text/plain"
  };
  return mimeTypes[ext || ""] || "text/plain";
};

// Helper to flatten potentially nested arrays of items (handles constants + lists)
const flattenTextItems = (items: unknown): TextItem[] => {
  if (!items) {
    return [];
  }
  if (!Array.isArray(items)) {
    // Single item - check if it has the right shape
    if (typeof items === "object" && items !== null && "uri" in items) {
      return [items as TextItem];
    }
    return [];
  }

  const result: TextItem[] = [];
  for (const item of items) {
    if (Array.isArray(item)) {
      // Nested array - recursively flatten
      result.push(...flattenTextItems(item));
    } else if (typeof item === "object" && item !== null && "uri" in item) {
      result.push(item as TextItem);
    }
  }
  return result;
};

const TextListProperty = (props: PropertyProps) => {
  const theme = useTheme();
  const id = `text-list-${props.property.name}-${props.propertyIndex}`;
  const { uploadAsset } = useAssetUpload();
  
  // Convert value to array of TextItem, flattening nested arrays
  const texts: TextItem[] = useMemo(
    () => flattenTextItems(props.value),
    [props.value]
  );
  
  const [isDragOver, setIsDragOver] = useState(false);

  const handleAddTexts = useCallback(
    (newTexts: TextItem[]) => {
      const updatedTexts = [...texts, ...newTexts];
      props.onChange(updatedTexts);
    },
    [texts, props]
  );

  const handleRemoveText = useCallback(
    (index: number) => {
      const updatedTexts = texts.filter((_, i) => i !== index);
      props.onChange(updatedTexts);
    },
    [texts, props]
  );

  // Extract filename from URI
  const getFilename = useCallback((uri: string) => {
    try {
      const url = new URL(uri);
      const pathname = url.pathname;
      const filename = pathname.split("/").pop() || "text file";
      return decodeURIComponent(filename);
    } catch {
      return "text file";
    }
  }, []);

  // Handle file drops
  // Handle file drops (both internal nodetool assets and external files)
  const onDrop = useCallback(
    async (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragOver(false);

      // First, try to handle internal nodetool asset drops
      const dragData = deserializeDragData(event.dataTransfer);
      if (dragData) {
        const droppedTexts: TextItem[] = [];

        // Handle multiple assets
        if (dragData.type === "assets-multiple") {
          const selectedIds = dragData.payload as string[];
          const { filteredAssets, globalSearchResults, selectedAssets } = useAssetGridStore.getState();
          const potentialAssets = [...filteredAssets, ...globalSearchResults, ...(selectedAssets || [])];
          const foundAssets = potentialAssets.filter(a => selectedIds.includes(a.id));
          const uniqueAssets = Array.from(new Map(foundAssets.map(item => [item.id, item])).values());

          uniqueAssets.forEach(asset => {
            if (asset.get_url && isTextAsset(asset.content_type)) {
              droppedTexts.push({ uri: asset.get_url, type: "text" });
            }
          });
        }

        // Handle single asset
        if (droppedTexts.length === 0 && dragData.type === "asset") {
          const asset = dragData.payload as Asset;
          if (asset.get_url && isTextAsset(asset.content_type)) {
            droppedTexts.push({ uri: asset.get_url, type: "text" });
          }
        }

        if (droppedTexts.length > 0) {
          handleAddTexts(droppedTexts);
          return;
        }
      }

      // Fall back to handling external file drops
      if (!hasExternalFiles(event.dataTransfer)) {
        return;
      }

      const files = Array.from(event.dataTransfer.files).filter(isTextFile);

      if (files.length === 0) {
        return;
      }

      // Upload all files and collect their assets
      const uploadPromises = files.map(
        (file) =>
          new Promise<TextItem>((resolve, reject) => {
            uploadAsset({
              file,
              onCompleted: (asset: Asset) => {
                // Validate asset URL before adding
                const uri = asset.get_url;
                if (!uri) {
                  reject(new Error("Asset URL is missing"));
                  return;
                }
                resolve({
                  uri,
                  type: "text"
                });
              },
              onFailed: (error: string) => {
                reject(new Error(error));
              }
            });
          })
      );

      try {
        const newTexts = await Promise.all(uploadPromises);
        handleAddTexts(newTexts);
      } catch (error) {
        console.error("Failed to upload text files:", error);
      }
    },
    [uploadAsset, handleAddTexts]
  );

  const onDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  // Native file picker for Electron
  const handleNativeFilePicker = useCallback(async () => {
    if (!window.api?.dialog?.openFile) {
      return;
    }

    try {
      const result = await window.api.dialog.openFile({
        title: "Select text files",
        filters: [
          { name: "Text Files", extensions: ["txt", "md", "json", "csv", "xml", "html", "htm", "yaml", "yml", "log", "ini", "cfg", "conf"] }
        ],
        multiSelections: true
      });

      if (!result.canceled && result.filePaths.length > 0) {
        const uploadPromises = result.filePaths.map(async (filePath: string) => {
          const dataUrl = await window.api.clipboard?.readFileAsDataURL(filePath);
          if (!dataUrl) {
            throw new Error("Failed to read file");
          }

          const response = await fetch(dataUrl);
          const blob = await response.blob();

          const pathSegments = filePath.split(/[\\/]/);
          const fileName = pathSegments[pathSegments.length - 1] || "file.txt";

          const file = new File([blob], fileName, { type: getTextMimeType(fileName) });

          return new Promise<TextItem>((resolve, reject) => {
            uploadAsset({
              file,
              onCompleted: (asset: Asset) => {
                const uri = asset.get_url;
                if (!uri) {
                  reject(new Error("Asset URL is missing"));
                  return;
                }
                resolve({ uri, type: "text" });
              },
              onFailed: (error: string) => {
                reject(new Error(error));
              }
            });
          });
        });

        const newTexts = await Promise.all(uploadPromises);
        handleAddTexts(newTexts);
      }
    } catch (error) {
      console.error("Error opening file picker:", error);
    }
  }, [uploadAsset, handleAddTexts]);

  return (
    <div className="text-list-property" css={styles(theme)}>
      <PropertyLabel
        name={props.property.name}
        description={props.property.description}
        id={id}
      />

      {/* Native file picker for Electron */}
      {isElectron && (
        <Tooltip title="Select text files from your computer">
          <Button
            className="native-picker-button"
            variant="text"
            onClick={handleNativeFilePicker}
          >
            <FolderOpenIcon />
            Select text files
          </Button>
        </Tooltip>
      )}
      
      {/* Text List */}
      {texts.length > 0 && (
        <div className="text-grid">
          {texts.map((text, index) => (
            <div key={text.uri} className="text-item">
              <DescriptionIcon className="text-icon" />
              <div className="text-content">
                <Typography className="text-filename" title={getFilename(text.uri)}>
                  {getFilename(text.uri)}
                </Typography>
              </div>
              <Tooltip title="Remove text file">
                <IconButton
                  className="remove-button"
                  onClick={() => handleRemoveText(index)}
                  size="small"
                  aria-label="Remove text file"
                >
                  <CloseIcon />
                </IconButton>
              </Tooltip>
            </div>
          ))}
        </div>
      )}

      {/* Dropzone */}
      <div
        className={`dropzone ${isDragOver ? "drag-over" : ""}`}
        onDragOver={onDragOver}
        onDragLeave={handleDragLeave}
        onDrop={onDrop}
      >
        <p>Drop text files here</p>
      </div>
    </div>
  );
};

export default memo(TextListProperty, isEqual);
