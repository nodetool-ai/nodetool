/**
 * ResourceChip — inline chip for a resource URI (`asset://…`, `timeline://…`)
 * in chat prose.
 *
 * Renders a kind icon (a thumbnail for image assets, a file-type icon for other
 * assets) plus the link's own text, and opens the resource on click when its
 * kind has a surface to open. A URI
 * that does not parse degrades to the plain label, never a broken chip.
 */

import React, { useMemo } from "react";
import type { SvgIconComponent } from "@mui/icons-material";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import AppsOutlinedIcon from "@mui/icons-material/AppsOutlined";
import BrushOutlinedIcon from "@mui/icons-material/BrushOutlined";
import AudiotrackOutlinedIcon from "@mui/icons-material/AudiotrackOutlined";
import ChatBubbleOutlineRoundedIcon from "@mui/icons-material/ChatBubbleOutlineRounded";
import CodeOutlinedIcon from "@mui/icons-material/CodeOutlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import MovieOutlinedIcon from "@mui/icons-material/MovieOutlined";
import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined";
import SportsEsportsOutlinedIcon from "@mui/icons-material/SportsEsportsOutlined";
import StorageRoundedIcon from "@mui/icons-material/StorageRounded";
import ViewCarouselOutlinedIcon from "@mui/icons-material/ViewCarouselOutlined";
import ViewInArOutlinedIcon from "@mui/icons-material/ViewInArOutlined";
import { parseResourceUri, type ResourceKind, type ResourceUri } from "@nodetool-ai/protocol";

import { BORDER_RADIUS, Chip, SPACING, TYPOGRAPHY, getSpacingPx } from "../../ui_primitives";
import { useResolvedThumbnailUri } from "../../../hooks/useResolvedMediaUri";
import { canOpenResource, openResource } from "../../../lib/chat/openResource";

interface ResourceChipProps {
  uri: string;
  label: string;
}

/** Accent keys resolve to theme palette colors on the chip. */
type ChipAccent =
  | "info"
  | "warning"
  | "success"
  | "primary"
  | "secondary"
  | "neutral";

interface KindVisual {
  Icon: SvgIconComponent;
  accent: ChipAccent;
}

const KIND_VISUALS = {
  asset: { Icon: ImageOutlinedIcon, accent: "secondary" },
  workflow: { Icon: AccountTreeOutlinedIcon, accent: "primary" },
  timeline: { Icon: MovieOutlinedIcon, accent: "secondary" },
  storyboard: { Icon: ViewCarouselOutlinedIcon, accent: "secondary" },
  sketch: { Icon: BrushOutlinedIcon, accent: "secondary" },
  script: { Icon: DescriptionOutlinedIcon, accent: "warning" },
  app: { Icon: AppsOutlinedIcon, accent: "primary" },
  game: { Icon: SportsEsportsOutlinedIcon, accent: "primary" },
  jsscript: { Icon: CodeOutlinedIcon, accent: "warning" },
  model3d: { Icon: ViewInArOutlinedIcon, accent: "secondary" },
  collection: { Icon: StorageRoundedIcon, accent: "info" },
  thread: { Icon: ChatBubbleOutlineRoundedIcon, accent: "neutral" }
} satisfies Record<ResourceKind, KindVisual>;

type ChipColor = "default" | "primary" | "secondary" | "success" | "warning" | "error" | "info";

const chipColor = (accent: ChipAccent): ChipColor =>
  accent === "neutral" ? "default" : accent;

const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif"];
const VIDEO_EXTENSIONS = [".mp4", ".webm", ".mov", ".mkv", ".m4v", ".ogv"];
const AUDIO_EXTENSIONS = [".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac", ".opus"];
const MODEL3D_EXTENSIONS = [".glb", ".gltf"];

const hasExtension = (value: string, extensions: readonly string[]): boolean => {
  const lower = value.toLowerCase().split(/[?#]/)[0];
  return extensions.some((ext) => lower.endsWith(ext));
};

const looksLikeImage = (value: string): boolean =>
  hasExtension(value, IMAGE_EXTENSIONS);

/**
 * An asset id carries its file extension (`asset://<id>.pdf`), so the icon
 * names the file type. An id without one says nothing and gets a plain file.
 */
const assetIcon = (id: string): SvgIconComponent => {
  if (looksLikeImage(id)) return ImageOutlinedIcon;
  if (hasExtension(id, VIDEO_EXTENSIONS)) return MovieOutlinedIcon;
  if (hasExtension(id, AUDIO_EXTENSIONS)) return AudiotrackOutlinedIcon;
  if (hasExtension(id, MODEL3D_EXTENSIONS)) return ViewInArOutlinedIcon;
  if (hasExtension(id, [".pdf"])) return PictureAsPdfOutlinedIcon;
  return InsertDriveFileOutlinedIcon;
};

/**
 * Only the id decides: the storage key carries the file name, so an id without
 * an extension has nothing to fetch — an image-looking *label* over an
 * extensionless id would render a broken thumbnail.
 */
const thumbnailLocatorFor = (ref: ResourceUri | null): string | undefined =>
  ref && ref.kind === "asset" && looksLikeImage(ref.id)
    ? `asset://${ref.id}`
    : undefined;

const THUMBNAIL_SIZE = 18;

const ResourceChip: React.FC<ResourceChipProps> = ({ uri, label }) => {
  const ref = useMemo(() => parseResourceUri(uri), [uri]);
  const thumbnail = useResolvedThumbnailUri(thumbnailLocatorFor(ref));

  if (!ref) {
    return <>{label}</>;
  }

  const { accent } = KIND_VISUALS[ref.kind];
  const Icon = ref.kind === "asset" ? assetIcon(ref.id) : KIND_VISUALS[ref.kind].Icon;
  const navigable = canOpenResource(ref.kind);

  return (
    <Chip
      compact
      clickable={navigable}
      color={chipColor(accent)}
      title={uri}
      label={label}
      icon={
        thumbnail ? (
          <img
            src={thumbnail}
            alt=""
            width={THUMBNAIL_SIZE}
            height={THUMBNAIL_SIZE}
            loading="lazy"
            style={{
              objectFit: "cover",
              borderRadius: BORDER_RADIUS.xs
            }}
          />
        ) : (
          <Icon fontSize="inherit" />
        )
      }
      onClick={navigable ? () => { void openResource(ref); } : undefined}
      sx={{
        verticalAlign: "middle",
        maxWidth: "100%",
        margin: `0 ${getSpacingPx(SPACING.micro)}`,
        borderRadius: BORDER_RADIUS.pill,
        fontSize: TYPOGRAPHY.sans.label.fontSize,
        fontWeight: TYPOGRAPHY.sans.label.fontWeight,
        cursor: navigable ? "pointer" : "default",
        "& .MuiChip-icon": {
          marginLeft: getSpacingPx(SPACING.sm),
          marginRight: `-${getSpacingPx(SPACING.micro)}`,
          fontSize: TYPOGRAPHY.sans.body.fontSize
        }
      }}
    />
  );
};

ResourceChip.displayName = "ResourceChip";

export default ResourceChip;
