/**
 * The latest conversations of the current project, on the start page. Each
 * card opens its chat as a tab, the way the Chats panel does; the panel keeps
 * the full list.
 */

import { memo, useCallback } from "react";

import { usePanelStore } from "../../stores/PanelStore";
import {
  LOOSE_PROJECT_ID,
  useWorkspaceTabsStore
} from "../../stores/WorkspaceTabsStore";
import { trpc } from "../../trpc/client";
import {
  BORDER_RADIUS,
  Box,
  Caption,
  Card,
  EditorButton,
  FlexColumn,
  FlexRow,
  Label,
  SPACING
} from "../ui_primitives";
import { TYPE_COLOR, TYPE_GLYPH } from "../workspace/tabTypeIdentity";
import type { Thread } from "../../stores/ApiTypes";
import { relativeTime } from "../../utils/formatDateAndTime";

const RECENT_CHAT_COUNT = 4;

const chatTitle = (thread: Thread): string =>
  thread.title?.trim() || "New chat";

interface RecentChatCardProps {
  thread: Thread;
  onOpen: (thread: Thread) => void;
}

const RecentChatCard = memo(function RecentChatCard({
  thread,
  onOpen
}: RecentChatCardProps) {
  const handleOpen = useCallback(() => onOpen(thread), [onOpen, thread]);
  const title = chatTitle(thread);

  return (
    <Card
      variant="outlined"
      padding="none"
      clickable
      onClick={handleOpen}
      aria-label={title}
      sx={{ minWidth: 0, borderRadius: BORDER_RADIUS.md }}
    >
      <FlexColumn gap={SPACING.sm} sx={{ p: SPACING.md }}>
        <FlexRow align="center" gap={SPACING.md} sx={{ minWidth: 0 }}>
          <Box component="span" aria-hidden sx={{ color: TYPE_COLOR.chat }}>
            {TYPE_GLYPH.chat}
          </Box>
          <Label
            title={title}
            sx={{
              flex: 1,
              minWidth: 0,
              mb: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap"
            }}
          >
            {title}
          </Label>
        </FlexRow>
        <Caption color="secondary">
          Active {relativeTime(thread.updated_at)}
        </Caption>
      </FlexColumn>
    </Card>
  );
});

const RecentChats = () => {
  const activeProjectId = useWorkspaceTabsStore(
    (state) => state.activeProjectId
  );
  const personalProjectId = useWorkspaceTabsStore(
    (state) => state.personalProjectId
  );
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const handleViewChange = usePanelStore((state) => state.handleViewChange);
  // The same project as the documents strip above, so the start page reads
  // as one project's work.
  const projectId =
    activeProjectId && activeProjectId !== LOOSE_PROJECT_ID
      ? activeProjectId
      : personalProjectId;
  const { data } = trpc.threads.list.useQuery(
    { project_id: projectId ?? "", limit: RECENT_CHAT_COUNT },
    {
      enabled: Boolean(projectId),
      staleTime: 15_000,
      trpc: { context: { skipBatch: true } }
    }
  );

  const openChat = useCallback(
    (thread: Thread) => {
      openTab({
        type: "chat",
        ref: thread.id,
        mode: "view",
        title: chatTitle(thread),
        projectId: thread.project_id ?? projectId ?? undefined
      });
    },
    [openTab, projectId]
  );
  const showAllChats = useCallback(
    () => handleViewChange("chats"),
    [handleViewChange]
  );

  const threads = data?.threads ?? [];
  // A project with no conversations shows nothing: the prompt above is
  // already the way to start one.
  if (threads.length === 0) return null;

  return (
    <FlexColumn
      component="section"
      gap={SPACING.md}
      aria-label="Recent chats"
    >
      <FlexRow align="center" gap={SPACING.md}>
        <Caption color="muted" sx={{ flex: 1 }}>
          Recent chats
        </Caption>
        {data?.next && (
          <EditorButton
            variant="text"
            density="compact"
            onClick={showAllChats}
          >
            All chats
          </EditorButton>
        )}
      </FlexRow>
      <Box
        sx={{
          display: "grid",
          gap: SPACING.md,
          gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 190px), 1fr))"
        }}
      >
        {threads.map((thread) => (
          <RecentChatCard key={thread.id} thread={thread} onOpen={openChat} />
        ))}
      </Box>
    </FlexColumn>
  );
};

export default RecentChats;
