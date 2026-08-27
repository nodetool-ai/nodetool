/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useMemo, useState } from "react";
import {
  FlexColumn,
  FlexRow,
  Text,
  Chip,
  ScrollArea,
  CloseButton,
  DeleteButton,
  SearchInput,
  ToggleGroup,
  ToggleOption,
  MOTION,
  BORDER_RADIUS,
  SPACING,
  getSpacingPx
} from "../../ui_primitives";
import type { Image } from "../../../stores/ApiTypes";
import { useAsset } from "../../../serverState/useAsset";
import { trpc, type RouterOutputs } from "../../../trpc/client";
import { useNotificationStore } from "../../../stores/NotificationStore";
import ConfirmDialog from "../../dialogs/ConfirmDialog";
import { isString } from "../../../utils/typePredicates";

const MEMORY_SIDEBAR_WIDTH = 300;
/** Asset thumbnail edge (px), on the 4px grid — a fixed component dimension. */
const THUMB_SIZE = 48;

type Memory = RouterOutputs["memories"]["list"]["memories"][number];
type Resource = Memory["resources"][number];

/** Which memories the rail shows. Memory itself spans every conversation. */
type Scope = "thread" | "all";

interface MemorySidebarProps {
  threadId: string;
  /** Hides the rail. Omit when the surface has no way to reopen it. */
  onClose?: () => void;
}

const styles = (theme: Theme) =>
  css({
    width: MEMORY_SIDEBAR_WIDTH,
    flexShrink: 0,
    height: "100%",
    borderLeft: `1px solid rgb(${theme.vars.palette.common.whiteChannel} / 0.08)`,
    background: `rgb(${theme.vars.palette.common.blackChannel} / 0.20)`,
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    ".memory-header": {
      padding: theme.spacing(4, 4, 3),
      borderBottom: `1px solid rgb(${theme.vars.palette.common.whiteChannel} / 0.06)`,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: getSpacingPx(SPACING.md)
    },
    ".memory-tools": {
      padding: theme.spacing(0, 4, 3),
      borderBottom: `1px solid rgb(${theme.vars.palette.common.whiteChannel} / 0.06)`
    },
    ".memory-list": {
      flex: 1,
      minHeight: 0,
      padding: `${getSpacingPx(SPACING.md)} ${getSpacingPx(SPACING.sm)}`
    },
    ".memory-item": {
      padding: getSpacingPx(SPACING.md),
      borderRadius: BORDER_RADIUS.md,
      border: `1px solid rgb(${theme.vars.palette.common.whiteChannel} / 0.06)`,
      background: `rgb(${theme.vars.palette.common.whiteChannel} / 0.02)`,
      transition: MOTION.background
    },
    ".memory-item + .memory-item": { marginTop: getSpacingPx(SPACING.sm) },
    ".memory-item:hover": {
      background: `rgb(${theme.vars.palette.common.whiteChannel} / 0.05)`
    },
    ".memory-item:hover .memory-delete": { opacity: 1 },
    ".memory-delete": { opacity: 0, transition: MOTION.opacity },
    ".memory-content": {
      wordBreak: "break-word",
      lineHeight: 1.4,
      marginTop: getSpacingPx(SPACING.xxs)
    },
    ".memory-resources": {
      display: "flex",
      flexWrap: "wrap",
      gap: getSpacingPx(SPACING.sm),
      marginTop: getSpacingPx(SPACING.sm)
    },
    ".memory-thumb": {
      width: THUMB_SIZE,
      height: THUMB_SIZE,
      objectFit: "cover",
      borderRadius: BORDER_RADIUS.sm,
      border: `1px solid rgb(${theme.vars.palette.common.whiteChannel} / 0.10)`,
      display: "block"
    },
    ".memory-origin": {
      opacity: 0.5,
      marginTop: getSpacingPx(SPACING.xs)
    },
    ".empty-state": {
      padding: theme.spacing(8, 6),
      textAlign: "center",
      opacity: 0.55
    }
  });

/** An asset resource of an image content-type — rendered as a small thumbnail. */
const MemoryAssetThumb: React.FC<{ resource: Resource }> = memo(({ resource }) => {
  const image: Image = {
    type: "image",
    uri: resource.uri ?? "",
    asset_id: resource.id
  };
  const { uri } = useAsset({ image });
  if (!uri) return null;
  return (
    <img
      className="memory-thumb"
      src={uri}
      alt={resource.label ?? resource.id}
      title={resource.label ?? resource.id}
    />
  );
});
MemoryAssetThumb.displayName = "MemoryAssetThumb";

function isImageAsset(resource: Resource): boolean {
  if (resource.type !== "asset") return false;
  const ct = resource.metadata?.["content_type"];
  return isString(ct) && ct.startsWith("image/");
}

function resourceLabel(resource: Resource): string {
  const base = resource.label || resource.uri || resource.id;
  return `${resource.type}: ${base}`;
}

