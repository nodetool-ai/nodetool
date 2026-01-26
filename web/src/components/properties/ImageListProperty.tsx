/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { memo, useCallback, useState, useRef, useMemo } from "react";
import { PropertyProps } from "../node/PropertyInput";
import PropertyLabel from "../node/PropertyLabel";
import { Asset } from "../../stores/ApiTypes";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { IconButton, Tooltip } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import isEqual from "lodash/isEqual";
import { useAssetUpload } from "../../serverState/useAssetUpload";
import ImageDimensions from "../node/ImageDimensions";

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

const ImageListProperty = (props: PropertyProps) => {
  const theme = useTheme();
  const id = `image-list-${props.property.name}-${props.propertyIndex}`;
  const { uploadAsset } = useAssetUpload();
  
  // Convert value to array of ImageItem
  const images: ImageItem[] = useMemo(
    () => (Array.isArray(props.value) ? props.value : []),
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

  // Handle file drops
  const onDrop = useCallback(
    async (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragOver(false);

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
        // TODO: Show user-facing error notification
        // Consider using useNotificationStore to display error to user
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

  return (
    <div className="image-list-property" css={styles(theme)}>
      <PropertyLabel
        name={props.property.name}
        description={props.property.description}
        id={id}
      />
      
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
