import { useCallback, useState } from "react";
import type { MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import useGlobalChatStore from "../../../stores/GlobalChatStore";
import { useNotificationStore } from "../../../stores/NotificationStore";
import { EditorButton } from "../../editor_ui";
import {
  ConfirmDialog,
  ContextMenu,
  InlineEditableText,
  MenuItemPrimitive,
  TruncatedText
} from "../../ui_primitives";

interface ChatTitleMenuProps {
  threadId: string;
  /** Copies the conversation; the header menu replaces the floating icon. */
  onCopyConversation: () => void;
}

/**
 * The thread's title at the top of the conversation, as on claude.ai. Its menu
 * renames, copies or deletes the conversation without the thread list.
 */
const ChatTitleMenu = ({ threadId, onCopyConversation }: ChatTitleMenuProps) => {
  const { t } = useTranslation();
  const storedTitle = useGlobalChatStore(
    (state) => state.threads[threadId]?.title
  );
  const updateThreadTitle = useGlobalChatStore(
    (state) => state.updateThreadTitle
  );
  const deleteThread = useGlobalChatStore((state) => state.deleteThread);
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const title = storedTitle || t("i18n-next54.thread.conversation");

  const openMenu = useCallback((event: MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  }, []);
  const closeMenu = useCallback(() => {
    setAnchorEl(null);
  }, []);

  const handleRename = useCallback(() => {
    setAnchorEl(null);
    setRenaming(true);
  }, []);
  const handleCommitRename = useCallback(
    (next: string) => {
      void updateThreadTitle(threadId, next);
    },
    [threadId, updateThreadTitle]
  );

  const handleCopy = useCallback(() => {
    setAnchorEl(null);
    onCopyConversation();
  }, [onCopyConversation]);

  const handleRequestDelete = useCallback(() => {
    setAnchorEl(null);
    setConfirmingDelete(true);
  }, []);
  const handleCancelDelete = useCallback(() => {
    setConfirmingDelete(false);
  }, []);
  const handleConfirmDelete = useCallback(() => {
    deleteThread(threadId).catch((error) => {
      console.error("Failed to delete thread:", error);
      addNotification({
        type: "error",
        content: t("i18n-next11.chat.deleteConversationError")
      });
    });
  }, [deleteThread, threadId, addNotification, t]);

  return (
    <>
      {renaming ? (
        <InlineEditableText
          ariaLabel={t("i18n-next54.thread.renameLabel")}
          value={title}
          editing
          onEditingChange={setRenaming}
          onCommit={handleCommitRename}
          className="chat-title-input"
        />
      ) : (
        <EditorButton
          variant="text"
          density="compact"
          className="chat-title-button"
          aria-haspopup="menu"
          aria-expanded={anchorEl ? "true" : undefined}
          onClick={openMenu}
          endIcon={<ExpandMoreIcon fontSize="small" />}
          sx={{ color: "text.primary" }}
        >
          <TruncatedText component="span">{title}</TruncatedText>
        </EditorButton>
      )}
      <ContextMenu open={Boolean(anchorEl)} anchorEl={anchorEl} onClose={closeMenu}>
        <MenuItemPrimitive
          label={t("i18n-next54.thread.rename")}
          onClick={handleRename}
        />
        <MenuItemPrimitive
          label={t("i18n-next23.chat.actions.copyMarkdown")}
          onClick={handleCopy}
        />
        <MenuItemPrimitive
          label={t("i18n-next54.thread.deleteTitle")}
          color="error"
          dividerBefore
          onClick={handleRequestDelete}
        />
      </ContextMenu>
      {confirmingDelete && (
        <ConfirmDialog
          open
          onClose={handleCancelDelete}
          onConfirm={handleConfirmDelete}
          title={t("i18n-next54.thread.deleteTitle")}
          content={t("i18n-next54.thread.deleteContent", { name: title })}
          confirmText={t("i18n-next54.thread.delete")}
          cancelText={t("common.cancel")}
          destructive
        />
      )}
    </>
  );
};

export default ChatTitleMenu;