const MemoryCard: React.FC<{
  memory: Memory;
  onDelete: (id: string) => void;
  deleteDisabled: boolean;
  /** The open thread, so a memory from elsewhere can say so. */
  threadId: string;
}> = memo(({ memory, onDelete, deleteDisabled, threadId }) => {
    const imageAssets = memory.resources.filter(isImageAsset);
    const otherResources = memory.resources.filter((r) => !isImageAsset(r));
    return (
      <div className="memory-item">
        <FlexRow align="center" justify="space-between" gap={6}>
          <FlexRow align="center" gap={6} sx={{ minWidth: 0 }}>
            <Chip label={memory.kind} compact />
            {memory.title && (
              <Text size="small" weight={600} sx={{ minWidth: 0 }}>
                {memory.title}
              </Text>
            )}
          </FlexRow>
          <span className="memory-delete">
            <DeleteButton
              tooltip="Delete memory"
              onClick={() => onDelete(memory.id)}
              disabled={deleteDisabled}
            />
          </span>
        </FlexRow>
        {memory.content && (
          <Text size="small" className="memory-content">
            {memory.content}
          </Text>
        )}
        {memory.thread_id !== threadId && (
          <Text size="smaller" className="memory-origin">
            From another conversation
          </Text>
        )}
        {(imageAssets.length > 0 || otherResources.length > 0) && (
          <div className="memory-resources">
            {imageAssets.map((r) => (
              <MemoryAssetThumb key={`${r.type}-${r.id}`} resource={r} />
            ))}
            {otherResources.map((r) => (
              <Chip
                key={`${r.type}-${r.id}`}
                label={resourceLabel(r)}
                compact
                variant="outlined"
              />
            ))}
          </div>
        )}
      </div>
    );
  });
MemoryCard.displayName = "MemoryCard";

/**
 * Right rail showing the durable memories an agent recorded via the `memory_*`
 * tools — a live "what was worked on" view of project notes and the
 * assets/workflows/resources referenced.
 *
 * Memory is user-scoped, so the rail opens on this conversation and the scope
 * toggle widens it to every one. The search box runs the same keyword match
 * the agent's `memory_search` runs: every word must appear.
 */
export const MemorySidebar: React.FC<MemorySidebarProps> = memo(
  ({ threadId, onClose }) => {
    const theme = useTheme();
    const cssStyles = useMemo(() => styles(theme), [theme]);
    const utils = trpc.useUtils();
    const addNotification = useNotificationStore(
      (state) => state.addNotification
    );
    const [memoryToDelete, setMemoryToDelete] = useState<string | null>(null);
    const [scope, setScope] = useState<Scope>("thread");
    const [query, setQuery] = useState("");

    // Undefined widens the query to every conversation.
    const threadFilter = scope === "thread" ? threadId : undefined;
    const searching = query.trim().length > 0;

    const listQuery = trpc.memories.list.useQuery(
      { thread_id: threadFilter },
      {
        enabled: Boolean(threadId) && !searching,
        // The agent writes memories mid-conversation; poll modestly so the
        // rail stays current without a websocket push.
        refetchInterval: 15_000
      }
    );
    const searchQuery = trpc.memories.search.useQuery(
      { query: query.trim(), thread_id: threadFilter },
      { enabled: Boolean(threadId) && searching }
    );
    const invalidate = () => {
      utils.memories.list.invalidate();
      utils.memories.search.invalidate();
    };
    const deleteMemory = trpc.memories.delete.useMutation({
      onSuccess: invalidate,
      onError: (error) => {
        addNotification({
          type: "error",
          alert: true,
          content: `Could not delete memory: ${error.message}`
        });
      }
    });

    const memories =
      (searching ? searchQuery.data?.memories : listQuery.data?.memories) ?? [];

    return (
      <aside className="memory-sidebar" css={cssStyles}>
        <FlexRow className="memory-header" align="center" justify="space-between">
          <Text
            size="small"
            weight={600}
            sx={{ letterSpacing: 0.6, textTransform: "uppercase" }}
          >
            Memory
          </Text>
          <FlexRow align="center" gap={2}>
            {memories.length > 0 && (
              <Text size="smaller" sx={{ opacity: 0.6 }}>
                {memories.length}
              </Text>
            )}
            {onClose && <CloseButton onClick={onClose} tooltip="Hide memory" />}
          </FlexRow>
        </FlexRow>
        <FlexColumn className="memory-tools" gap={2}>
          <ToggleGroup
            value={scope}
            exclusive
            segmented
            fullWidth
            onChange={(_, next) => {
              if (next === "thread" || next === "all") setScope(next);
            }}
            aria-label="Memory scope"
          >
            <ToggleOption value="thread">This chat</ToggleOption>
            <ToggleOption value="all">All</ToggleOption>
          </ToggleGroup>
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search memories"
            ariaLabel="Search memories by keyword"
            size="small"
            fullWidth
            debounceMs={250}
          />
        </FlexColumn>
        <ScrollArea className="memory-list">
          {memories.length === 0 ? (
            <div className="empty-state">
              <Text size="small">
                {searching
                  ? "No memory contains all of those words."
                  : "Nothing saved yet. The agent records project notes and the assets it creates here as it works."}
              </Text>
            </div>
          ) : (
            <FlexColumn gap={0}>
              {memories.map((memory) => (
                <MemoryCard
                  key={memory.id}
                  memory={memory}
                  threadId={threadId}
                  onDelete={setMemoryToDelete}
                  deleteDisabled={deleteMemory.isPending}
                />
              ))}
            </FlexColumn>
          )}
        </ScrollArea>
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
      </aside>
    );
  }
);

MemorySidebar.displayName = "MemorySidebar";
