/**
 * The latest conversations of the current project, on the start page. Each
 * card opens its chat as a tab, the way the Chats panel does; the panel keeps
 * the full list.
 */

import { memo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";

import { usePanelStore } from "../../stores/PanelStore";
import {
  LOOSE_PROJECT_ID,
  useWorkspaceTabsStore
} from "../../stores/WorkspaceTabsStore";
import { trpc } from "../../trpc/client";
import {
  Box,
  Caption,
  Card,
  EditorButton,
  FlexColumn,
  FlexRow,
  Label,
  SPACING
} from "../ui_primitives";
import StartSection, {
  START_CARD_COLUMNS,
  START_CARD_GRID_SX,
  START_CARD_SX
} from "./StartSection";
import { TYPE_COLOR, TYPE_GLYPH } from "../workspace/tabTypeIdentity";
import type { Thread } from "../../stores/ApiTypes";
import { relativeTime } from "../../utils/formatDateAndTime";

const RECENT_CHAT_COUNT = START_CARD_COLUMNS;
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
      radius="lg"
      clickable
      onClick={handleOpen}
      aria-label={title}
      sx={START_CARD_SX}
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
    <StartSection
      title={t("pass3_35.recentChats.heading")}
      ariaLabel={t("pass3_35.recentChats.sectionLabel")}
      action={
        data?.next ? (
          <EditorButton
            variant="text"
            density="compact"
            endIcon={<ArrowForwardIcon />}
            onClick={showAllChats}
          >
            {t("pass3_35.recentChats.allChats")}
          </EditorButton>
        ) : undefined
      }
    >
      <Box sx={START_CARD_GRID_SX}>
        {threads.map((thread) => (
          <RecentChatCard key={thread.id} thread={thread} onOpen={openChat} />
        ))}
      </Box>
    </StartSection>
  );
};

export default RecentChats;
