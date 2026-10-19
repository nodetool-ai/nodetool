/**
 * The latest conversations of the current project, on the start page. Each
 * card opens its chat as a tab, the way the Chats panel does; the panel keeps
 * the full list.
 */

import { memo, useCallback } from "react";
import { useTranslation } from "react-i18next";

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
const RELATIVE_TIME_UNITS: Record<string, Intl.RelativeTimeFormatUnit> = {
  sec: "second",
  min: "minute",
  hour: "hour",
  day: "day",
  week: "week",
  month: "month",
  year: "year"
};

const localizeRelativeTime = (
  date: Date | string,
  locale: string,
  justNowLabel: string
): string => {
  const formatted = relativeTime(date);
  if (formatted === "just now") {
    return justNowLabel;
  }

  const match = /^(\d+) (sec|min|hour|day|week|month|year)s? ago$/.exec(
    formatted
  );
  if (!match) {
    return formatted;
  }

  const unit = RELATIVE_TIME_UNITS[match[2]];
  if (!unit) {
    return formatted;
  }

  return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(
    -Number(match[1]),
    unit
  );
};

const chatTitle = (thread: Thread, fallbackTitle: string): string =>
  thread.title?.trim() || fallbackTitle;

interface RecentChatCardProps {
  thread: Thread;
  onOpen: (thread: Thread) => void;
}

const RecentChatCard = memo(function RecentChatCard({
  thread,
  onOpen
}: RecentChatCardProps) {
  const { i18n, t } = useTranslation();
  const handleOpen = useCallback(() => onOpen(thread), [onOpen, thread]);
  const title = chatTitle(thread, t("pass3_35.recentChats.newChat"));

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
          {t("pass3_35.recentChats.active", {
            time: localizeRelativeTime(
              thread.updated_at,
              i18n.resolvedLanguage ?? i18n.language,
              t("pass3_35.recentChats.justNow")
            )
          })}
        </Caption>
      </FlexColumn>
    </Card>
  );
});

const RecentChats = () => {
  const { t } = useTranslation();
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
        title: chatTitle(thread, t("pass3_35.recentChats.newChat")),
        projectId: thread.project_id ?? projectId ?? undefined
      });
    },
    [openTab, projectId, t]
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
      aria-label={t("pass3_35.recentChats.sectionLabel")}
    >
      <FlexRow align="center" gap={SPACING.md}>
        <Caption color="muted" sx={{ flex: 1 }}>
          {t("pass3_35.recentChats.heading")}
        </Caption>
        {data?.next && (
          <EditorButton
            variant="text"
            density="compact"
            onClick={showAllChats}
          >
            {t("pass3_35.recentChats.allChats")}
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
