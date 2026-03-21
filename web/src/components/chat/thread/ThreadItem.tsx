import React, { useState, memo, useCallback } from "react";
import { Typography } from "@mui/material";
import { relativeTime } from "../../../utils/formatDateAndTime";
import { ThreadItemProps } from "../types/thread.types";
import { DeleteButton } from "../../ui_primitives";

const ThreadItemBase: React.FC<ThreadItemProps> = ({
  threadId,
  thread,
  isSelected,
  onSelect,
  onDelete,
  previewText,
  showDate = true
}) => {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = useCallback(async () => {
    setIsDeleting(true);
    // Wait for animation to complete before actually deleting
    setTimeout(() => {
      onDelete(threadId);
    }, 300); // Match the CSS animation duration
  }, [threadId, onDelete]);

  const handleSelect = useCallback(() => {
    onSelect(threadId);
  }, [threadId, onSelect]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(threadId);
    }
  }, [threadId, onSelect]);

  const handleDeleteClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    handleDelete();
  }, [handleDelete]);

  return (
    <li
      className={`thread-item ${isSelected ? "selected" : ""} ${isDeleting ? "deleting" : ""}`}
      onClick={handleSelect}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <Typography className="thread-title">
        {thread.title || previewText}
      </Typography>
      {showDate && (
        <Typography className="date">
          {relativeTime((thread as any).updated_at || thread.updatedAt)}
        </Typography>
      )}
      <DeleteButton
        onClick={handleDeleteClick}
      />
    </li>
  );
};

export const ThreadItem = memo(ThreadItemBase, (prevProps, nextProps) => {
  return (
    prevProps.threadId === nextProps.threadId &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.previewText === nextProps.previewText &&
    prevProps.showDate === nextProps.showDate &&
    prevProps.thread.title === nextProps.thread.title &&
    // Check both potential update fields
    ((prevProps.thread as any).updated_at || prevProps.thread.updatedAt) ===
    ((nextProps.thread as any).updated_at || nextProps.thread.updatedAt)
  );
});

export default ThreadItem;
