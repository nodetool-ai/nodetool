/**
 * Clickable document title header positioned above the formatting toolbar
 * (document editor PRD R1, R31). Displays the file name without its trailing
 * Markdown extension and renames the file directly without inserting a title
 * block into the Markdown body (D1).
 */
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@mui/material/styles";

import {
  BORDER_RADIUS,
  Box,
  Caption,
  FONT_SIZE_SANS,
  FONT_WEIGHT,
  InlineEditableText,
  MOTION,
  SPACING,
  Tooltip,
  getSpacingPx,
  reducedMotion
} from "../ui_primitives";

const MARKDOWN_EXTENSION_PATTERN = /(\.(?:md|markdown))$/i;
const DEFAULT_EXTENSION = ".md";
const INVALID_FILENAME_CHAR_PATTERN = /[/\\:*?"<>|]/;

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) {
      return true;
    }
  }
  return false;
}

function isReservedSegment(value: string): boolean {
  return value === "" || value === "." || value === "..";
}

/**
 * Validate a proposed document title before renaming: rejects empty strings,
 * path separators, control characters, reserved `.`/`..` segments, and
 * cross-platform illegal filename characters.
 */
export function isValidDocumentTitle(rawInput: string): boolean {
  if (hasControlCharacter(rawInput)) {
    return false;
  }
  const trimmed = rawInput.trim();
  if (isReservedSegment(trimmed)) {
    return false;
  }
  if (INVALID_FILENAME_CHAR_PATTERN.test(trimmed)) {
    return false;
  }
  const stem = trimmed.replace(MARKDOWN_EXTENSION_PATTERN, "").trim();
  if (isReservedSegment(stem)) {
    return false;
  }
  return true;
}

/** Split a Markdown filename into its display stem and trailing extension. */
export function splitDocumentFilename(name: string): {
  stem: string;
  extension: string;
} {
  const trimmed = name.trim();
  const match = MARKDOWN_EXTENSION_PATTERN.exec(trimmed);
  if (match) {
    return {
      stem: trimmed.slice(0, trimmed.length - match[1].length),
      extension: match[1]
    };
  }
  return {
    stem: trimmed,
    extension: DEFAULT_EXTENSION
  };
}

/**
 * Re-attach the original Markdown extension when the user omits one so
 * renaming "Chapter 1" saves "Chapter 1.md". Returns "" if the title fails
 * validation.
 */
export function commitDocumentFilename(
  rawInput: string,
  originalExtension: string = DEFAULT_EXTENSION
): string {
  if (!isValidDocumentTitle(rawInput)) {
    return "";
  }
  const trimmed = rawInput.trim();
  if (MARKDOWN_EXTENSION_PATTERN.test(trimmed)) {
    return trimmed;
  }
  return `${trimmed}${originalExtension || DEFAULT_EXTENSION}`;
}

export interface DocumentTitleHeaderProps {
  title: string;
  onRename: (nextName: string) => void;
  disabled?: boolean;
}

