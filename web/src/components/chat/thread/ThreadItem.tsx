import React from "react";
import { IconButton, Typography } from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import { relativeTime } from "../../../utils/formatDateAndTime";
import { ThreadItemProps } from "../types/thread.types";

export const ThreadItem: React.FC<ThreadItemProps> = ({
  threadId,
  thread,
  isSelected,
  onSelect,
  onDelete,
  getPreview
}) => {
  return (
    <li
      className={`thread-item ${isSelected ? "selected" : ""}`}
      onClick={onSelect}
    >
      <Typography className="thread-title">
        {thread.title || getPreview()}
      </Typography>
      <Typography className="date">{relativeTime(thread.updatedAt)}</Typography>
      <IconButton
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
      </IconButton>
    </li>
  );
};
