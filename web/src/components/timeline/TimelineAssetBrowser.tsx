/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useCallback, useState, useMemo } from "react";
import {
  Box,
  Typography,
  IconButton,
  TextField,
  InputAdornment,
  Tooltip,
  Tabs,
  Tab
} from "@mui/material";
import { useTheme, Theme } from "@mui/material/styles";
import SearchIcon from "@mui/icons-material/Search";
import VideoFileIcon from "@mui/icons-material/VideoFile";
import AudioFileIcon from "@mui/icons-material/AudioFile";
import ImageIcon from "@mui/icons-material/Image";
import RefreshIcon from "@mui/icons-material/Refresh";
import { useQuery } from "@tanstack/react-query";
import { useAssetStore } from "../../stores/AssetStore";
import { Asset } from "../../stores/ApiTypes";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

const styles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    height: "100%",
    width: "100%",
    backgroundColor:
      theme.vars?.palette?.background?.paper || theme.palette.background.paper,

    ".asset-browser-header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: theme.spacing(0.5, 1),
      borderBottom: `1px solid ${
        theme.vars?.palette?.divider || theme.palette.divider
      }`,
      minHeight: "40px"
    },

    ".asset-browser-search": {
      padding: theme.spacing(0.5, 1),
      borderBottom: `1px solid ${
        theme.vars?.palette?.divider || theme.palette.divider
      }`
    },

    ".asset-browser-tabs": {
      minHeight: "36px",
      borderBottom: `1px solid ${
        theme.vars?.palette?.divider || theme.palette.divider
      }`,
      "& .MuiTab-root": {
        minHeight: "36px",
        minWidth: "60px",
        padding: theme.spacing(0.5, 1)
      }
    },

    ".asset-browser-list": {
      flex: 1,
      overflowY: "auto",
      overflowX: "hidden",
      padding: theme.spacing(0.5)
    },

    ".asset-item": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(1),
      padding: theme.spacing(0.75, 1),
      borderRadius: theme.shape.borderRadius,
      cursor: "grab",
      transition: "background-color 0.15s ease",
      marginBottom: "2px",

      "&:hover": {
        backgroundColor:
          theme.vars?.palette?.action?.hover || theme.palette.action.hover
      },

      "&:active": {
        cursor: "grabbing"
      }
    },

    ".asset-thumbnail": {
      width: "40px",
      height: "40px",
      borderRadius: "4px",
      backgroundColor:
        theme.vars?.palette?.grey?.[800] || theme.palette.grey[800],
      backgroundSize: "cover",
      backgroundPosition: "center",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0
    },

    ".asset-info": {
      flex: 1,
      overflow: "hidden"
    },

    ".asset-name": {
      fontSize: "0.8rem",
      fontWeight: 500,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      color: theme.vars?.palette?.text?.primary || theme.palette.text.primary
    },

    ".asset-type": {
      fontSize: "0.7rem",
      color:
        theme.vars?.palette?.text?.secondary || theme.palette.text.secondary
    },

    ".empty-state": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      height: "150px",
      color:
        theme.vars?.palette?.text?.secondary || theme.palette.text.secondary,
      textAlign: "center",
      padding: theme.spacing(2)
    }
  });

type MediaFilter = "all" | "video" | "audio" | "image";

