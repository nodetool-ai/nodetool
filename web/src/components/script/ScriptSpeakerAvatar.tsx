/** @jsxImportSource @emotion/react */
import { memo } from "react";
import {
  Box,
  ResponsiveImage,
  BORDER_RADIUS,
  FONT_WEIGHT,
  TYPOGRAPHY
} from "../ui_primitives";
import type { ScriptSpeaker } from "../../stores/script/ScriptStore";
import { useEntities } from "../../serverState/useEntities";
import type { MediaLocator } from "../../hooks/useResolvedMediaUri";

interface ScriptSpeakerAvatarProps {
  speaker: ScriptSpeaker | null;
  /** Diameter in px. */
  size: number;
}

/** The ring and fill every portrait shares; `image` replaces the initial. */
const AvatarFrame = ({
  speaker,
  size,
  image
}: ScriptSpeakerAvatarProps & { image?: MediaLocator }) => {
  const color = speaker?.color ?? "var(--palette-action-disabled)";
  const initial = speaker?.name.trim().charAt(0).toUpperCase() || "?";
  return (
    <Box
      aria-hidden
      sx={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: BORDER_RADIUS.circle,
        border: "2px solid",
        borderColor: color,
        overflow: "hidden",
        display: "grid",
        placeItems: "center",
        backgroundColor: `color-mix(in srgb, ${color} 18%, transparent)`,
        color,
        ...(size >= 40 ? TYPOGRAPHY.sans.title : TYPOGRAPHY.sans.label),
        fontWeight: FONT_WEIGHT.semibold
      }}
    >
      {image ? (
        <ResponsiveImage
          locator={image}
          preferThumbnail
          alt=""
          fit="cover"
          loading="lazy"
          sx={{ width: "100%", height: "100%" }}
        />
      ) : (
        initial
      )}
    </Box>
  );
};

/** A speaker linked to an entity wears the entity's first reference image. */
const EntityAvatar = ({ speaker, size }: ScriptSpeakerAvatarProps) => {
  const { data: entities } = useEntities();
  const entity = entities?.find((e) => e.id === speaker?.entityId) ?? null;
  return (
    <AvatarFrame
      speaker={speaker}
      size={size}
      image={entity?.reference_images?.[0]}
    />
  );
};

/**
 * A speaker's round portrait, ringed in the speaker's colour: the linked
 * entity's first reference image, or the name's initial when the speaker
 * links no entity (or the entity has no image). Only a linked speaker reads
 * the entity library, so an unlinked cast never queries it.
 */
const ScriptSpeakerAvatar = ({ speaker, size }: ScriptSpeakerAvatarProps) =>
  speaker?.entityId ? (
    <EntityAvatar speaker={speaker} size={size} />
  ) : (
    <AvatarFrame speaker={speaker} size={size} />
  );

export default memo(ScriptSpeakerAvatar);
