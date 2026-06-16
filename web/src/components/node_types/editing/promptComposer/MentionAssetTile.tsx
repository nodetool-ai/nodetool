/** @jsxImportSource @emotion/react */
/**
 * MentionAssetTile — a large, scannable asset tile for the `@`-mention picker.
 *
 * Larger than the asset-grid default so similar generations are easy to tell
 * apart: a thumbnail with the reference name below it, a media-type badge for
 * non-images, and inline rename (double-click the name, or the hover pencil).
 * Saving routes through `onRename`, which the picker wires to
 * `AssetStore.update({ id, name })` so the change syncs to the asset library.
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

import { BORDER_RADIUS, MOTION } from "../../../ui_primitives";
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

const BADGE_ICON: Record<MediaKind, typeof ImageIcon> = {
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
    gap: theme.spacing(0.5),
    padding: theme.spacing(0.5),
    borderRadius: BORDER_RADIUS.sm,
    border: "1px solid transparent",
    cursor: "pointer",
    transition: MOTION.all,
    "&:hover, &.selected": {
      borderColor: theme.vars.palette.primary.main,
      background: theme.vars.palette.action.hover
    },
    "&:hover .rename-button": { opacity: 1 },
    ".thumb": {
      position: "relative",
      width: "100%",
      height: THUMB_HEIGHT,
      borderRadius: BORDER_RADIUS.xs,
      overflow: "hidden",
      background: theme.vars.palette.grey[800],
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: theme.vars.palette.text.secondary
    },
    ".thumb img": {
      width: "100%",
      height: "100%",
      objectFit: "cover",
      display: "block"
    },
    ".thumb svg": { fontSize: 36 },
    ".badge": {
      position: "absolute",
      top: 4,
      right: 4,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: 20,
      height: 20,
      borderRadius: BORDER_RADIUS.xs,
      background: "rgba(0, 0, 0, 0.6)",
      color: "#fff"
    },
    ".badge svg": { fontSize: 14 },
    ".name-row": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(0.25),
      minHeight: 18
    },
    ".name": {
      flex: "1 1 auto",
      minWidth: 0,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeSmaller,
      color: theme.vars.palette.text.primary
    },
    ".name-input": {
      flex: "1 1 auto",
      minWidth: 0,
      width: "100%",
      boxSizing: "border-box",
      padding: "1px 4px",
      borderRadius: BORDER_RADIUS.xs,
      border: `1px solid ${theme.vars.palette.primary.main}`,
      background: theme.vars.palette.background.paper,
      color: theme.vars.palette.text.primary,
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeSmaller,
      outline: "none"
    },
    ".name-input.error": {
      borderColor: theme.vars.palette.error.main
    },
    ".rename-button": {
      flex: "0 0 auto",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 0,
      width: 16,
      height: 16,
      border: "none",
      background: "transparent",
      color: theme.vars.palette.text.secondary,
      cursor: "pointer",
      opacity: 0,
      transition: MOTION.opacity
    },
    ".rename-button:hover": { color: theme.vars.palette.text.primary },
    ".rename-button svg": { fontSize: 13 }
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
  const Badge = BADGE_ICON[kind];
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
          <Badge aria-hidden />
        )}
        {kind !== "image" && (
          <span className="badge" aria-hidden>
            <Badge />
          </span>
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
          <>
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
          </>
        )}
      </div>
    </div>
  );
};

export default MentionAssetTile;
