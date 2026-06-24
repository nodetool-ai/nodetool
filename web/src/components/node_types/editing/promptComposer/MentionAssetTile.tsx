/** @jsxImportSource @emotion/react */
/**
 * MentionAssetTile — a large, scannable asset tile for the `@`-mention picker.
 *
 * Larger than the asset-grid default so similar generations are easy to tell
 * apart: a thumbnail with the reference name below it (clamped to two lines so
 * the distinguishing tail of a name like `inpaint-result-3.png` survives), a
 * play marker on video frames, and inline rename (double-click the name, or the
 * pencil that floats on the thumbnail). Saving routes through `onRename`, which
 * the picker wires to `AssetStore.update({ id, name })` so the change syncs to
 * the asset library.
 */
import React, { useCallback, useLayoutEffect, useRef, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import ImageIcon from "@mui/icons-material/Image";
import AudiotrackIcon from "@mui/icons-material/Audiotrack";
import MovieIcon from "@mui/icons-material/Movie";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import FolderIcon from "@mui/icons-material/Folder";
import EditIcon from "@mui/icons-material/Edit";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";

import { BORDER_RADIUS, MOTION, reducedMotion, SPACING, getSpacingPx } from "../../../ui_primitives";
import type { Asset } from "../../../../stores/ApiTypes";

const TILE_WIDTH = 112;
const THUMB_HEIGHT = 96;

type MediaKind = "image" | "video" | "audio" | "folder" | "other";

const mediaKindOf = (asset: Asset): MediaKind => {
  const ct = (asset.content_type ?? "").toLowerCase();
  if (ct === "folder") {
    return "folder";
  }
  if (ct.startsWith("image/")) {
    return "image";
  }
  if (ct.startsWith("video/")) {
    return "video";
  }
  if (ct.startsWith("audio/")) {
    return "audio";
  }
  return "other";
};

const MEDIA_ICON: Record<MediaKind, typeof ImageIcon> = {
  image: ImageIcon,
  video: MovieIcon,
  audio: AudiotrackIcon,
  folder: FolderIcon,
  other: InsertDriveFileIcon
};

const styles = (theme: Theme) =>
  css({
    width: TILE_WIDTH,
    display: "flex",
    flexDirection: "column",
    gap: theme.spacing(0.75),
    padding: theme.spacing(0.5),
    borderRadius: BORDER_RADIUS.md,
    border: "1px solid transparent",
    background: "transparent",
    cursor: "pointer",
    transition: `${MOTION.border}, ${MOTION.background}, ${MOTION.shadow}`,
    ...reducedMotion({ transition: MOTION.none }),

    // Hover and selection read differently on purpose: hover is a quiet tint so
    // the pointer has somewhere to land; selection (keyboard / active option) is
    // a primary ring with a soft lift so it stays legible without a cursor.
    "&:hover": {
      borderColor: theme.vars.palette.divider,
      background: theme.vars.palette.action.hover
    },
    "&:hover .thumb img": { transform: "scale(1.06)" },
    "&:hover .rename-button, &.selected .rename-button": { opacity: 1 },
    "&.selected": {
      borderColor: theme.vars.palette.primary.main,
      background: `rgba(${theme.vars.palette.primary.mainChannel} / 0.12)`,
      boxShadow: `0 6px 16px -6px rgba(${theme.vars.palette.primary.mainChannel} / 0.45)`
    },

    ".thumb": {
      position: "relative",
      width: "100%",
      height: THUMB_HEIGHT,
      borderRadius: BORDER_RADIUS.sm,
      overflow: "hidden",
      background: theme.vars.palette.grey[800],
      // Hairline inset so dark-bordered images don't bleed into the tile.
      boxShadow: `inset 0 0 0 1px ${theme.vars.palette.divider}`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    },
    ".thumb img": {
      width: "100%",
      height: "100%",
      objectFit: "cover",
      display: "block",
      transition: MOTION.transform,
      ...reducedMotion({ transition: MOTION.none })
    },
    // A deliberate media token for thumbnail-less kinds (audio, files, folders)
    // so they read as "this kind of asset", not "missing image".
    ".media-icon": {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: 40,
      height: 40,
      borderRadius: BORDER_RADIUS.circle,
      background: theme.vars.palette.grey[700],
      color: theme.vars.palette.text.secondary
    },
    ".media-icon svg": { fontSize: 20 },

    // Corner marker only where the frame can't speak for itself (video).
    ".badge": {
      position: "absolute",
      top: 4,
      right: 4,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: 20,
      height: 20,
      borderRadius: BORDER_RADIUS.sm,
      background: theme.vars.palette.background.paper,
      border: `1px solid ${theme.vars.palette.divider}`,
      color: theme.vars.palette.text.primary
    },
    ".badge svg": { fontSize: 14 },

    ".rename-button": {
      position: "absolute",
      bottom: 4,
      right: 4,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: 24,
      height: 24,
      padding: 0,
      borderRadius: BORDER_RADIUS.sm,
      border: `1px solid ${theme.vars.palette.divider}`,
      background: theme.vars.palette.background.paper,
      color: theme.vars.palette.text.secondary,
      cursor: "pointer",
      opacity: 0,
      transition: `${MOTION.opacity}, ${MOTION.background}, ${MOTION.border}`,
      ...reducedMotion({ transition: MOTION.none })
    },
    ".rename-button:hover": {
      color: theme.vars.palette.text.primary,
      borderColor: theme.vars.palette.primary.main,
      background: `rgba(${theme.vars.palette.primary.mainChannel} / 0.12)`
    },
    ".rename-button svg": { fontSize: 14 },

    ".name-row": {
      display: "flex",
      alignItems: "flex-start",
      // Two-line slot keeps thumbnails aligned whether a name wraps or not.
      minHeight: 30,
      paddingInline: 2
    },
    ".name": {
      flex: "1 1 auto",
      minWidth: 0,
      display: "-webkit-box",
      WebkitLineClamp: 2,
      WebkitBoxOrient: "vertical",
      overflow: "hidden",
      wordBreak: "break-word",
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeSmaller,
      lineHeight: 1.35,
      color: theme.vars.palette.text.primary
    },
    ".name-input": {
      flex: "1 1 auto",
      minWidth: 0,
      width: "100%",
      boxSizing: "border-box",
      padding: `${getSpacingPx(SPACING.micro)} ${getSpacingPx(SPACING.xs)}`,
      borderRadius: BORDER_RADIUS.sm,
      border: `1px solid ${theme.vars.palette.primary.main}`,
      background: theme.vars.palette.background.paper,
      color: theme.vars.palette.text.primary,
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeSmaller,
      lineHeight: 1.35,
      outline: "none"
    },
    ".name-input.error": {
      borderColor: theme.vars.palette.error.main
    }
  });

export interface MentionAssetTileProps {
  asset: Asset;
  selected: boolean;
  onSelect: () => void;
  onMouseEnter?: () => void;
  /**
   * Persist a new name. Resolves on success; rejects to surface an inline
   * error (e.g. a name collision) without exiting edit mode.
   */
  onRename: (id: string, name: string) => Promise<void>;
}

export const MentionAssetTile: React.FC<MentionAssetTileProps> = ({
  asset,
  selected,
  onSelect,
  onMouseEnter,
  onRename
}) => {
  const theme = useTheme();
  const kind = mediaKindOf(asset);
  const previewUrl =
    kind === "image" || kind === "video"
      ? asset.thumb_url || asset.get_url || undefined
      : undefined;
  const MediaIcon = MEDIA_ICON[kind];
  const showPlayBadge = kind === "video" && !!previewUrl;
  const displayName = asset.name || asset.id;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(displayName);
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const startEditing = useCallback(() => {
    setDraft(asset.name || asset.id);
    setError(false);
    setEditing(true);
  }, [asset.name, asset.id]);

  useLayoutEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = useCallback(async () => {
    const next = draft.trim();
    if (!next || next === displayName) {
      setEditing(false);
      return;
    }
    try {
      await onRename(asset.id, next);
      setEditing(false);
    } catch {
      setError(true);
      inputRef.current?.focus();
    }
  }, [draft, displayName, onRename, asset.id]);

  return (
    <div
      css={styles(theme)}
      className={`mention-asset-tile${selected ? " selected" : ""}`}
      role="option"
      aria-selected={selected}
      tabIndex={-1}
      onMouseDown={(e) => e.preventDefault()}
      onMouseEnter={onMouseEnter}
      onClick={() => {
        if (!editing) {
          onSelect();
        }
      }}
    >
      <div className="thumb">
        {previewUrl ? (
          <img src={previewUrl} alt="" />
        ) : (
          <span className="media-icon" aria-hidden>
            <MediaIcon />
          </span>
        )}
        {showPlayBadge && (
          <span className="badge" aria-hidden>
            <PlayArrowIcon />
          </span>
        )}
        {!editing && (
          <button
            type="button"
            className="rename-button"
            aria-label={`Rename ${displayName}`}
            onClick={(e) => {
              e.stopPropagation();
              startEditing();
            }}
          >
            <EditIcon />
          </button>
        )}
      </div>
      <div className="name-row">
        {editing ? (
          <input
            ref={inputRef}
            className={`name-input${error ? " error" : ""}`}
            value={draft}
            aria-label="Asset name"
            aria-invalid={error}
            onChange={(e) => {
              setDraft(e.target.value);
              setError(false);
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onBlur={commit}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") {
                e.preventDefault();
                void commit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setEditing(false);
              }
            }}
          />
        ) : (
          <span
            className="name"
            title={displayName}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => {
              e.stopPropagation();
              startEditing();
            }}
          >
            {displayName}
          </span>
        )}
      </div>
    </div>
  );
};

export default MentionAssetTile;
