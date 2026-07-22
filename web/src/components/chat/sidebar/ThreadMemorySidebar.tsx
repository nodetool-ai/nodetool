/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useMemo } from "react";
import {
  FlexColumn,
  FlexRow,
  Text,
  Chip,
  ScrollArea,
  DeleteButton,
  MOTION,
  BORDER_RADIUS,
  SPACING,
  getSpacingPx
} from "../../ui_primitives";
import type { Image } from "../../../stores/ApiTypes";
import { useAsset } from "../../../serverState/useAsset";
import { trpc, type RouterOutputs } from "../../../trpc/client";

export const THREAD_MEMORY_SIDEBAR_WIDTH = 300;

type Memory = RouterOutputs["threadMemories"]["list"]["memories"][number];
type Resource = Memory["resources"][number];

interface ThreadMemorySidebarProps {
  threadId: string;
}

const styles = (theme: Theme) =>
  css({
    width: THREAD_MEMORY_SIDEBAR_WIDTH,
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
      alignItems: "baseline",
      justifyContent: "space-between",
      gap: 8
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
      marginTop: 2
    },
    ".memory-resources": {
      display: "flex",
      flexWrap: "wrap",
      gap: 6,
      marginTop: getSpacingPx(SPACING.sm)
    },
    ".memory-thumb": {
      width: 44,
      height: 44,
      objectFit: "cover",
      borderRadius: BORDER_RADIUS.sm,
      border: `1px solid rgb(${theme.vars.palette.common.whiteChannel} / 0.10)`,
      display: "block"
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
  return typeof ct === "string" && ct.startsWith("image/");
}

function resourceLabel(resource: Resource): string {
  const base = resource.label || resource.uri || resource.id;
  return `${resource.type}: ${base}`;
}

const MemoryCard: React.FC<{ memory: Memory; onDelete: (id: string) => void }> =
  memo(({ memory, onDelete }) => {
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
            />
          </span>
        </FlexRow>
        {memory.content && (
          <Text size="small" className="memory-content">
            {memory.content}
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
 * Right rail showing the durable memories an agent recorded for the open
 * thread (via the `thread_memory_*` tools) — a live "what was worked on"
 * view of project notes and the assets/workflows/resources referenced.
 */
export const ThreadMemorySidebar: React.FC<ThreadMemorySidebarProps> = memo(
  ({ threadId }) => {
    const theme = useTheme();
    const cssStyles = useMemo(() => styles(theme), [theme]);
    const utils = trpc.useUtils();

    const { data } = trpc.threadMemories.list.useQuery(
      { thread_id: threadId },
      {
        enabled: Boolean(threadId),
        // The agent writes memories mid-conversation; poll modestly so the
        // rail stays current without a websocket push.
        refetchInterval: 15_000
      }
    );
    const deleteMemory = trpc.threadMemories.delete.useMutation({
      onSuccess: () => utils.threadMemories.list.invalidate({ thread_id: threadId })
    });

    const memories = data?.memories ?? [];

    return (
      <aside className="thread-memory-sidebar" css={cssStyles}>
        <FlexRow className="memory-header" align="baseline" justify="space-between">
          <Text
            size="small"
            weight={600}
            sx={{ letterSpacing: 0.6, textTransform: "uppercase" }}
          >
            Memory
          </Text>
          {memories.length > 0 && (
            <Text size="smaller" sx={{ opacity: 0.6 }}>
              {memories.length}
            </Text>
          )}
        </FlexRow>
        <ScrollArea className="memory-list">
          {memories.length === 0 ? (
            <div className="empty-state">
              <Text size="small">
                Nothing saved yet. The agent records project notes and the
                assets it creates here as it works.
              </Text>
            </div>
          ) : (
            <FlexColumn gap={0}>
              {memories.map((memory) => (
                <MemoryCard
                  key={memory.id}
                  memory={memory}
                  onDelete={(id) => deleteMemory.mutate({ id })}
                />
              ))}
            </FlexColumn>
          )}
        </ScrollArea>
      </aside>
    );
  }
);

ThreadMemorySidebar.displayName = "ThreadMemorySidebar";
