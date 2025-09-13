import React, { useState } from "react";
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
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    // Wait for animation to complete before actually deleting
    setTimeout(() => {
      onDelete();
    }, 300); // Match the CSS animation duration
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
