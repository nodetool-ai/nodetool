/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo } from "react";
import { useTranslation } from "react-i18next";
import {
  BORDER_RADIUS,
  Chip,
  getSpacingPx,
  SPACING,
  StatusBar,
  EYEBROW
} from "../ui_primitives";
import LockIcon from "@mui/icons-material/Lock";

interface EditorStatusBarProps {
  text: string;
  readOnly?: boolean;
  /** Number of template variables detected in the document. */
  varCount?: number;
  /** Active editor language label (e.g. "Plain Text"). */
  languageLabel?: string;
  /** Current cursor position (1-based). Shown when available. */
  cursor?: { line: number; column: number } | null;
  /** Indent size in spaces, shown as "Spaces: n". */
  indentSize?: number;
  /** Character encoding label. */
  encoding?: string;
}

const styles = (theme: Theme) =>
  css({
    ".stats": {
      display: "flex",
      gap: getSpacingPx(SPACING.md),
      alignItems: "center"
    },
    ".stat-item": {
      display: "flex",
      alignItems: "center",
      gap: getSpacingPx(SPACING.xs),
      ...EYEBROW,
      ".label": {
        fontWeight: 400,
        opacity: 0.7
      },
      ".value": {
        color: theme.vars.palette.text.primary,
        fontWeight: 600
      }
    },
    ".stat-dot": {
      width: "3px",
      height: "3px",
      borderRadius: BORDER_RADIUS.circle,
      backgroundColor: theme.vars.palette.text.disabled,
      flexShrink: 0
    },
    ".status-info": {
      display: "flex",
      alignItems: "center",
      gap: getSpacingPx(SPACING.lg),
      ".info-item": {
        whiteSpace: "nowrap"
      }
    }
  });

const EditorStatusBar = ({
  text,
  readOnly = false,
  varCount,
  languageLabel,
  cursor,
  indentSize = 2,
  encoding = "UTF-8"
}: EditorStatusBarProps) => {
  const theme = useTheme();
  const { t, i18n } = useTranslation("translation", { keyPrefix: "screen_scripts_text" });
  const numberFormat = new Intl.NumberFormat(i18n.resolvedLanguage);

  const wordCount = text.trim() === "" ? 0 : text.trim().split(/\s+/).length;
  const charCount = text.length;
  const lineCount = text === "" ? 1 : text.split("\n").length;

  return (
    <StatusBar
      className="editor-status-bar"
      css={styles(theme)}
      sx={{ justifyContent: "space-between" }}
    >
      <div className="stats">
        <div className="stat-item">
          <span className="label">{t("textEditor.words")}</span>
          <span className="value">{numberFormat.format(wordCount)}</span>
        </div>
        <span className="stat-dot" />
        <div className="stat-item">
          <span className="label">{t("textEditor.characters")}</span>
          <span className="value">{numberFormat.format(charCount)}</span>
        </div>
        <span className="stat-dot" />
        <div className="stat-item">
          <span className="label">{t("textEditor.lines")}</span>
          <span className="value">{numberFormat.format(lineCount)}</span>
        </div>
        {varCount !== undefined && (
          <>
            <span className="stat-dot" />
            <div className="stat-item">
              <span className="label">{t("textEditor.variablesShort")}</span>
              <span className="value">{numberFormat.format(varCount)}</span>
            </div>
          </>
        )}
      </div>
      <div className="status-info">
        {readOnly && (
          <Chip
            compact
            color="warning"
            icon={<LockIcon />}
            label={t("textEditor.readOnly")}
          />
        )}
        {cursor && (
          <span className="info-item">
            {t("textEditor.cursorPosition", {
              line: numberFormat.format(cursor.line),
              column: numberFormat.format(cursor.column)
            })}
          </span>
        )}
        {languageLabel && <span className="info-item">{languageLabel}</span>}
        <span className="info-item">
          {t("textEditor.spaces", { count: indentSize })}
        </span>
        <span className="info-item">{encoding}</span>
      </div>
    </StatusBar>
  );
};

export default memo(EditorStatusBar);
