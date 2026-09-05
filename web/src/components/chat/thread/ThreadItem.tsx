import React, { memo, useCallback } from "react";
import { Text, DeleteButton } from "../../ui_primitives";
import { ThreadItemProps } from "../types/thread.types";
import { formatClockTime24 } from "../../../utils/formatUtils";

const ThreadItemBase: React.FC<ThreadItemProps> = ({
  threadId,
  thread,
  isSelected,
  isDeleting,
  onSelect,
  onRequestDelete,
  previewText
}) => {
  const handleSelect = useCallback(() => {
    onSelect(threadId);
  }, [threadId, onSelect]);

  const handleDeleteClick = useCallback(() => {
    onRequestDelete(threadId);
  }, [threadId, onRequestDelete]);

  return (
    <li
      className={`thread-item ${isSelected ? "selected" : ""} ${isDeleting ? "deleting" : ""}`}
    >
      <button
        type="button"
        className="thread-item-select"
        aria-current={isSelected ? "true" : undefined}
        onClick={handleSelect}
      >
        <Text component="span" className="thread-title">
          {thread.title || previewText}
        </Text>
        <Text component="span" className="thread-time">
          {formatClockTime24(thread.updatedAt)}
        </Text>
      </button>
      <DeleteButton onClick={handleDeleteClick} />
    </li>
  );
};

export const ThreadItem = memo(ThreadItemBase, (prevProps, nextProps) => {
  return (
    prevProps.threadId === nextProps.threadId &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.isDeleting === nextProps.isDeleting &&
    prevProps.previewText === nextProps.previewText &&
    prevProps.thread.title === nextProps.thread.title &&
    prevProps.thread.updatedAt === nextProps.thread.updatedAt
  );
});

export default ThreadItem;
