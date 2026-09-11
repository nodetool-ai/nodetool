/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useMemo } from "react";
import ForumOutlinedIcon from "@mui/icons-material/ForumOutlined";
import {
  Caption,
  Chip,
  DeleteButton,
  FlexColumn,
  FlexRow,
  ResponsiveImage,
  Text,
  ToolbarIconButton,
  BORDER_RADIUS,
  MOTION,
  SPACING,
  getSpacingPx
} from "../ui_primitives";
import type { RouterOutputs } from "../../trpc/client";
import { isString } from "../../utils/typePredicates";

export type Memory = RouterOutputs["memories"]["list"]["memories"][number];
type Resource = Memory["resources"][number];

/** Asset thumbnail edge (px), on the 4px grid — a fixed component dimension. */
const THUMB_SIZE = 56;

const styles = (theme: Theme) =>
  css({
    padding: getSpacingPx(SPACING.lg),
    borderRadius: BORDER_RADIUS.md,
    border: `1px solid ${theme.vars.palette.divider}`,
    background: theme.vars.palette.background.paper,
    transition: MOTION.background,
    "&:hover": {
      background: `rgb(${theme.vars.palette.common.whiteChannel} / 0.04)`
    },
    "&:hover .memory-actions": { opacity: 1 },
    ".memory-actions": { opacity: 0, transition: MOTION.opacity },
    ".memory-content": {
      wordBreak: "break-word",
      lineHeight: 1.45,
      marginTop: getSpacingPx(SPACING.xxs)
    },
    ".memory-resources": {
      display: "flex",
      flexWrap: "wrap",
      alignItems: "center",
      gap: getSpacingPx(SPACING.sm),
      marginTop: getSpacingPx(SPACING.md)
    }
  });

/**
 * An asset resource of an image content-type — rendered as a small thumbnail.
 * `asset://<id>` is an identifier, not a URL, so the locator goes to
 * `ResponsiveImage`, which resolves it to the asset's own signed URL.
 */
const MemoryAssetThumb: React.FC<{ resource: Resource }> = memo(
  ({ resource }) => {
    const theme = useTheme();
    const label = resource.label ?? resource.id;
    return (
      <ResponsiveImage
        locator={{ uri: resource.uri, asset_id: resource.id }}
        preferThumbnail
        alt={label}
        title={label}
        fit="cover"
        borderRadius={BORDER_RADIUS.sm}
        sx={{
          width: THUMB_SIZE,
          height: THUMB_SIZE,
          flexShrink: 0,
          border: `1px solid ${theme.vars.palette.divider}`
        }}
      />
    );
  }
);
MemoryAssetThumb.displayName = "MemoryAssetThumb";

function isImageAsset(resource: Resource): boolean {
  if (resource.type !== "asset") return false;
  const contentType = resource.metadata?.["content_type"];
  return isString(contentType) && contentType.startsWith("image/");
}

function resourceLabel(resource: Resource): string {
  return `${resource.type}: ${resource.label || resource.uri || resource.id}`;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

interface MemoryCardProps {
  memory: Memory;
  onDelete: (id: string) => void;
  deleteDisabled: boolean;
  /** Opens the conversation the memory was recorded in. */
  onOpenThread: (threadId: string) => void;
}

/** One saved memory: what the agent wrote, what it refers to, and when. */
const MemoryCard: React.FC<MemoryCardProps> = ({
  memory,
  onDelete,
  deleteDisabled,
  onOpenThread
}) => {
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);
  const imageAssets = memory.resources.filter(isImageAsset);
  const otherResources = memory.resources.filter((r) => !isImageAsset(r));
  return (
    <article className="memory-item" css={cssStyles}>
      <FlexRow align="flex-start" justify="space-between" gap={SPACING.md}>
        <FlexColumn gap={0} sx={{ minWidth: 0 }}>
          <FlexRow align="center" gap={SPACING.sm} sx={{ minWidth: 0 }}>
            <Chip label={memory.kind} compact />
            {memory.title && (
              <Text size="small" weight={600} sx={{ minWidth: 0 }}>
                {memory.title}
              </Text>
            )}
          </FlexRow>
          <Caption>{formatDate(memory.created_at)}</Caption>
        </FlexColumn>
        <FlexRow className="memory-actions" align="center" gap={SPACING.xs}>
          <ToolbarIconButton
            tooltip="Open the conversation this came from"
            onClick={() => onOpenThread(memory.thread_id)}
            icon={<ForumOutlinedIcon fontSize="small" />}
          />
          <DeleteButton
            tooltip="Delete memory"
            onClick={() => onDelete(memory.id)}
            disabled={deleteDisabled}
          />
        </FlexRow>
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
    </article>
  );
};

MemoryCard.displayName = "MemoryCard";

export default memo(MemoryCard);
