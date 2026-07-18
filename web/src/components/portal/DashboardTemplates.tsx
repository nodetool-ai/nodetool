/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { useTheme } from "@mui/material/styles";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Workflow, WorkflowList as WorkflowListType } from "../../stores/ApiTypes";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { useWorkflowActions } from "../../hooks/useWorkflowActions";
import {
  TOP_CATEGORIES,
  workflowsForCategory,
  isGettingStarted,
  getCategoryForWorkflow
} from "../../utils/templateCategories";
import WorkflowCard from "../workflows/WorkflowCard";
import {
  EmptyState,
  LoadingSpinner,
  MOTION,
  BORDER_RADIUS,
  getSpacingPx
} from "../ui_primitives";
import {
  wrapStyles,
  SectionHeader,
  DashboardSearchBox,
  SectionLink
} from "./dashboardChrome";

const MAX_VISIBLE = 8;

const styles = (theme: Theme) =>
  css({
    paddingTop: 8,
    ".cats": {
      display: "flex",
      gap: 8,
      flexWrap: "wrap",
      marginBottom: 8
    },
    ".cat": {
      display: "inline-flex",
      alignItems: "center",
      gap: `${theme.spacing(0.75)}`,
      height: 30,
      padding: `0 ${theme.spacing(1.75)}`,
      borderRadius: BORDER_RADIUS.pill,
      fontSize: "var(--fontSizeSmall)",
      background: "transparent",
      color: theme.vars.palette.text.secondary,
      border: `1px solid ${theme.vars.palette.divider}`,
      cursor: "pointer",
      transition: `color ${MOTION.fast}, border-color ${MOTION.fast}, background ${MOTION.fast}`,
      "&:hover": {
        color: theme.vars.palette.text.primary,
        borderColor: theme.vars.palette.action.focus
      }
    },
    ".cat-dot": {
      width: 7,
      height: 7,
      borderRadius: BORDER_RADIUS.circle,
      flexShrink: 0
    },
    // Neutral "All" active state; category pills override colours inline.
    ".cat.on": {
      background: `rgba(${theme.vars.palette.primary.mainChannel} / 0.14)`,
      color: theme.vars.palette.primary.light,
      borderColor: `rgba(${theme.vars.palette.primary.mainChannel} / 0.45)`
    },
    ".tpl-grid": {
      display: "grid",
      gridTemplateColumns: "repeat(4, 1fr)",
      gap: 8,
      [theme.breakpoints.down("lg")]: {
        gridTemplateColumns: "repeat(3, 1fr)"
      },
      [theme.breakpoints.down("md")]: {
        gridTemplateColumns: "repeat(2, 1fr)"
      },
      [theme.breakpoints.down("sm")]: {
        gridTemplateColumns: "1fr"
      }
    },
    ".tpl-loading, .tpl-empty": {
      display: "flex",
      justifyContent: "center",
      padding: `${getSpacingPx(10)} 0`, // was 40px 0
      color: theme.vars.palette.text.secondary,
      fontSize: 14
    }
  });

// In full-page (/examples) mode the section owns the viewport and scrolls,
// rather than flowing inline among the dashboard's other sections.
const fullPageStyles = css({
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
  paddingTop: 24,
  paddingBottom: 32
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
  const loadTemplates = useWorkflowManager((state) => state.loadTemplates);
  const { handleExampleClick, handleViewAllTemplates, loadingExampleId } =
    useWorkflowActions();

  const [category, setCategory] = useState<string>("all");
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  // The search box advertises "/" as a shortcut; make it work. Focus the
  // template search when the user presses "/" anywhere outside a text field.
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        target?.isContentEditable
      ) {
        return;
      }
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

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
    : query.trim() || category !== "all"
      ? `${filtered.length} match${filtered.length === 1 ? "" : "es"}`
      : `hand-picked · ${Math.min(filtered.length, MAX_VISIBLE)}`;

  return (
    <section css={fullPage ? [styles(theme), fullPageStyles] : styles(theme)}>
      <div css={wrapStyles(theme)}>
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

        <div className="cats">
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
          {!fullPage && (
            <button
              type="button"
              className="cat"
              onClick={handleViewAllTemplates}
            >
              More…
            </button>
          )}
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
          <div className="tpl-grid">
            {visible.map((workflow: Workflow) => {
              const cat = getCategoryForWorkflow(workflow);
              return (
                <WorkflowCard
                  key={workflow.id}
                  workflow={workflow}
                  matchedNodes={[]}
                  nodesOnlySearch={false}
                  isLoading={loadingExampleId === workflow.id}
                  onClick={handleExampleClick}
                  tint={cat?.color}
                  categoryLabel={cat?.label}
                  hideTags={cat?.tags}
                  maxChips={1}
                  descriptionLines={2}
                />
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};

export default memo(DashboardTemplates);
