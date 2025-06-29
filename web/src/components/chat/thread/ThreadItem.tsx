import React from "react";
import { Typography } from "@mui/material";
import { relativeTime } from "../../../utils/formatDateAndTime";
import { ThreadItemProps } from "../types/thread.types";
import DeleteButton from "../../buttons/DeleteButton";

export const ThreadItem: React.FC<ThreadItemProps> = ({
  threadId,
  thread,
  isSelected,
  onSelect,
  onDelete,
  getPreview,
  showDate = true
}) => {
  return (
    <li
      className={`thread-item ${isSelected ? "selected" : ""}`}
      onClick={onSelect}
    >
      <Typography className="thread-title">
        {thread.title || getPreview()}
      </Typography>
      {showDate && (
        <Typography className="date">
          {relativeTime(thread.updatedAt)}
        </Typography>
      )}
      <DeleteButton
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
      />
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
