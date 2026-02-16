/** @jsxImportSource @emotion/react */
import CloseIcon from "@mui/icons-material/Close";
import ImageIcon from "@mui/icons-material/Image";
import AudioFileIcon from "@mui/icons-material/AudioFile";
import VideoFileIcon from "@mui/icons-material/VideoFile";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import DescriptionIcon from "@mui/icons-material/Description";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import { memo, useCallback, useState, MouseEvent } from "react";
import { Menu, MenuItem } from "@mui/material";
import type { Asset } from "../../stores/ApiTypes";

const getFileIcon = (contentType: string) => {
  if (contentType.startsWith("image/")) {
    return <ImageIcon sx={{ fontSize: 14, opacity: 0.7 }} />;
  }
  if (contentType.startsWith("audio/")) {
    return <AudioFileIcon sx={{ fontSize: 14, opacity: 0.7 }} />;
  }
  if (contentType.startsWith("video/")) {
    return <VideoFileIcon sx={{ fontSize: 14, opacity: 0.7 }} />;
  }
  if (contentType === "application/pdf") {
    return <PictureAsPdfIcon sx={{ fontSize: 14, opacity: 0.7 }} />;
  }
  if (contentType.startsWith("text/")) {
    return <DescriptionIcon sx={{ fontSize: 14, opacity: 0.7 }} />;
  }
  return <InsertDriveFileIcon sx={{ fontSize: 14, opacity: 0.7 }} />;
};

interface FileTabHeaderProps {
  asset: Asset;
  isActive: boolean;
  onSelect: (assetId: string) => void;
  onClose: (assetId: string) => void;
  onCloseOthers: (assetId: string) => void;
  onCloseAll: () => void;
}

const FileTabHeader = ({
  asset,
  isActive,
  onSelect,
  onClose,
  onCloseOthers,
  onCloseAll
}: FileTabHeaderProps) => {
  const [contextMenuPosition, setContextMenuPosition] = useState<{
    mouseX: number;
    mouseY: number;
  } | null>(null);

  const closeContextMenu = useCallback(() => {
    setContextMenuPosition(null);
  }, []);

  const handleContextMenu = useCallback((event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    setContextMenuPosition({ mouseX: event.clientX, mouseY: event.clientY });
  }, []);

  return (
    <>
      <div
        className={`tab ${isActive ? "active" : ""}`}
        onClick={() => onSelect(asset.id)}
        onContextMenu={handleContextMenu}
        onMouseDown={(e) => {
          if (e.button === 1) {
            e.preventDefault();
            onClose(asset.id);
          }
        }}
      >
        <span
          className="tab-name"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            marginRight: "4px"
          }}
        >
          {getFileIcon(asset.content_type || "")}
          {asset.name}
        </span>
        <CloseIcon
          className="close-icon"
          sx={{ fontSize: 16 }}
          onClick={(e) => {
            e.stopPropagation();
            onClose(asset.id);
          }}
        />
      </div>
      <Menu
        open={contextMenuPosition !== null}
        onClose={closeContextMenu}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenuPosition
            ? {
                top: contextMenuPosition.mouseY,
                left: contextMenuPosition.mouseX
              }
            : undefined
        }
        onContextMenu={(event) => event.preventDefault()}
        slotProps={{
          paper: {
            sx: {
              borderRadius: "8px"
            }
          }
        }}
      >
        <MenuItem
          onClick={(event) => {
            event.stopPropagation();
            closeContextMenu();
            onClose(asset.id);
          }}
        >
          Close Tab
        </MenuItem>
        <MenuItem
          onClick={(event) => {
            event.stopPropagation();
            closeContextMenu();
            onCloseOthers(asset.id);
          }}
        >
          Close Other Tabs
        </MenuItem>
        <MenuItem
          onClick={(event) => {
            event.stopPropagation();
            closeContextMenu();
            onCloseAll();
          }}
        >
          Close All Tabs
        </MenuItem>
      </Menu>
    </>
  );
};

export default memo(FileTabHeader);
