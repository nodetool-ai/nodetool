/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { useTheme } from "@mui/material/styles";
import React, { memo, useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import BrushOutlinedIcon from "@mui/icons-material/BrushOutlined";
import MovieOutlinedIcon from "@mui/icons-material/MovieOutlined";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import DashboardCustomizeOutlinedIcon from "@mui/icons-material/DashboardCustomizeOutlined";
import RecordVoiceOverOutlinedIcon from "@mui/icons-material/RecordVoiceOverOutlined";
import DataObjectOutlinedIcon from "@mui/icons-material/DataObjectOutlined";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import GraphicEqOutlinedIcon from "@mui/icons-material/GraphicEqOutlined";
import ViewInArOutlinedIcon from "@mui/icons-material/ViewInArOutlined";
import ArticleOutlinedIcon from "@mui/icons-material/ArticleOutlined";

import {
  EmptyState,
  BORDER_RADIUS,
  MOTION,
  SPACING,
  getSpacingPx
} from "../ui_primitives";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import {
  useRecentDocuments,
  DOCUMENT_KINDS,
  DOCUMENT_KIND_LABEL,
  type DocumentKind,
  type RecentDocument
} from "../../hooks/useRecentDocuments";
import { useSectionWrap, SectionHeader, DashboardSearchBox } from "./dashboardChrome";
import { shortAgo } from "./runStatus";

/** How many documents the feed shows before the user filters or searches. */
const MAX_DOCUMENTS = 24;

const KIND_ICON: Record<DocumentKind, React.ReactNode> = {
  app: <DashboardCustomizeOutlinedIcon fontSize="inherit" />,
  sketch: <BrushOutlinedIcon fontSize="inherit" />,
  timeline: <MovieOutlinedIcon fontSize="inherit" />,
  storyboard: <DashboardOutlinedIcon fontSize="inherit" />,
  script: <RecordVoiceOverOutlinedIcon fontSize="inherit" />,
  jsscript: <DataObjectOutlinedIcon fontSize="inherit" />,
  image: <ImageOutlinedIcon fontSize="inherit" />,
  audio: <GraphicEqOutlinedIcon fontSize="inherit" />,
  model3d: <ViewInArOutlinedIcon fontSize="inherit" />,
  text: <ArticleOutlinedIcon fontSize="inherit" />
};

/** Singular label for one row's type badge; the chips use the plural. */
const KIND_BADGE: Record<DocumentKind, string> = {
  app: "App",
  sketch: "Sketch",
  timeline: "Video",
  storyboard: "Storyboard",
  script: "Script",
  jsscript: "JS script",
  image: "Image",
  audio: "Audio",
  model3d: "3D model",
  text: "Text"
};

const styles = (theme: Theme) =>
  css({
    paddingTop: getSpacingPx(SPACING.md),
    ".doc-chips": {
      display: "flex",
      flexWrap: "wrap",
      gap: getSpacingPx(SPACING.micro),
      paddingBottom: getSpacingPx(SPACING.sm)
    },
    ".doc-chip": {
      display: "inline-flex",
      alignItems: "center",
      gap: getSpacingPx(SPACING.xs),
      height: 26,
      padding: `0 ${getSpacingPx(SPACING.sm)}`,
      background: theme.vars.palette.c_node_bg,
      border: `1px solid ${theme.vars.palette.divider}`,
      borderRadius: BORDER_RADIUS.pill,
      color: theme.vars.palette.text.secondary,
      fontSize: "var(--fontSizeSmaller)",
      cursor: "pointer",
      transition: `background ${MOTION.fast}, color ${MOTION.fast}, border-color ${MOTION.fast}`,
      "&:hover": { color: theme.vars.palette.text.primary },
      "&.on": {
        background: theme.vars.palette.c_node_bg_group,
        borderColor: `rgba(${theme.vars.palette.primary.mainChannel} / 0.5)`,
        color: theme.vars.palette.text.primary
      }
    },
    ".doc-chip-count": {
      fontFamily: theme.fontFamily2,
      color: theme.vars.palette.text.disabled
    },
    ".doc-list": {
      border: `1px solid ${theme.vars.palette.divider}`,
      borderRadius: BORDER_RADIUS.lg,
      background: theme.vars.palette.c_node_bg,
      padding: getSpacingPx(SPACING.sm),
      display: "flex",
      flexDirection: "column",
      gap: getSpacingPx(SPACING.micro)
    },
    ".doc-row": {
      display: "flex",
      alignItems: "center",
      gap: getSpacingPx(SPACING.md),
      width: "100%",
      textAlign: "left",
      padding: `${getSpacingPx(SPACING.sm)} ${getSpacingPx(SPACING.md)}`,
      background: "transparent",
      border: "none",
      borderRadius: BORDER_RADIUS.sm,
      cursor: "pointer",
      transition: `background ${MOTION.fast}`,
      "&:hover": { background: theme.vars.palette.action.hover }
    },
    ".doc-icon": {
      flexShrink: 0,
      display: "grid",
      placeItems: "center",
      width: 24,
      height: 24,
      fontSize: "var(--fontSizeSmall)",
      borderRadius: BORDER_RADIUS.sm,
      background: `rgba(${theme.vars.palette.primary.mainChannel} / 0.12)`,
      color: theme.vars.palette.primary.main,
      overflow: "hidden"
    },
    ".doc-thumb": {
      width: "100%",
      height: "100%",
      objectFit: "cover"
    },
    ".doc-title": {
      flex: 1,
      minWidth: 0,
      fontSize: "var(--fontSizeSmall)",
      color: theme.vars.palette.text.primary,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },
    ".doc-kind": {
      flexShrink: 0,
      fontFamily: theme.fontFamily2,
      fontSize: "var(--fontSizeSmaller)",
      color: theme.vars.palette.text.secondary
    },
    ".doc-when": {
      flexShrink: 0,
      width: 34,
      textAlign: "right",
      fontFamily: theme.fontFamily2,
      fontSize: "var(--fontSizeSmaller)",
      color: theme.vars.palette.text.disabled
    }
  });

interface DocumentRowProps {
  doc: RecentDocument;
  onOpen: (doc: RecentDocument) => void;
}

const DocumentRow = memo(function DocumentRow({
  doc,
  onOpen
}: DocumentRowProps) {
  return (
    <button
      type="button"
      className="doc-row"
      onClick={() => onOpen(doc)}
    >
      <span className="doc-icon" aria-hidden>
        {doc.thumbUrl ? (
          <img className="doc-thumb" src={doc.thumbUrl} alt="" />
        ) : (
          KIND_ICON[doc.kind]
        )}
      </span>
      <span className="doc-title">{doc.name}</span>
      <span className="doc-kind">{KIND_BADGE[doc.kind]}</span>
      <span className="doc-when">{shortAgo(doc.updatedAt)}</span>
    </button>
  );
});

/**
 * Everything the user has made that is not a workflow or a chat: apps,
 * sketches, videos, storyboards, scripts, JS scripts, and the assets that open
 * as documents. One feed ordered by recency, narrowed by the type chips.
 */
const DashboardDocuments: React.FC = () => {
  const theme = useTheme();
  const sectionWrap = useSectionWrap();
  const navigate = useNavigate();
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const { documents, isLoading } = useRecentDocuments();

  const [kind, setKind] = useState<DocumentKind | null>(null);
  const [query, setQuery] = useState("");

  const counts = useMemo(() => {
    const byKind = new Map<DocumentKind, number>();
    for (const doc of documents) {
      byKind.set(doc.kind, (byKind.get(doc.kind) ?? 0) + 1);
    }
    return byKind;
  }, [documents]);

  // Only the types the user actually has: an empty chip is a dead control.
  const availableKinds = useMemo(
    () => DOCUMENT_KINDS.filter((k) => (counts.get(k) ?? 0) > 0),
    [counts]
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return documents.filter(
      (doc) =>
        (kind === null || doc.kind === kind) &&
        (!needle || doc.name.toLowerCase().includes(needle))
    );
  }, [documents, kind, query]);

  const visible = useMemo(
    () => filtered.slice(0, MAX_DOCUMENTS),
    [filtered]
  );

  const handleOpen = useCallback(
    (doc: RecentDocument) => {
      openTab({
        type: doc.tabType,
        ref: doc.id,
        mode: "edit",
        title: doc.name
      });
      navigate("/workspace");
    },
    [openTab, navigate]
  );

  // Nothing useful to say while the queries settle, and a user with no
  // documents beyond workflows is better served by the sections that follow
  // than by an empty box.
  if (isLoading || documents.length === 0) {
    return null;
  }

  const hasQuery = query.trim().length > 0;
  // Counts what is on screen, not what matched: the feed is capped, so
  // "24 of 60" has to mean the user is seeing 24.
  const countLabel =
    visible.length === documents.length
      ? `${documents.length}`
      : `${visible.length} of ${documents.length}`;

  return (
    <section css={styles(theme)} aria-label="Documents">
      <div css={sectionWrap}>
        <SectionHeader title="Recent documents" count={countLabel}>
          <DashboardSearchBox
            value={query}
            onChange={setQuery}
            placeholder="Search documents…"
            aria-label="Search documents"
          />
        </SectionHeader>

        <div className="doc-chips" role="group" aria-label="Filter by type">
          <button
            type="button"
            className={kind === null ? "doc-chip on" : "doc-chip"}
            aria-pressed={kind === null}
            onClick={() => setKind(null)}
          >
            All
            <span className="doc-chip-count">{documents.length}</span>
          </button>
          {availableKinds.map((k) => (
            <button
              key={k}
              type="button"
              className={kind === k ? "doc-chip on" : "doc-chip"}
              aria-pressed={kind === k}
              onClick={() => setKind(kind === k ? null : k)}
            >
              {DOCUMENT_KIND_LABEL[k]}
              <span className="doc-chip-count">{counts.get(k)}</span>
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <EmptyState
            variant="no-results"
            size="small"
            title="No matching documents"
            description={
              hasQuery
                ? `No documents match “${query.trim()}”.`
                : "No documents of this type."
            }
            actionText="Clear filters"
            onAction={() => {
              setQuery("");
              setKind(null);
            }}
          />
        ) : (
          <div className="doc-list">
            {visible.map((doc) => (
              <DocumentRow
                key={doc.key}
                doc={doc}
                onOpen={handleOpen}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default memo(DashboardDocuments);