export const DocumentTitleHeader = ({
  title,
  onRename,
  disabled = false
}: DocumentTitleHeaderProps) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const [editing, setEditing] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (disabled) {
      setEditing(false);
      setValidationError(null);
    }
  }, [disabled]);

  useEffect(() => {
    setValidationError(null);
  }, [title]);

  const { stem, extension } = splitDocumentFilename(title);
  const untitledLabel = t("documentEditor.title.untitled", "Untitled document");

  const clearValidationError = useCallback(() => {
    setValidationError(null);
  }, []);

  const handleEditingChange = useCallback((nextEditing: boolean) => {
    setEditing(nextEditing);
    if (nextEditing) {
      setValidationError(null);
    }
  }, []);

  const handleCommit = useCallback(
    (nextStem: string) => {
      if (nextStem.trim() === "") {
        setValidationError(null);
        return;
      }
      if (!isValidDocumentTitle(nextStem)) {
        setValidationError(
          t(
            "documentEditor.title.invalidCharacters",
            "Title cannot contain path separators or reserved filename characters."
          )
        );
        return;
      }
      setValidationError(null);
      const nextName = commitDocumentFilename(nextStem, extension);
      if (nextName === "" || nextName === title.trim()) {
        return;
      }
      onRename(nextName);
    },
    [extension, onRename, t, title]
  );

  const startEditing = useCallback(() => {
    if (!disabled) {
      setValidationError(null);
      setEditing(true);
    }
  }, [disabled]);

  const titleTypographySx = {
    fontFamily: "var(--fontFamily1)",
    fontSize: `calc(${FONT_SIZE_SANS.title} * 2)`,
    fontWeight: FONT_WEIGHT.semibold,
    lineHeight: 1.2,
    letterSpacing: "-0.02em"
  } as const;

  return (
    <Box
      className="doc-title-header"
      sx={{
        flexShrink: 0,
        width: "100%",
        boxSizing: "border-box",
        padding: `${getSpacingPx(SPACING.md)} ${getSpacingPx(SPACING.xl)} ${getSpacingPx(SPACING.sm)}`,
        borderBottom: `1px solid ${theme.vars.palette.divider}`,
        backgroundColor: theme.vars.palette.background.paper
      }}
    >
      <InlineEditableText
        value={stem}
        editing={editing}
        onEditingChange={handleEditingChange}
        onCommit={handleCommit}
        onCancel={clearValidationError}
        onDraftChange={clearValidationError}
        ariaLabel={t("documentEditor.title.ariaLabel", "Document title")}
        placeholder={untitledLabel}
        className="doc-title-input"
        sx={{
          ...titleTypographySx,
          width: "100%",
          boxSizing: "border-box",
          color: theme.vars.palette.text.primary,
          backgroundColor: theme.vars.palette.action.hover,
          padding: `${getSpacingPx(SPACING.xs)} ${getSpacingPx(SPACING.sm)}`,
          borderRadius: BORDER_RADIUS.sm
        }}
      >
        <Tooltip
          title={t("documentEditor.title.clickToRename", "Click to rename")}
          disabled={disabled}
          placement="bottom-start"
        >
          <Box
            component="button"
            type="button"
            className="doc-title-text"
            disabled={disabled}
            onClick={startEditing}
            aria-label={
              stem
                ? t("documentEditor.title.renameButton", {
                    title: stem,
                    defaultValue: "Rename document {{title}}"
                  })
                : t("documentEditor.title.renameUntitled", "Rename document")
            }
            sx={{
              ...titleTypographySx,
              display: "block",
              width: "100%",
              boxSizing: "border-box",
              textAlign: "left",
              background: "transparent",
              border: "none",
              margin: 0,
              padding: `${getSpacingPx(SPACING.xs)} ${getSpacingPx(SPACING.sm)}`,
              borderRadius: BORDER_RADIUS.sm,
              color: stem
                ? theme.vars.palette.text.primary
                : theme.vars.palette.text.disabled,
              cursor: disabled ? "default" : "text",
              overflowWrap: "anywhere",
              transition: MOTION.background,
              ...reducedMotion({ transition: MOTION.none }),
              ...(!disabled && {
                "&:hover": {
                  backgroundColor: theme.vars.palette.action.hover
                }
              }),
              "&:focus-visible": {
                outline: `2px solid ${theme.vars.palette.primary.main}`,
                outlineOffset: 1
              }
            }}
          >
            {stem || untitledLabel}
          </Box>
        </Tooltip>
      </InlineEditableText>
      {validationError && (
        <Caption
          role="alert"
          color="error"
          sx={{
            display: "block",
            padding: `${getSpacingPx(SPACING.xs)} ${getSpacingPx(SPACING.sm)} 0`
          }}
        >
          {validationError}
        </Caption>
      )}
    </Box>
  );
};

export default DocumentTitleHeader;
