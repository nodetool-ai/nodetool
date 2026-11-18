/**
 * A glance at the file selected in the Files panel, docked under the tree.
 * A media file shows through its asset (`workspace_path`), a sketch file
 * through the thumbnail inside it, and another document file through the
 * project overview's document card picture. The
 * panel hides when the file has nothing to show.
 */
import React, { memo } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useQuery } from "@tanstack/react-query";

import { trpcClient } from "../../trpc/client";
import {
  AudioPlayback,
  BORDER_RADIUS,
  Box,
  Caption,
  CollapsibleSection,
  FlexColumn,
  FlexRow,
  ResponsiveImage,
  SPACING,
  Text,
  VideoPlayer
} from "../ui_primitives";
import LazyModel3DViewer from "../asset_viewer/LazyModel3DViewer";
import ProjectDocumentPreview from "../projects/ProjectDocumentPreview";
import type { ProjectDocument } from "../projects/projectStatus";
import { formatDuration } from "../projects/projectStatus";
import type { Asset } from "../../stores/ApiTypes";
import { formatFileSize } from "../../utils/formatUtils";
import { assetOfFile, isDocumentFile } from "./workspaceTreeActions";

/** Height of the media area. */
export const FILE_PREVIEW_HEIGHT = 168;

type MediaKind = "image" | "video" | "audio" | "model3d";

const MODEL_EXTENSIONS = [".glb", ".gltf"];

/** The kind of media an asset is, or null when it has no picture. */
export const mediaKindOf = (
  contentType: string,
  path: string
): MediaKind | null => {
  if (contentType.startsWith("image/")) { return "image"; }
  if (contentType.startsWith("video/")) { return "video"; }
  if (contentType.startsWith("audio/")) { return "audio"; }
  const lower = path.toLowerCase();
  if (
    contentType.startsWith("model/") ||
    MODEL_EXTENSIONS.some((extension) => lower.endsWith(extension))
  ) {
    return "model3d";
  }
  return null;
};

type FilePreview =
  | { kind: MediaKind; asset: Asset }
  | { kind: "document"; document: ProjectDocument; thumbnail: string | null };

const loadPreview = async (
  projectId: string,
  path: string
): Promise<FilePreview | null> => {
  if (isDocumentFile(path)) {
    const found = await trpcClient.projects.documentByFile.query({
      id: projectId,
      path
    });
    if (!found) { return null; }
    const [detail, file] = await Promise.all([
      trpcClient.projects.get.query({ id: projectId }),
      found.type === "sketch"
        ? trpcClient.projects.fileThumbnail.query({ id: projectId, path })
        : Promise.resolve({ thumbnail: null })
    ]);
    const document = detail.documents.find(
      (entry) => entry.ref === found.ref && entry.type === found.type
    );
    return document
      ? { kind: "document", document, thumbnail: file.thumbnail }
      : null;
  }
  const asset = await assetOfFile(projectId, path);
  if (!asset) { return null; }
  const kind = mediaKindOf(asset.content_type, path);
  return kind ? { kind, asset: asset as Asset } : null;
};

const assetLocator = (asset: Asset) => `asset://${asset.id}`;

const Media: React.FC<{ preview: FilePreview }> = ({ preview }) => {
  switch (preview.kind) {
    case "image":
      return (
        <ResponsiveImage
          locator={assetLocator(preview.asset)}
          preferThumbnail
          alt={preview.asset.name}
          fit="contain"
          sx={{ width: "100%", height: "100%" }}
        />
      );
    case "video":
      return (
        <VideoPlayer
          locator={assetLocator(preview.asset)}
          label={preview.asset.name}
          compact
        />
      );
    case "audio":
      return (
        <AudioPlayback
          locator={assetLocator(preview.asset)}
          label={preview.asset.name}
          sx={{ px: SPACING.sm }}
        />
      );
    case "model3d":
      return <LazyModel3DViewer asset={preview.asset} compact />;
    case "document":
      // A data URL is its own locator.
      return preview.thumbnail ? (
        <ResponsiveImage
          locator={preview.thumbnail}
          alt={preview.document.name}
          fit="contain"
          sx={{ width: "100%", height: "100%" }}
        />
      ) : (
        <ProjectDocumentPreview document={preview.document} />
      );
  }
};

/** Name, size and type lines under the media. */
const detailsOf = (
  preview: FilePreview,
  path: string,
  t: TFunction
): string[] => {
  const name = path.split("/").pop() ?? path;
  if (preview.kind !== "document") {
    const { size, content_type } = preview.asset;
    return [
      name,
      [size != null ? formatFileSize(size) : null, content_type]
        .filter(Boolean)
        .join(" · ")
    ];
  }
  const { document } = preview;
  const lines = [name, t(`projectFolder.preview.type.${document.type}`, { defaultValue: document.type })];
  if (document.preview?.kind === "timeline") {
    const { durationMs, tracks } = document.preview;
    const clips = tracks.reduce((count, track) => count + track.clips.length, 0);
    lines.push(
      `${formatDuration(durationMs)} · ${tracks.length} ${t("projectFolder.preview.tracks")} · ${clips} ${t("projectFolder.preview.clips")}`
    );
  }
  return lines;
};

interface WorkspaceFilePreviewProps {
  projectId: string;
  /** The selected file's path in the project folder. */
  path: string;
}

const WorkspaceFilePreview: React.FC<WorkspaceFilePreviewProps> = ({
  projectId,
  path
}) => {
  const { t } = useTranslation();
  const { data: preview } = useQuery({
    queryKey: ["workspace-file-preview", projectId, path],
    queryFn: () => loadPreview(projectId, path),
    staleTime: 15_000
  });
  if (!preview) { return null; }
  return (
    <Box
      data-testid="workspace-file-preview"
      sx={{ borderTop: 1, borderColor: "divider", flexShrink: 0 }}
    >
      <CollapsibleSection
        title={
          <Text size="smaller" weight={500} color="secondary">
            {t("projectFolder.preview.title")}
          </Text>
        }
        defaultOpen
        compact
        iconPosition="end"
        sx={{ px: SPACING.sm }}
      >
        <FlexColumn gap={SPACING.sm} sx={{ pb: SPACING.sm }}>
          <FlexRow
            align="center"
            justify="center"
            sx={{
              height: `${FILE_PREVIEW_HEIGHT}px`,
              overflow: "hidden",
              borderRadius: BORDER_RADIUS.sm,
              bgcolor: "background.default"
            }}
          >
            <Media preview={preview} />
          </FlexRow>
          <FlexColumn sx={{ minWidth: 0 }}>
            {detailsOf(preview, path, t).map((line, index) => (
              <Caption
                key={index}
                size="smaller"
                color={index === 0 ? "inherit" : "muted"}
                noWrap
              >
                {line}
              </Caption>
            ))}
          </FlexColumn>
        </FlexColumn>
      </CollapsibleSection>
    </Box>
  );
};

export default memo(WorkspaceFilePreview);
