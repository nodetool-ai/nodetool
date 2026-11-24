/**
 * View-only zoom and paper theme controls for the document editor
 * (document editor PRD R30). Adjusts reading scale and white/gray paper
 * contrast without modifying the stored Markdown file.
 */
import { useCallback, useEffect, useState, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@mui/material/styles";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import PaletteOutlinedIcon from "@mui/icons-material/PaletteOutlined";
import RemoveIcon from "@mui/icons-material/Remove";

import {
  Caption,
  EditorButton,
  EditorMenu,
  MenuItemPrimitive,
  ToolbarDivider,
  ToolbarGroup,
  ToolbarIconButton
} from "../ui_primitives";

export type DocumentPaperTheme = "theme" | "white" | "gray";

export const DOCUMENT_ZOOM_MIN = 0.75;
export const DOCUMENT_ZOOM_MAX = 2.0;
export const DOCUMENT_ZOOM_STEP = 0.1;
export const DOCUMENT_DISPLAY_PREFS_STORAGE_KEY =
  "nodetool_document_display_prefs";

const DEFAULT_ZOOM = 1;
const DEFAULT_PAPER_THEME: DocumentPaperTheme = "theme";

export interface DocumentDisplayPreferences {
  zoom: number;
  setZoom: (zoom: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  paperTheme: DocumentPaperTheme;
  setPaperTheme: (paperTheme: DocumentPaperTheme) => void;
}

interface StoredDisplayPrefs {
  zoom: number;
  paperTheme: DocumentPaperTheme;
}

function clampZoom(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_ZOOM;
  }
  const clamped = Math.min(DOCUMENT_ZOOM_MAX, Math.max(DOCUMENT_ZOOM_MIN, value));
  return Math.round(clamped * 100) / 100;
}

function isPaperTheme(value: unknown): value is DocumentPaperTheme {
  return value === "theme" || value === "white" || value === "gray";
}

function readStoredPrefs(): StoredDisplayPrefs {
  if (typeof window === "undefined") {
    return { zoom: DEFAULT_ZOOM, paperTheme: DEFAULT_PAPER_THEME };
  }
  try {
    const raw = window.localStorage.getItem(DOCUMENT_DISPLAY_PREFS_STORAGE_KEY);
    if (!raw) {
      return { zoom: DEFAULT_ZOOM, paperTheme: DEFAULT_PAPER_THEME };
    }
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return { zoom: DEFAULT_ZOOM, paperTheme: DEFAULT_PAPER_THEME };
    }
    const record = parsed as Record<string, unknown>;
    return {
      zoom:
        typeof record.zoom === "number"
          ? clampZoom(record.zoom)
          : DEFAULT_ZOOM,
      paperTheme: isPaperTheme(record.paperTheme)
        ? record.paperTheme
        : DEFAULT_PAPER_THEME
    };
  } catch {
    return { zoom: DEFAULT_ZOOM, paperTheme: DEFAULT_PAPER_THEME };
  }
}

function writeStoredPrefs(prefs: StoredDisplayPrefs): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(
      DOCUMENT_DISPLAY_PREFS_STORAGE_KEY,
      JSON.stringify(prefs)
    );
  } catch {
    // Ignore storage quota or private browsing errors.
  }
}

/** CSS class for the active paper background theme. */
export function documentPaperThemeClass(paperTheme: DocumentPaperTheme): string {
  if (paperTheme === "white") {
    return "doc-paper-white";
  }
  if (paperTheme === "gray") {
    return "doc-paper-gray";
  }
  return "";
}

