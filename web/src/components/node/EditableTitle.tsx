/** @jsxImportSource @emotion/react */
import { css, keyframes } from "@emotion/react";
import { memo, useCallback, useMemo, useState } from "react";
import { useNodes } from "../../contexts/NodeContext";
import { useTheme } from "@mui/material/styles";
import CloseIcon from "@mui/icons-material/Close";
import {
  MOTION,
  BORDER_RADIUS,
  reducedMotion,
  SPACING,
  getSpacingPx
} from "../ui_primitives";

interface EditableTitleProps {
  nodeId: string;
  title: string;
}

// Quiet entrance: fade only, so notes appear without drawing the eye.
const fadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

// Match a single emoji: keycap (#/*/digit + optional VS16 + U+20E3), flag (two
// regional indicators), or a pictographic base plus any ZWJ sequence, skin-tone
// modifiers and variation selectors. Color-emoji glyphs ignore CSS `color`, so
// each match is wrapped to be desaturated (see .note-emoji).
const EMOJI =
  /[#*0-9]\uFE0F?\u20E3|\p{RI}\p{RI}|\p{Extended_Pictographic}(?:\u200D\p{Extended_Pictographic}|\p{Emoji_Modifier}|\uFE0F)*/u;
const EMOJI_SPLIT = new RegExp(`(${EMOJI.source})`, "gu");

// A standalone keycap emoji (digit/#/* + keycap). These read as step indices
// in the example notes, so we promote them to a clean numbered badge.
const KEYCAP = /^[#*0-9]\uFE0F?\u20E3$/u;

// Split the title into runs: keycap markers become crisp step badges, other
// emoji are desaturated so their native colors don't clash, and plain text is
// left untouched. Keeps notes legible and on-theme.
function renderTitleText(title: string) {
  return title
    .split(EMOJI_SPLIT)
    .filter((part) => part !== "")
    .map((part, i) => {
      if (KEYCAP.test(part)) {
        return (
          <span key={i} className="step-badge">
            {part.replace(/[\uFE0F\u20E3]/gu, "")}
          </span>
        );
      }
      if (EMOJI.test(part)) {
        return (
          <span key={i} className="note-emoji">
            {part}
          </span>
        );
      }
      return <span key={i}>{part}</span>;
    });
}

const EditableTitle = memo(function EditableTitle({
  nodeId,
  title
}: EditableTitleProps) {
  const [isEditing, setIsEditing] = useState(false);
  const updateNodeData = useNodes((state) => state.updateNodeData);
  const theme = useTheme();

  const styles = useMemo(() => css({
    position: "absolute",
    top: "calc(100% + 10px)",
    left: "8px",
    // Hug the content rather than stretching to node width, so a short note is
    // a tidy chip instead of a wide near-empty box.
    width: "fit-content",
    minWidth: "120px",
    maxWidth: "calc(100% - 16px)",
    borderRadius: BORDER_RADIUS.lg,
    // Flat, slightly recessed surface so the note reads as metadata, not a card.
    background: theme.vars.palette.c_bg_comment,
    display: "inline-flex",
    alignItems: "center",
    padding: `${getSpacingPx(SPACING.sm)} ${getSpacingPx(SPACING.lg)}`,
    gap: 0,
    border: `1px solid ${theme.vars.palette.divider}`,
    boxShadow: `0 1px 2px ${theme.vars.palette.c_black}33`,
    zIndex: 10,
    animation: `${fadeIn} ${MOTION.normal}`,
    transition: MOTION.border,
    cursor: "text",
    ...reducedMotion({ animation: "none" }),

    "&:hover": {
      borderColor: theme.vars.palette.grey[600]
    },

    // Small tail connecting the note to the node above.
    "&::before": {
      content: '""',
      position: "absolute",
      top: "-4px",
      left: "16px",
      width: "8px",
      height: "8px",
      background: theme.vars.palette.c_bg_comment,
      borderTop: `1px solid ${theme.vars.palette.divider}`,
      borderLeft: `1px solid ${theme.vars.palette.divider}`,
      transform: "rotate(45deg)"
    },

    // Textarea styling
    "& textarea": {
      flex: 1,
      minWidth: "160px",
      minHeight: "1.4em",
      border: "none",
      outline: "none",
      resize: "none",
      fontSize: "var(--fontSizeSmall)",
      lineHeight: "1.5",
      fontWeight: 400,
      letterSpacing: "0.01em",
      color: theme.vars.palette.text.primary,
      backgroundColor: "transparent",
      fontFamily: "inherit",
      padding: "0",
      "&::placeholder": {
        color: theme.vars.palette.text.disabled,
        fontStyle: "italic"
      }
    },

    // Title text styling
    ".title": {
      pointerEvents: "none",
      minWidth: 0,
      flex: 1,
      color: theme.vars.palette.text.secondary,
      fontSize: "var(--fontSizeSmall)",
      lineHeight: "1.5",
      fontWeight: 400,
      letterSpacing: "0.01em",
      wordBreak: "break-word",
      whiteSpace: "pre-wrap"
    },

    // Numbered step badge promoted from a keycap emoji — a crisp circular index.
    ".step-badge": {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      width: "16px",
      height: "16px",
      marginRight: getSpacingPx(SPACING.sm),
      borderRadius: BORDER_RADIUS.circle,
      background: theme.vars.palette.grey[700],
      color: theme.vars.palette.grey[100],
      fontSize: "var(--fontSizeSmaller)",
      fontWeight: 600,
      lineHeight: 1
    },

    // Other emoji render in harsh native colors that clash with the muted note.
    // Color glyphs ignore `color`, so desaturate them to a dimmed neutral grey.
    ".note-emoji": {
      filter: "grayscale(1) brightness(0.6)"
    },

    // Remove button — sits inline after the text, surfacing on hover so it never
    // overlaps the content of a narrow chip.
    ".remove-title": {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      width: "18px",
      height: "18px",
      marginLeft: getSpacingPx(SPACING.md),
      color: theme.vars.palette.grey[500],
      backgroundColor: "transparent",
      border: "none",
      borderRadius: BORDER_RADIUS.sm,
      cursor: "pointer",
      padding: 0,
      opacity: 0,
      transition: `${MOTION.opacity}, ${MOTION.background}`,
      ...reducedMotion({ transition: MOTION.none }),
      ".icon": {
        fontSize: "var(--fontSizeSmall)"
      },
      "&:hover": {
        color: theme.vars.palette.error.main,
        backgroundColor: `${theme.vars.palette.error.main}1A`
      }
    },

    "&:hover .remove-title": {
      opacity: 1
    }
  }), [theme]);

  const handleDoubleClick = useCallback(() => {
    setIsEditing(true);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      e.currentTarget.style.height = "auto";
      e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`;

      if (e.key === "Enter" && !e.shiftKey) {
        updateNodeData(nodeId, { title: e.currentTarget.value });
        setIsEditing(false);
      } else if (e.key === "Escape") {
        setIsEditing(false);
      }
    },
    [nodeId, updateNodeData]
  );

  const handleInput = useCallback((e: React.FormEvent<HTMLTextAreaElement>) => {
    e.currentTarget.style.height = "auto";
    e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`;
  }, []);

  const handleRemoveTitle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    updateNodeData(nodeId, { title: "" });
  }, [nodeId, updateNodeData]);

  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLTextAreaElement>) => {
      updateNodeData(nodeId, { title: e.currentTarget.value });
      setIsEditing(false);
    },
    [nodeId, updateNodeData]
  );

  return (
    <div
      className="title-container"
      css={styles}
      onDoubleClick={handleDoubleClick}
    >
      {isEditing ? (
        <textarea
          defaultValue={title}
          autoFocus
          aria-label="Note text"
          placeholder="Add your note..."
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          onBlur={handleBlur}
          style={{ overflow: "hidden", resize: "none" }}
        />
      ) : (
        <>
          <div className="title">{renderTitleText(title)}</div>
          <button
            type="button"
            className="remove-title"
            onClick={handleRemoveTitle}
            title="Remove note"
          >
            <CloseIcon className="icon" />
          </button>
        </>
      )}
    </div>
  );
});

export default memo(EditableTitle, (prevProps, nextProps) => {
  return prevProps.nodeId === nextProps.nodeId && prevProps.title === nextProps.title;
});
