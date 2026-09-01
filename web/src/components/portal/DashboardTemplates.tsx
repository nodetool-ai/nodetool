/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { useTheme } from "@mui/material/styles";
import { memo, useMemo, useRef, useState } from "react";
import { useGlobalCombo } from "../../stores/KeyPressedStore";
import { useQuery } from "@tanstack/react-query";
import { Workflow, WorkflowList as WorkflowListType } from "../../stores/ApiTypes";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { useWorkflowActions } from "../../hooks/useWorkflowActions";
import { BASE_URL } from "../../stores/BASE_URL";
import {
  TOP_CATEGORIES,
  workflowsForCategory,
  isGettingStarted,
  getCategoryForWorkflow
} from "../../utils/templateCategories";
import {
  EmptyState,
  LoadingSpinner,
  MOTION,
  BORDER_RADIUS,
  SPACING,
  getSpacingPx
} from "../ui_primitives";
import {
  useSectionWrap,
  SectionHeader,
  DashboardSearchBox,
  SectionLink
} from "./dashboardChrome";

/** Rows shown on the dashboard before the user searches or opens /examples. */
const MAX_VISIBLE = 18;

/** Anchor the dashboard checklist scrolls to for its "open a template" step. */
const DASHBOARD_TEMPLATES_SECTION_ID = "dashboard-templates";

const styles = (theme: Theme) =>
  css({
    paddingTop: getSpacingPx(SPACING.md),
    ".cats": {
      display: "flex",
      flexWrap: "wrap",
      gap: getSpacingPx(SPACING.micro),
      paddingBottom: getSpacingPx(SPACING.sm)
    },
    ".cat": {
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
      // Neutral "All" active state; category pills override colours inline.
      "&.on": {
        background: theme.vars.palette.c_node_bg_group,
        borderColor: `rgba(${theme.vars.palette.primary.mainChannel} / 0.5)`,
        color: theme.vars.palette.text.primary
      }
    },
    ".cat-dot": {
      width: 7,
      height: 7,
      borderRadius: BORDER_RADIUS.circle,
      flexShrink: 0
    },
    ".tpl-list": {
      border: `1px solid ${theme.vars.palette.divider}`,
      borderRadius: BORDER_RADIUS.lg,
      background: theme.vars.palette.c_node_bg,
      padding: getSpacingPx(SPACING.sm),
      display: "flex",
      flexDirection: "column",
      gap: getSpacingPx(SPACING.micro)
    },
    ".tpl-row": {
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
      "&:hover": { background: theme.vars.palette.action.hover },
      "&.loading": { cursor: "wait", pointerEvents: "none" }
    },
    ".tpl-icon": {
      flexShrink: 0,
      display: "grid",
      placeItems: "center",
      width: 24,
      height: 24,
      borderRadius: BORDER_RADIUS.sm,
      background: `rgba(${theme.vars.palette.primary.mainChannel} / 0.12)`,
      color: theme.vars.palette.primary.main,
      overflow: "hidden"
    },
    ".tpl-thumb": {
      width: "100%",
      height: "100%",
      objectFit: "cover"
    },
    ".tpl-title": {
      flexShrink: 0,
      maxWidth: "50%",
      fontSize: "var(--fontSizeSmall)",
      color: theme.vars.palette.text.primary,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },
    ".tpl-desc": {
      flex: 1,
      minWidth: 0,
      fontSize: "var(--fontSizeSmaller)",
      color: theme.vars.palette.text.secondary,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      [theme.breakpoints.down("sm")]: { display: "none" }
    },
    ".tpl-cat": {
      flexShrink: 0,
      display: "inline-flex",
      alignItems: "center",
      gap: getSpacingPx(SPACING.xs),
      fontFamily: theme.fontFamily2,
      fontSize: "var(--fontSizeSmaller)",
      color: theme.vars.palette.text.disabled
    },
    ".tpl-loading, .tpl-empty": {
      display: "flex",
      justifyContent: "center",
      padding: `${getSpacingPx(SPACING.xxl)} 0`,
      color: theme.vars.palette.text.secondary,
      fontSize: "var(--fontSizeNormal)"
    }
  });

// In full-page (/examples) mode the section owns the viewport and scrolls,
// rather than flowing inline among the dashboard's other sections.
const fullPageStyles = css({
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
  paddingTop: getSpacingPx(SPACING.xxl),
  paddingBottom: getSpacingPx(SPACING.xxxl)
});

/** Stand-in when a template ships no thumbnail (or it fails to load). */
const templateGlyph = (
  <svg
    width="13"
    height="13"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
  >
    <rect x="2.5" y="2.5" width="11" height="11" rx="2" />
    <path d="M2.5 6.5h11M6.5 6.5v7" />
  </svg>
);

interface TemplateRowProps {
  workflow: Workflow;
  isLoading: boolean;
  onClick: (workflow: Workflow) => void;
}