const TimelineAssetBrowser: React.FC = () => {
  const theme = useTheme();
  const [searchTerm, setSearchTerm] = useState("");
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>("all");
  const { load } = useAssetStore();

  // Fetch all assets
  const {
    data: assetsData,
    isLoading,
    refetch
  } = useQuery({
    queryKey: ["timeline-assets"],
    queryFn: async () => {
      const result = await load({});
      return result;
    },
    staleTime: 30000
  });

  // Filter assets to only media types (video, audio, image)
  const mediaAssets = useMemo(() => {
    const assets = assetsData?.assets || [];
    return assets.filter((asset) => {
      const contentType = asset.content_type || "";
      return (
        contentType.startsWith("video/") ||
        contentType.startsWith("audio/") ||
        contentType.startsWith("image/")
      );
    });
  }, [assetsData]);

  // Apply search and filter
  const filteredAssets = useMemo(() => {
    let filtered = mediaAssets;

    // Apply type filter
    if (mediaFilter !== "all") {
      filtered = filtered.filter((asset) =>
        asset.content_type?.startsWith(`${mediaFilter}/`)
      );
    }

    // Apply search term
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter((asset) =>
        asset.name?.toLowerCase().includes(term)
      );
    }

    return filtered;
  }, [mediaAssets, mediaFilter, searchTerm]);

  const handleDragStart = useCallback((e: React.DragEvent, asset: Asset) => {
    e.dataTransfer.setData("asset", JSON.stringify(asset));
    e.dataTransfer.effectAllowed = "copy";

    // Create a drag preview
    const dragImage = document.createElement("div");
    dragImage.textContent = asset.name || "Asset";
    dragImage.style.cssText = `
      position: absolute;
      top: -1000px;
      padding: 8px 12px;
      background: rgba(0, 0, 0, 0.8);
      color: white;
      border-radius: 4px;
      font-size: 12px;
      max-width: 200px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    `;
    document.body.appendChild(dragImage);
    e.dataTransfer.setDragImage(dragImage, 0, 0);
    setTimeout(() => document.body.removeChild(dragImage), 0);
  }, []);

  const handleTabChange = useCallback(
    (_event: React.SyntheticEvent, newValue: MediaFilter) => {
      setMediaFilter(newValue);
    },
    []
  );

  const getAssetIcon = (contentType: string) => {
    if (contentType.startsWith("video/")) {
      return <VideoFileIcon fontSize="small" />;
    }
    if (contentType.startsWith("audio/")) {
      return <AudioFileIcon fontSize="small" />;
    }
    if (contentType.startsWith("image/")) {
      return <ImageIcon fontSize="small" />;
    }
    return null;
  };

  const getAssetTypeName = (contentType: string) => {
    const parts = contentType.split("/");
    if (parts.length === 2) {
      return `${parts[0]} • ${parts[1]}`;
    }
    return contentType;
  };

  return (
    <Box css={styles(theme)} className="timeline-asset-browser">
      {/* Header */}
      <div className="asset-browser-header">
        <Typography variant="subtitle2">Media Assets</Typography>
        <Tooltip title="Refresh" enterDelay={TOOLTIP_ENTER_DELAY}>
          <IconButton size="small" onClick={() => refetch()}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </div>

      {/* Search */}
      <div className="asset-browser-search">
        <TextField
          size="small"
          fullWidth
          placeholder="Search media..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              )
            }
          }}
        />
      </div>

      {/* Filter tabs */}
      <Tabs
        value={mediaFilter}
        onChange={handleTabChange}
        className="asset-browser-tabs"
        variant="fullWidth"
      >
        <Tab label="All" value="all" />
        <Tab icon={<VideoFileIcon fontSize="small" />} value="video" />
        <Tab icon={<AudioFileIcon fontSize="small" />} value="audio" />
        <Tab icon={<ImageIcon fontSize="small" />} value="image" />
      </Tabs>

      {/* Asset list */}
      <div className="asset-browser-list">
        {isLoading ? (
          <div className="empty-state">
            <Typography variant="body2">Loading assets...</Typography>
          </div>
        ) : filteredAssets.length === 0 ? (
          <div className="empty-state">
            <Typography variant="body2">
              {searchTerm ? "No matching media found" : "No media assets found"}
            </Typography>
            <Typography variant="caption" sx={{ mt: 1 }}>
              Upload video, audio, or image files in the Assets page to see them
              here.
            </Typography>
          </div>
        ) : (
          filteredAssets.map((asset) => (
            <div
              key={asset.id}
              className="asset-item"
              draggable
              onDragStart={(e) => handleDragStart(e, asset)}
              title={`Drag "${asset.name}" onto a track`}
            >
              <div
                className="asset-thumbnail"
                style={
                  asset.thumb_url || asset.get_url
                    ? {
                        backgroundImage: `url(${
                          asset.thumb_url || asset.get_url
                        })`
                      }
                    : undefined
                }
              >
                {!asset.thumb_url &&
                  !asset.get_url &&
                  getAssetIcon(asset.content_type || "")}
              </div>
              <div className="asset-info">
                <div className="asset-name">{asset.name}</div>
                <div className="asset-type">
                  {getAssetTypeName(asset.content_type || "")}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </Box>
  );
};

export default TimelineAssetBrowser;
