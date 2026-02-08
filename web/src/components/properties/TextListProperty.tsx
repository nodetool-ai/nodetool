/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { memo, useCallback, useState, useMemo, useRef, ChangeEvent } from "react";
import { PropertyProps } from "../node/PropertyInput";
import PropertyLabel from "../node/PropertyLabel";
import { Asset } from "../../stores/ApiTypes";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { IconButton, Tooltip, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import DescriptionIcon from "@mui/icons-material/Description";
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
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Create memoized click handlers for each text item to prevent unnecessary re-renders
  const removeButtonClickHandlers = useMemo(
    () =>
      texts.map((_, index) => () => handleRemoveText(index)),
    [texts, handleRemoveText]
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

  // Handle files from browser file input
  const handleBrowserFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Handle file input change (browser fallback)
  const handleFileInputChange = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).filter(isTextFile);
    if (files.length === 0) {
      return;
    }

    const uploadPromises = files.map(
      (file) =>
        new Promise<TextItem>((resolve, reject) => {
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
        })
    );

    try {
      const newTexts = await Promise.all(uploadPromises);
      handleAddTexts(newTexts);
    } catch (error) {
      console.error("Failed to upload text files:", error);
    }

    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [uploadAsset, handleAddTexts]);

  // Handle dropzone click - use native dialog in Electron, file input in browser
  const handleDropzoneClick = useCallback(() => {
    if (isElectron && window.api?.dialog?.openFile) {
      handleNativeFilePicker();
    } else {
      handleBrowserFilePicker();
    }
  }, [handleNativeFilePicker, handleBrowserFilePicker]);

  return (
    <div className="text-list-property" css={styles(theme)}>
      {/* Hidden file input for browser fallback */}
      <input
        ref={fileInputRef}
        type="file"
        hidden
        multiple
        accept=".txt,.md,.json,.csv,.xml,.html,.htm,.yaml,.yml,.log,.ini,.cfg,.conf,text/*,application/json,application/xml"
        onChange={handleFileInputChange}
      />

      <PropertyLabel
        name={props.property.name}
        description={props.property.description}
        id={id}
      />
      
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
                  onClick={removeButtonClickHandlers[index]}
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
      <Tooltip title="Click to select text files or drag and drop">
        <div
          className={`dropzone ${isDragOver ? "drag-over" : ""}`}
          onClick={handleDropzoneClick}
          onDragOver={onDragOver}
          onDragLeave={handleDragLeave}
          onDrop={onDrop}
        >
          <p>Click or drop text files here</p>
        </div>
      </Tooltip>
    </div>
  );
};

export default memo(TextListProperty, isEqual);
