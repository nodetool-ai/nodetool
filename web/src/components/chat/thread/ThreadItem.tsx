import React, { memo, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Caption,
  DeleteButton,
  EditButton,
  InlineEditableText,
  TruncatedText
} from "../../ui_primitives";
import { ThreadItemProps } from "../types/thread.types";
import { formatClockTime24 } from "../../../utils/formatUtils";

const ThreadItemBase: React.FC<ThreadItemProps> = ({
  threadId,
  thread,
  isSelected,
  isDeleting,
  onSelect,
  onRequestDelete,
  onRename,
  previewText
}) => {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);

  const handleSelect = useCallback(() => {
    onSelect(threadId);
  }, [threadId, onSelect]);

  const handleDeleteClick = useCallback(() => {
    onRequestDelete(threadId);
  }, [threadId, onRequestDelete]);

  const handleRenameClick = useCallback(() => {
    setEditing(true);
  }, []);

  const handleCommitRename = useCallback(
    (title: string) => {
      onRename?.(threadId, title);
    },
    [threadId, onRename]
  );

  const title = thread.title || previewText;

  return (
    <li
      className={`thread-item ${isSelected ? "selected" : ""} ${isDeleting ? "deleting" : ""}`}
    >
      {editing ? (
        <InlineEditableText
          ariaLabel={t("i18n-next54.thread.renameLabel")}
          value={title}
          editing
          onEditingChange={setEditing}
          onCommit={handleCommitRename}
          className="thread-title-input"
        />
      ) : (
        <>
          <button
            type="button"
            className="thread-item-select"
            aria-current={isSelected ? "true" : undefined}
            onClick={handleSelect}
          >
            <TruncatedText component="span" className="thread-title">
              {title}
            </TruncatedText>
            <Caption component="span" color="secondary" className="thread-time">
              {formatClockTime24(thread.updatedAt)}
            </Caption>
          </button>
          {/* UX research study 15: people looked for rename on the row and
              found it only by double-clicking the open tab. */}
          <span className="thread-item-actions">
            {onRename && (
              <EditButton
                iconVariant="rename"
                className="rename-button"
                tooltip={t("i18n-next54.thread.rename")}
                onClick={handleRenameClick}
              />
            )}
            <DeleteButton onClick={handleDeleteClick} />
          </span>
        </>
      )}
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
    prevProps.thread.updatedAt === nextProps.thread.updatedAt &&
    prevProps.onRename === nextProps.onRename
  );
});

export default ThreadItem;
