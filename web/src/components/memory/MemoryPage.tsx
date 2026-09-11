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
import PsychologyOutlinedIcon from "@mui/icons-material/PsychologyOutlined";
import ManagerPageLayout from "../panels/ManagerPageLayout";
import {
  Chip,
  ConfirmDialog,
  EmptyState,
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  SearchInput,
  Text,
  SPACING
} from "../ui_primitives";
import { trpc } from "../../trpc/client";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import MemoryCard, { type Memory } from "./MemoryCard";

/** Every kind present, so the filter offers what the data actually holds. */
function kindsOf(memories: readonly Memory[]): string[] {
  return Array.from(new Set(memories.map((memory) => memory.kind))).sort();
}

const MemoryPage: React.FC = () => {
  const utils = trpc.useUtils();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
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
        content: `Could not delete memory: ${error.message}`
      });
    }
  });

  const handleOpenThread = useCallback(
    (threadId: string) => {
      openTab({ type: "chat", ref: threadId, mode: "view" });
    },
    [openTab]
  );

  const content = (() => {
    if (activeQuery.isLoading) {
      return (
        <FlexRow align="center" justify="center" sx={{ p: 4 }}>
          <LoadingSpinner />
        </FlexRow>
      );
    }
    if (visible.length === 0) {
      return (
        <EmptyState
          variant={searching || kind ? "no-results" : "empty"}
          title={
            searching || kind ? "No memory matches" : "Nothing remembered yet"
          }
          description={
            searching || kind
              ? "No memory contains all of those words."
              : "The agent records project notes and the assets it creates as it works. They show up here."
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
    <ManagerPageLayout
      icon={<PsychologyOutlinedIcon sx={{ fontSize: 22 }} />}
      title="Memory"
      subtitle="What the agent remembers across every conversation — project notes and the resources they refer to."
    >
      <FlexColumn gap={SPACING.md} sx={{ width: "100%" }}>
        <FlexRow align="center" justify="space-between" gap={SPACING.md}>
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search memories"
            ariaLabel="Search memories by keyword"
            size="small"
            debounceMs={250}
            sx={{ maxWidth: 360, width: "100%" }}
          />
          <Text size="small" sx={{ opacity: 0.6, flexShrink: 0 }}>
            {visible.length === 1 ? "1 memory" : `${visible.length} memories`}
          </Text>
        </FlexRow>
        {kinds.length > 1 && (
          <FlexRow gap={SPACING.sm} sx={{ flexWrap: "wrap" }}>
            <Chip
              label="All"
              compact
              variant="outlined"
              active={kind === null}
              onClick={() => setKind(null)}
            />
            {kinds.map((value) => (
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
        title="Delete memory"
        content="Delete this memory? This cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
      />
    </ManagerPageLayout>
  );
};

MemoryPage.displayName = "MemoryPage";

export default memo(MemoryPage);
