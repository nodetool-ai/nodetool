/**
 * MemoryPage — see and manage everything the agent remembers. Memory is
 * user-scoped and spans every conversation, so it lives here as an app page
 * instead of a rail beside one chat.
 *
 * Reads the same records the agent's `memory_*` tools write: the search box
 * runs `memory_search`'s keyword match (every word must appear), and the kind
 * filter narrows to one of the kinds present in the result.
 */
import React, { memo, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import PsychologyOutlinedIcon from "@mui/icons-material/PsychologyOutlined";
import ReportBugButton from "../support/ReportBugButton";
import {
  AlertBanner,
  EditorButton,
  Chip,
  ConfirmDialog,
  EmptyState,
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  SearchInput,
  Text,
  PageLayout,
  SPACING,
  ICON_SIZE
} from "../ui_primitives";
import { trpc } from "../../trpc/client";
import { useNotificationStore } from "../../stores/NotificationStore";
import { openChatThread } from "../workspace/openChatThread";
import MemoryCard, { type Memory } from "./MemoryCard";

/** Every kind present, so the filter offers what the data actually holds. */
function kindsOf(memories: readonly Memory[]): string[] {
  return Array.from(new Set(memories.map((memory) => memory.kind))).sort();
}

const MemoryPage: React.FC = () => {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const [memoryToDelete, setMemoryToDelete] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<string | null>(null);

  const searching = query.trim().length > 0;
  const listQuery = trpc.memories.list.useQuery(
    { limit: 200 },
    { enabled: !searching }
  );
  const searchQuery = trpc.memories.search.useQuery(
    { query: query.trim(), limit: 200 },
    { enabled: searching }
  );
  const activeQuery = searching ? searchQuery : listQuery;
  const memories = useMemo(
    () => activeQuery.data?.memories ?? [],
    [activeQuery.data]
  );
  const kinds = useMemo(() => kindsOf(memories), [memories]);
  const filterKinds = kind && !kinds.includes(kind) ? [...kinds, kind] : kinds;
  const visible = useMemo(
    () => (kind ? memories.filter((memory) => memory.kind === kind) : memories),
    [memories, kind]
  );

  const deleteMemory = trpc.memories.delete.useMutation({
    onSuccess: () => {
      utils.memories.list.invalidate();
      utils.memories.search.invalidate();
    },
    onError: (error) => {
      addNotification({
        type: "error",
        alert: true,
        content: t("screen_chat.memory.deleteFailed", { error: error.message })
      });
    }
  });

  const handleOpenThread = useCallback(
    (threadId: string) => {
      void openChatThread(threadId).catch((error: unknown) => {
        addNotification({
          type: "error",
          alert: true,
          content: t("screen_chat.memory.openChatFailed", { error: error instanceof Error ? error.message : String(error) })
        });
      });
    },
    [addNotification, t]
  );

  const content = (() => {
    if (activeQuery.isLoading) {
      return (
        <FlexRow align="center" justify="center" sx={{ p: SPACING.xl }}>
          <LoadingSpinner />
        </FlexRow>
      );
    }
    if (activeQuery.isError && !activeQuery.data) {
      return (
        <EmptyState
          variant="error"
          title={t("screen_chat.memory.loadFailed")}
          description={t("screen_chat.memory.checkConnection")}
          actionText={t("screen_chat.common.retry")}
          onAction={() => { void activeQuery.refetch(); }}
        />
      );
    }
    if (visible.length === 0) {
      return (
        <EmptyState
          variant={searching || kind ? "no-results" : "empty"}
          title={
            searching || kind ? t("screen_chat.memory.noMatches") : t("screen_chat.memory.emptyTitle")
          }
          description={
            searching || kind
              ? kind
                ? t("screen_chat.memory.filterNoMatches", { kind, search: searching ? t("screen_chat.memory.andSearch") : "", interpolation: { escapeValue: false } })
                : t("screen_chat.memory.searchNoMatches")
              : t("screen_chat.memory.emptyDescription")
          }
        />
      );
    }
    return (
      <FlexColumn gap={SPACING.sm}>
        {visible.map((memory) => (
          <MemoryCard
            key={memory.id}
            memory={memory}
            onDelete={setMemoryToDelete}
            deleteDisabled={deleteMemory.isPending}
            onOpenThread={handleOpenThread}
          />
        ))}
      </FlexColumn>
    );
  })();

  return (
    <PageLayout
      icon={<PsychologyOutlinedIcon sx={{ fontSize: ICON_SIZE.lg }} />}
      title={t("screen_chat.memory.title")}
      subtitle={t("screen_chat.memory.subtitle")}
    >
      <FlexColumn gap={SPACING.md} sx={{ width: "100%" }}>
        <FlexRow align="center" justify="space-between" gap={SPACING.md}>
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder={t("screen_chat.memory.searchPlaceholder")}
            ariaLabel={t("screen_chat.memory.searchLabel")}
            size="small"
            debounceMs={250}
            sx={{ maxWidth: 360, width: "100%" }}
          />
          <Text size="small" sx={{ opacity: 0.6, flexShrink: 0 }}>
            {t("screen_chat.memory.count", { count: visible.length })}
          </Text>
        </FlexRow>
        {(kinds.length > 1 || kind !== null) && (
          <FlexRow gap={SPACING.sm} sx={{ flexWrap: "wrap" }}>
            <Chip
              label={t("screen_chat.common.all")}
              compact
              variant="outlined"
              active={kind === null}
              onClick={() => setKind(null)}
            />
            {filterKinds.map((value) => (
              <Chip
                key={value}
                label={value}
                compact
                variant="outlined"
                active={kind === value}
                onClick={() => setKind(kind === value ? null : value)}
              />
            ))}
          </FlexRow>
        )}
        {activeQuery.isError && activeQuery.data && (
          <AlertBanner
            severity="error"
            action={<EditorButton onClick={() => { void activeQuery.refetch(); }}>{t("screen_chat.common.retry")}</EditorButton>}
          >
            {t("screen_chat.memory.refreshFailed")}
          </AlertBanner>
        )}
        {activeQuery.isError && <ReportBugButton context={{ source: "panel-crash", summary: "Could not load memories", errorText: activeQuery.error?.message }} />}
        {content}
      </FlexColumn>
      <ConfirmDialog
        open={memoryToDelete !== null}
        onClose={() => setMemoryToDelete(null)}
        onConfirm={() => {
          if (memoryToDelete) {
            deleteMemory.mutate({ id: memoryToDelete });
          }
        }}
        title={t("screen_chat.memory.deleteTitle")}
        content={t("screen_chat.memory.deleteConfirm")}
        confirmText={t("screen_chat.common.delete")}
        cancelText={t("screen_chat.common.cancel")}
      />
    </PageLayout>
  );
};

MemoryPage.displayName = "MemoryPage";

export default memo(MemoryPage);
