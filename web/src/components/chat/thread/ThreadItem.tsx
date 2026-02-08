import React, { useState } from "react";
import {
  Typography,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText
} from "@mui/material";
import DataObjectIcon from "@mui/icons-material/DataObject";
import ArticleIcon from "@mui/icons-material/Article";
import { relativeTime } from "../../../utils/formatDateAndTime";
import { ThreadItemProps } from "../types/thread.types";
import { DeleteButton, DownloadButton } from "../../ui_primitives";

export const ThreadItem: React.FC<ThreadItemProps> = ({
  threadId: _threadId,
  thread,
  isSelected,
  onSelect,
  onDelete,
  onExport,
  getPreview,
  showDate = true
}) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [exportAnchorEl, setExportAnchorEl] = useState<null | HTMLElement>(null);
  const isExportMenuOpen = Boolean(exportAnchorEl);

  const handleDelete = async () => {
    setIsDeleting(true);
    // Wait for animation to complete before actually deleting
    setTimeout(() => {
      onDelete();
    }, 300); // Match the CSS animation duration
  };

  const handleExportMenuOpen = (event: React.MouseEvent<HTMLButtonElement>) => {
    setExportAnchorEl(event.currentTarget);
  };

  const handleExportMenuClose = () => {
    setExportAnchorEl(null);
  };

  const handleExport = (format: "json" | "markdown") => {
    handleExportMenuClose();
    onExport?.(format);
  };

  return (
    <li
      className={`thread-item ${isSelected ? "selected" : ""} ${isDeleting ? "deleting" : ""}`}
      onClick={onSelect}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <Typography className="thread-title">
        {thread.title || getPreview()}
      </Typography>
      {showDate && (
        <Typography className="date">
          {relativeTime((thread as any).updated_at || thread.updatedAt)}
        </Typography>
      )}
      <DeleteButton
        onClick={(e) => {
          e.stopPropagation();
          handleDelete();
        }}
      />
      {onExport && (
        <DownloadButton
          onClick={(e) => {
            e.stopPropagation();
            handleExportMenuOpen(e);
          }}
          tooltip="Export conversation"
          iconVariant="file"
        />
      )}
      {onExport && (
        <Menu
          anchorEl={exportAnchorEl}
          open={isExportMenuOpen}
          onClose={handleExportMenuClose}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          transformOrigin={{ vertical: "top", horizontal: "right" }}
        >
          <MenuItem onClick={() => handleExport("json")}>
            <ListItemIcon>
              <DataObjectIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Export JSON</ListItemText>
          </MenuItem>
          <MenuItem onClick={() => handleExport("markdown")}>
            <ListItemIcon>
              <ArticleIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Export Markdown</ListItemText>
          </MenuItem>
        </Menu>
      )}
      {/* <IconButton
        className="delete-button"
        size="small"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        data-microtip-position="left"
        aria-label="Delete conversation"
        role="button"
      >
        <DeleteIcon />
      </IconButton> */}
    </li>
  );
};