const TemplateRow = memo(function TemplateRow({
  workflow,
  isLoading,
  onClick
}: TemplateRowProps) {
  const [thumbFailed, setThumbFailed] = useState(false);
  const category = getCategoryForWorkflow(workflow);

  // The server sets thumbnail_url only when the image exists (with an
  // md5-based ?v=<hash> cache buster), so a missing one means there is
  // nothing to request — guessing a URL just logs a 404 per row.
  const thumbUrl = useMemo(() => {
    const url = workflow.thumbnail_url;
    if (!url) {
      return null;
    }
    return url.startsWith("http") ? url : `${BASE_URL}${url}`;
  }, [workflow.thumbnail_url]);

  return (
    <button
      type="button"
      className={isLoading ? "tpl-row loading" : "tpl-row"}
      title={workflow.description || workflow.name}
      onClick={() => onClick(workflow)}
    >
      <span
        className="tpl-icon"
        aria-hidden
        style={
          category && (!thumbUrl || thumbFailed)
            ? { background: `${category.color}24`, color: category.color }
            : undefined
        }
      >
        {isLoading ? (
          <LoadingSpinner size="small" />
        ) : !thumbUrl || thumbFailed ? (
          templateGlyph
        ) : (
          <img
            className="tpl-thumb"
            src={thumbUrl}
            alt=""
            loading="lazy"
            onError={() => setThumbFailed(true)}
          />
        )}
      </span>
      <span className="tpl-title">{workflow.name}</span>
      <span className="tpl-desc">{workflow.description}</span>
      {category && (
        <span className="tpl-cat">
          <span className="cat-dot" style={{ background: category.color }} />
          {category.label}
        </span>
      )}
    </button>
  );
});

interface DashboardTemplatesProps {
  /**
   * Render as the standalone /examples page: show every example (no cap),
   * own the scroll, and drop the dashboard-only "Browse all"/"More…" links.
   */
  fullPage?: boolean;
}

const DashboardTemplates: React.FC<DashboardTemplatesProps> = ({
  fullPage = false
}) => {
  const theme = useTheme();
  const sectionWrap = useSectionWrap();
  const loadTemplates = useWorkflowManager((state) => state.loadTemplates);
  const { handleExampleClick, handleViewAllTemplates, loadingExampleId } =
    useWorkflowActions();

  const [category, setCategory] = useState<string>("all");
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  // The search box advertises "/" as a shortcut; make it work. The store gates
  // it: nothing editable focused, and this input can actually take focus.
  useGlobalCombo("/", () => searchRef.current?.focus(), {
    target: () => searchRef.current
  });

  const { data, isLoading, isError, refetch } = useQuery<WorkflowListType>({
    queryKey: ["templates"],
    queryFn: loadTemplates
  });

  const allTemplates = useMemo(() => data?.workflows ?? [], [data]);

  const filtered = useMemo(() => {
    const base =
      category === "all"
        ? allTemplates
        : workflowsForCategory(allTemplates, category);

    const q = query.trim().toLowerCase();
    const searched = q
      ? base.filter((w) => {
          const haystack = [w.name, w.description, ...(w.tags ?? [])]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return haystack.includes(q);
        })
      : base;

    // Surface getting-started picks first when browsing everything unfiltered.
    return [...searched].sort((a, b) => {
      if (category === "all" && !q) {
        const ga = isGettingStarted(a) ? 0 : 1;
        const gb = isGettingStarted(b) ? 0 : 1;
        if (ga !== gb) return ga - gb;
      }
      return a.name.localeCompare(b.name);
    });
  }, [allTemplates, category, query]);

  const visible = fullPage ? filtered : filtered.slice(0, MAX_VISIBLE);
  const countLabel = fullPage
    ? `${filtered.length} example${filtered.length === 1 ? "" : "s"}`
    : visible.length === filtered.length
      ? `${filtered.length}`
      : `${visible.length} of ${filtered.length}`;

  return (
    <section
      id={DASHBOARD_TEMPLATES_SECTION_ID}
      css={fullPage ? [styles(theme), fullPageStyles] : styles(theme)}
    >
      <div css={sectionWrap}>
        <SectionHeader title="Start from a template" count={countLabel}>
          <DashboardSearchBox
            ref={searchRef}
            value={query}
            onChange={setQuery}
            placeholder="Search templates by name, tag…"
            kbd="/"
            aria-label="Search templates"
          />
          {!fullPage && (
            <SectionLink onClick={handleViewAllTemplates}>
              Browse all
            </SectionLink>
          )}
        </SectionHeader>

        <div className="cats" role="group" aria-label="Filter by category">
          <button
            type="button"
            className={`cat${category === "all" ? " on" : ""}`}
            aria-pressed={category === "all"}
            onClick={() => setCategory("all")}
          >
            All
          </button>
          {TOP_CATEGORIES.map((cat) => {
            const active = category === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                className={`cat${active ? " on" : ""}`}
                aria-pressed={active}
                onClick={() => setCategory(cat.id)}
                style={
                  active
                    ? {
                        background: `${cat.color}24`,
                        borderColor: `${cat.color}73`,
                        color: cat.color
                      }
                    : undefined
                }
              >
                <span className="cat-dot" style={{ background: cat.color }} />
                {cat.label}
              </button>
            );
          })}
        </div>

        {isLoading ? (
          <div className="tpl-loading">
            <LoadingSpinner size="medium" text="Loading templates" />
          </div>
        ) : isError ? (
          <div className="tpl-empty">
            <EmptyState
              variant="error"
              title="Couldn't load templates"
              description="Try again in a moment."
              actionText="Retry"
              onAction={() => refetch()}
            />
          </div>
        ) : visible.length === 0 ? (
          <div className="tpl-empty">
            {query.trim() ? (
              <EmptyState
                variant="no-results"
                title="No templates match your search"
                description="Try a different search term."
                actionText="Clear search"
                onAction={() => setQuery("")}
              />
            ) : category !== "all" ? (
              <EmptyState
                variant="no-results"
                title="No templates in this category"
                actionText="Show all templates"
                onAction={() => setCategory("all")}
              />
            ) : (
              <EmptyState
                variant="no-data"
                title="No templates available"
                description="Templates will appear here when available."
              />
            )}
          </div>
        ) : (
          <div className="tpl-list">
            {visible.map((workflow: Workflow) => (
              <TemplateRow
                key={workflow.id}
                workflow={workflow}
                isLoading={loadingExampleId === workflow.id}
                onClick={handleExampleClick}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default memo(DashboardTemplates);
