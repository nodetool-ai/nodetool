import React, { useState, memo, useCallback } from "react";
import { Text } from "../../ui_primitives";
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
      <Text className="thread-title">
        {thread.title || previewText}
      </Text>
      {showDate && (
        <Text className="date">
          {relativeTime(thread.updatedAt)}
        </Text>
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
    prevProps.thread.updatedAt === nextProps.thread.updatedAt
  );
});

export default ThreadItem;
