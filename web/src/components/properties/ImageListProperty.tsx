/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { memo, useCallback, useState, useRef, useMemo } from "react";
import { PropertyProps } from "../node/PropertyInput";
import PropertyLabel from "../node/PropertyLabel";
import { Asset } from "../../stores/ApiTypes";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { IconButton, Tooltip, Button } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import isEqual from "lodash/isEqual";
import { useAssetUpload } from "../../serverState/useAssetUpload";
import ImageDimensions from "../node/ImageDimensions";
import { isElectron } from "../../utils/browser";
import { deserializeDragData, hasExternalFiles } from "../../lib/dragdrop";
import { useAssetGridStore } from "../../stores/AssetGridStore";

interface ImageItem {
  uri: string;
  type: string;
}

const styles = (theme: Theme) =>
  css({
    ".image-list-property": {
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
    ".image-grid": {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))",
      gap: "8px",
      marginTop: "8px"
    },
    ".image-item": {
      position: "relative",
      width: "100%",
      paddingTop: "100%", // 1:1 aspect ratio
      backgroundColor: "rgba(0, 0, 0, 0.2)",
      borderRadius: "6px",
      overflow: "hidden",
      border: `1px solid ${theme.vars.palette.grey[700]}`,
      transition: "all 0.2s ease",
      "&:hover": {
        borderColor: theme.vars.palette.grey[500],
        ".remove-button": {
          opacity: 1
        },
        ".image-dimensions": {
          opacity: 1
        }
      }
    },
    ".image-content": {
      position: "absolute",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden"
    },
    ".image-content img": {
      width: "100%",
      height: "100%",
      objectFit: "cover",
      cursor: "pointer"
    },
    ".remove-button": {
      position: "absolute",
      top: "2px",
      right: "2px",
      opacity: 0,
      transition: "opacity 0.2s ease",
      backgroundColor: "rgba(0, 0, 0, 0.7)",
      color: theme.vars.palette.grey[100],
      padding: "2px",
      width: "20px",
      height: "20px",
      zIndex: 2,
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
    },
    ".image-dimensions": {
      opacity: 0,
      transition: "opacity 0.2s ease"
    }
  });

// Helper to get MIME type from file extension
const getImageMimeType = (fileName: string): string => {
  const ext = fileName.toLowerCase().split(".").pop();
  const mimeTypes: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    bmp: "image/bmp",
    webp: "image/webp",
    svg: "image/svg+xml"
  };
  return mimeTypes[ext || ""] || "image/png";
};

// Helper to flatten potentially nested arrays of items (handles constants + lists)
const flattenImageItems = (items: unknown): ImageItem[] => {
  if (!items) {
    return [];
  }
  if (!Array.isArray(items)) {
    // Single item - check if it has the right shape
    if (typeof items === "object" && items !== null && "uri" in items) {
      return [items as ImageItem];
    }
    return [];
  }

  const result: ImageItem[] = [];
  for (const item of items) {
    if (Array.isArray(item)) {
      // Nested array - recursively flatten
      result.push(...flattenImageItems(item));
    } else if (typeof item === "object" && item !== null && "uri" in item) {
      result.push(item as ImageItem);
    }
  }
  return result;
};