/** Persisted zoom level and paper background preference for the document editor. */
export function useDocumentDisplayPreferences(): DocumentDisplayPreferences {
  const [prefs, setPrefs] = useState<StoredDisplayPrefs>(readStoredPrefs);

  useEffect(() => {
    writeStoredPrefs(prefs);
  }, [prefs]);

  const setZoom = useCallback((nextZoom: number) => {
    setPrefs((current) => ({ ...current, zoom: clampZoom(nextZoom) }));
  }, []);

  const zoomIn = useCallback(() => {
    setPrefs((current) => ({
      ...current,
      zoom: clampZoom(current.zoom + DOCUMENT_ZOOM_STEP)
    }));
  }, []);

  const zoomOut = useCallback(() => {
    setPrefs((current) => ({
      ...current,
      zoom: clampZoom(current.zoom - DOCUMENT_ZOOM_STEP)
    }));
  }, []);

  const resetZoom = useCallback(() => {
    setPrefs((current) => ({ ...current, zoom: DEFAULT_ZOOM }));
  }, []);

  const setPaperTheme = useCallback((paperTheme: DocumentPaperTheme) => {
    setPrefs((current) => ({ ...current, paperTheme }));
  }, []);

  return {
    zoom: prefs.zoom,
    setZoom,
    zoomIn,
    zoomOut,
    resetZoom,
    paperTheme: prefs.paperTheme,
    setPaperTheme
  };
}

export interface DocumentDisplayControlsProps {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  paperTheme: DocumentPaperTheme;
  onPaperThemeChange: (paperTheme: DocumentPaperTheme) => void;
}

export const DocumentDisplayControls = ({
  zoom,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  paperTheme,
  onPaperThemeChange
}: DocumentDisplayControlsProps) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const percent = Math.round(zoom * 100);

  const pickPaperTheme = (next: DocumentPaperTheme) => {
    setMenuAnchor(null);
    onPaperThemeChange(next);
  };

  return (
    <ToolbarGroup
      role="group"
      aria-label={t("documentEditor.display.controlsLabel", "Document display")}
    >
      <ToolbarIconButton
        icon={<RemoveIcon fontSize="small" />}
        tooltip={t("documentEditor.display.zoomOut", "Zoom out")}
        disabled={zoom <= DOCUMENT_ZOOM_MIN}
        onClick={onZoomOut}
      />
      <EditorButton
        variant="text"
        density="compact"
        tooltip={t("documentEditor.display.resetZoom", "Reset zoom to 100%")}
        aria-label={t("documentEditor.display.resetZoomAria", {
          percent,
          defaultValue: "Zoom {{percent}}%, reset to 100%"
        })}
        onClick={onResetZoom}
        sx={{ minWidth: 48 }}
      >
        <Caption
          size="small"
          sx={{
            fontFamily: "var(--fontFamily2)",
            color: theme.vars.palette.text.primary
          }}
        >
          {percent}%
        </Caption>
      </EditorButton>
      <ToolbarIconButton
        icon={<AddOutlinedIcon fontSize="small" />}
        tooltip={t("documentEditor.display.zoomIn", "Zoom in")}
        disabled={zoom >= DOCUMENT_ZOOM_MAX}
        onClick={onZoomIn}
      />
      <ToolbarDivider />
      <ToolbarIconButton
        icon={<PaletteOutlinedIcon fontSize="small" />}
        tooltip={t("documentEditor.display.paperTheme", "Paper theme")}
        aria-haspopup="menu"
        aria-expanded={menuAnchor !== null}
        active={paperTheme !== "theme" || menuAnchor !== null}
        onClick={(event: MouseEvent<HTMLElement>) =>
          setMenuAnchor(event.currentTarget)
        }
      />
      <EditorMenu
        anchorEl={menuAnchor}
        open={menuAnchor !== null}
        onClose={() => setMenuAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
      >
        <MenuItemPrimitive
          checkable="radio"
          checked={paperTheme === "theme"}
          label={t("documentEditor.display.themeApp", "App theme")}
          onClick={() => pickPaperTheme("theme")}
        />
        <MenuItemPrimitive
          checkable="radio"
          checked={paperTheme === "white"}
          label={t("documentEditor.display.themeWhite", "White paper")}
          onClick={() => pickPaperTheme("white")}
        />
        <MenuItemPrimitive
          checkable="radio"
          checked={paperTheme === "gray"}
          label={t("documentEditor.display.themeGray", "Gray paper")}
          onClick={() => pickPaperTheme("gray")}
        />
      </EditorMenu>
    </ToolbarGroup>
  );
};

export default DocumentDisplayControls;
