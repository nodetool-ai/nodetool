import { memo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
  embedKindFromContentType,
  embedKindFromSrc,
  parseShotEmbedSrc,
  type DocumentEmbedKind,
  type Shot
} from "@nodetool-ai/protocol";

import { useWorkspaceTabsStore } from "../../../stores/WorkspaceTabsStore";
import { trpc } from "../../../trpc/client";
import { useResolvedMedia } from "../../../hooks/useResolvedMediaUri";
import LazyModel3DViewer from "../../asset_viewer/LazyModel3DViewer";
import { assetOfFile } from "../../workspaces/workspaceTreeActions";
import {
  AudioPlayback,
  BORDER_RADIUS,
  Caption,
  EditorButton,
  FlexColumn,
  FlexRow,
  GAP,
  PADDING,
  ResponsiveImage,
  VideoPlayer
} from "../../ui_primitives";
import {
  resolveDocumentPath,
  useDocumentLocation
} from "../documentEditorContext";
import { hasMedia, shotLabel } from "../documentEmbeds";

interface DocumentEmbedProps {
  src: string;
  alt: string;
}

const documentFileKey = (projectId: string, path: string) =>
  ["documentImage", projectId, path] as const;

/** Video, audio, 3D and shot embeds take the page width. Images keep their own size. */
const BLOCK_SX = {
  display: "block",
  width: "100%",
  maxWidth: "100%"
} as const;

const MODEL_3D_HEIGHT = "20rem";

const Fallback = ({ text }: { text: string }) => (
  <Caption size="small" color="muted" component="span">
    {text}
  </Caption>
);

interface MediaViewProps {
  kind: DocumentEmbedKind;
  locator: string;
  alt: string;
  /** The resolved URL, needed by the 3D viewer, which cannot resolve. */
  url?: string;
}

/** One embed of a known kind, rendered through the media primitives. */
const MediaView = ({ kind, locator, alt, url }: MediaViewProps) => {
  switch (kind) {
    case "image":
      return (
        <ResponsiveImage
          locator={locator}
          alt={alt}
          loading="lazy"
          fit="contain"
          sx={{ display: "inline-block", maxWidth: "100%", width: "auto" }}
        />
      );
    case "video":
      return (
        <FlexColumn component="span" gap={GAP.tight} sx={BLOCK_SX}>
          <VideoPlayer locator={locator} label={alt || undefined} />
          {alt && <Caption size="small" color="muted" component="span">{alt}</Caption>}
        </FlexColumn>
      );
    case "audio":
      return (
        <FlexColumn component="span" gap={GAP.tight} sx={BLOCK_SX}>
          <AudioPlayback locator={locator} label={alt || undefined} />
          {alt && <Caption size="small" color="muted" component="span">{alt}</Caption>}
        </FlexColumn>
      );
    case "model3d":
      return url ? (
        <FlexColumn
          component="span"
          gap={GAP.tight}
          sx={{ ...BLOCK_SX, height: MODEL_3D_HEIGHT }}
        >
          <LazyModel3DViewer url={url} compact />
        </FlexColumn>
      ) : (
        <Fallback text={alt || locator} />
      );
  }
};

/**
 * An image, video, audio clip or 3D model. A URL or `asset://` locator
 * renders as it is. A path is looked up as a file of the document's project
 * and rendered through its asset, so the stored Markdown keeps the readable
 * relative path. The kind comes from the extension, else the asset's type.
 */
const MediaEmbed = ({ src, alt }: DocumentEmbedProps) => {
  const { projectId, path } = useDocumentLocation();
  const filePath = resolveDocumentPath(path, src);
  const lookup = useQuery({
    queryKey: documentFileKey(projectId ?? "", filePath ?? ""),
    enabled: Boolean(projectId && filePath),
    staleTime: 60_000,
    queryFn: async () => {
      const asset = await assetOfFile(projectId ?? "", filePath ?? "");
      return asset ? `asset://${asset.id}` : null;
    }
  });
  const locator = filePath === null ? src : lookup.data;
  const resolved = useResolvedMedia(locator ?? undefined);
  const kind =
    embedKindFromSrc(src) ?? embedKindFromContentType(resolved.contentType);

  if (!locator || !kind) {
    return <Fallback text={alt || src} />;
  }
  return (
    <MediaView kind={kind} locator={locator} alt={alt} url={resolved.url} />
  );
};

/**
 * A storyboard shot. It shows the shot's current clip, or its keyframe while
 * it has no clip, so the document follows the board as shots are re-rendered.
 */
const ShotEmbed = ({
  storyboardId,
  shotId,
  alt
}: {
  storyboardId: string;
  shotId: string;
  alt: string;
}) => {
  const { t } = useTranslation();
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const { data: board, isLoading } = trpc.storyboards.get.useQuery(
    { id: storyboardId },
    { staleTime: 30_000, retry: false }
  );
  // SAFETY: the wire document's `shots` is the passthrough zod mirror of
  // `Shot`, as in LinkShotDialog.
  const shots = (board?.document.shots ?? []) as Shot[];
  const shot = shots.find((candidate) => candidate.id === shotId);

  const open = useCallback(() => {
    if (!board) {
      return;
    }
    openTab({
      type: "storyboard",
      ref: board.id,
      mode: "edit",
      title: board.name,
      projectId: board.projectId
    });
  }, [board, openTab]);

  if (isLoading) {
    return <Fallback text={alt || t("documentEditor.embed.loadingShot")} />;
  }
  if (!board || !shot) {
    return (
      <Fallback
        text={t("documentEditor.embed.shotMissing", { name: alt || shotId })}
      />
    );
  }
  const media = hasMedia(shot.clip)
    ? { kind: "video" as const, ref: shot.clip }
    : hasMedia(shot.keyframe)
      ? { kind: "image" as const, ref: shot.keyframe }
      : null;
  const label = alt || shotLabel(shot);

  return (
    <FlexColumn
      component="span"
      gap={GAP.tight}
      data-testid="document-shot-embed"
      sx={{
        ...BLOCK_SX,
        p: PADDING.compact,
        border: 1,
        borderColor: "divider",
        borderRadius: BORDER_RADIUS.md
      }}
    >
      {media === null ? (
        <Fallback text={t("documentEditor.embed.shotNotRendered")} />
      ) : media.kind === "video" ? (
        <VideoPlayer locator={media.ref} label={label} />
      ) : (
        <ResponsiveImage
          locator={media.ref}
          alt={label}
          loading="lazy"
          fit="contain"
          sx={{ display: "block", maxWidth: "100%", width: "auto" }}
        />
      )}
      <FlexRow component="span" gap={GAP.normal} align="center" justify="space-between">
        <Caption size="small" color="muted" component="span">
          {`${board.name} · ${label}`}
        </Caption>
        <EditorButton variant="text" size="small" onClick={open}>
          {t("documentEditor.embed.openStoryboard")}
        </EditorButton>
      </FlexRow>
    </FlexColumn>
  );
};

/** An embed in a document: a storyboard shot or a media file. */
const DocumentEmbed = ({ src, alt }: DocumentEmbedProps) => {
  const shot = parseShotEmbedSrc(src);
  return shot ? (
    <ShotEmbed storyboardId={shot.storyboardId} shotId={shot.shotId} alt={alt} />
  ) : (
    <MediaEmbed src={src} alt={alt} />
  );
};

export default memo(DocumentEmbed);