const ImageListProperty = (props: PropertyProps) => {
  const theme = useTheme();
  const id = `image-list-${props.property.name}-${props.propertyIndex}`;
  const { uploadAsset } = useAssetUpload();
  
  // Convert value to array of ImageItem, flattening nested arrays
  const images: ImageItem[] = useMemo(
    () => flattenImageItems(props.value),
    [props.value]
  );
  
  const [isDragOver, setIsDragOver] = useState(false);
  const [imageDimensions, setImageDimensions] = useState<Record<string, { width: number; height: number }>>({});
  const imageRefs = useRef<Record<string, HTMLImageElement>>({});

  const handleAddImages = useCallback(
    (newImages: ImageItem[]) => {
      const updatedImages = [...images, ...newImages];
      props.onChange(updatedImages);
    },
    [images, props]
  );

  const handleRemoveImage = useCallback(
    (index: number) => {
      const updatedImages = images.filter((_, i) => i !== index);
      // Clean up dimensions and refs for removed image
      const removedImageUri = images[index]?.uri;
      if (removedImageUri) {
        setImageDimensions(prev => {
          const next = { ...prev };
          delete next[removedImageUri];
          return next;
        });
        delete imageRefs.current[removedImageUri];
      }
      props.onChange(updatedImages);
    },
    [images, props]
  );

  const handleImageLoad = useCallback((uri: string) => {
    const img = imageRefs.current[uri];
    if (img) {
      setImageDimensions(prev => ({
        ...prev,
        [uri]: {
          width: img.naturalWidth,
          height: img.naturalHeight
        }
      }));
    }
  }, []);

  // Handle file drops (both internal nodetool assets and external files)
  const onDrop = useCallback(
    async (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragOver(false);

      // First, try to handle internal nodetool asset drops
      const dragData = deserializeDragData(event.dataTransfer);
      if (dragData) {
        const droppedImages: ImageItem[] = [];

        // Handle multiple assets
        if (dragData.type === "assets-multiple") {
          const selectedIds = dragData.payload as string[];
          const { filteredAssets, globalSearchResults, selectedAssets } = useAssetGridStore.getState();
          const potentialAssets = [...filteredAssets, ...globalSearchResults, ...(selectedAssets || [])];
          const foundAssets = potentialAssets.filter(a => selectedIds.includes(a.id));
          const uniqueAssets = Array.from(new Map(foundAssets.map(item => [item.id, item])).values());

          uniqueAssets.forEach(asset => {
            if (asset.get_url && asset.content_type?.startsWith("image/")) {
              droppedImages.push({ uri: asset.get_url, type: "image" });
            }
          });
        }

        // Handle single asset
        if (droppedImages.length === 0 && dragData.type === "asset") {
          const asset = dragData.payload as Asset;
          if (asset.get_url && asset.content_type?.startsWith("image/")) {
            droppedImages.push({ uri: asset.get_url, type: "image" });
          }
        }

        if (droppedImages.length > 0) {
          handleAddImages(droppedImages);
          return;
        }
      }

      // Fall back to handling external file drops
      if (!hasExternalFiles(event.dataTransfer)) {
        return;
      }

      const files = Array.from(event.dataTransfer.files).filter((file) =>
        file.type.startsWith("image/")
      );

      if (files.length === 0) {
        return;
      }

      // Upload all files and collect their assets
      const uploadPromises = files.map(
        (file) =>
          new Promise<ImageItem>((resolve, reject) => {
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
                  type: "image"
                });
              },
              onFailed: (error: string) => {
                reject(new Error(error));
              }
            });
          })
      );

      try {
        const newImages = await Promise.all(uploadPromises);
        handleAddImages(newImages);
      } catch (error) {
        console.error("Failed to upload images:", error);
      }
    },
    [uploadAsset, handleAddImages]
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
        title: "Select images",
        filters: [
          { name: "Images", extensions: ["jpg", "jpeg", "png", "gif", "bmp", "webp", "svg"] }
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
          const fileName = pathSegments[pathSegments.length - 1] || "image.png";

          const file = new File([blob], fileName, { type: getImageMimeType(fileName) });

          return new Promise<ImageItem>((resolve, reject) => {
            uploadAsset({
              file,
              onCompleted: (asset: Asset) => {
                const uri = asset.get_url;
                if (!uri) {
                  reject(new Error("Asset URL is missing"));
                  return;
                }
                resolve({ uri, type: "image" });
              },
              onFailed: (error: string) => {
                reject(new Error(error));
              }
            });
          });
        });

        const newImages = await Promise.all(uploadPromises);
        handleAddImages(newImages);
      }
    } catch (error) {
      console.error("Error opening file picker:", error);
    }
  }, [uploadAsset, handleAddImages]);

  return (
    <div className="image-list-property" css={styles(theme)}>
      <PropertyLabel
        name={props.property.name}
        description={props.property.description}
        id={id}
      />

      {/* Native file picker for Electron */}
      {isElectron && (
        <Tooltip title="Select images from your computer">
          <Button
            className="native-picker-button"
            variant="text"
            onClick={handleNativeFilePicker}
          >
            <FolderOpenIcon />
            Select images
          </Button>
        </Tooltip>
      )}
      
      {/* Image Grid */}
      {images.length > 0 && (
        <div className="image-grid">
          {images.map((image, index) => (
            <div key={image.uri} className="image-item">
              <div className="image-content">
                <img
                  ref={(el) => {
                    if (el) {
                      imageRefs.current[image.uri] = el;
                    }
                  }}
                  src={image.uri}
                  alt={`Image ${index + 1}`}
                  draggable={false}
                  onLoad={() => handleImageLoad(image.uri)}
                />
                {imageDimensions[image.uri] && (
                  <ImageDimensions
                    width={imageDimensions[image.uri].width}
                    height={imageDimensions[image.uri].height}
                  />
                )}
              </div>
              <Tooltip title="Remove image">
                <IconButton
                  className="remove-button"
                  onClick={() => handleRemoveImage(index)}
                  size="small"
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
        <p>Drop images here</p>
      </div>
    </div>
  );
};

export default memo(ImageListProperty, isEqual);
