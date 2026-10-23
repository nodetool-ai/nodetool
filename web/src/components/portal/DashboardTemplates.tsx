/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { useTheme } from "@mui/material/styles";
import { memo, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatUsd } from "@nodetool-ai/model-pricing";
import type { WorkflowCostEstimateDetail } from "@nodetool-ai/node-sdk/cost-estimate";
import { useGlobalCombo } from "../../stores/KeyPressedStore";
import { useQuery } from "@tanstack/react-query";
import type { NodeMetadata, Workflow, WorkflowList as WorkflowListType } from "../../stores/ApiTypes";
import useMetadataStore from "../../stores/MetadataStore";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { useWorkflowActions } from "../../hooks/useWorkflowActions";
import { BASE_URL } from "../../stores/BASE_URL";
import { estimateGraphCost } from "../../hooks/useGraphCostEstimate";
import {
  TOP_CATEGORIES,
  workflowsForCategory,
  isGettingStarted,
  getCategoryForWorkflow
} from "../../utils/templateCategories";
import {
  AutoGrid,
  EmptyState,
  LoadingSpinner,
  BORDER_RADIUS,
  SPACING,
  TYPOGRAPHY,
  getSpacingPx,
  selectableTileStyles,
  Tooltip,
  Chip,
  Caption,
  FlexRow,
  GAP
} from "../ui_primitives";
import {
  useSectionWrap,
  DashboardSectionHeader,
  DashboardSearchBox,
  SectionLink
} from "./dashboardChrome";
import {
  CompatibilityDetails,
  getWorkflowCompatibility
} from "./entryCompatibility";
import ExampleNeedsPill from "./ExampleNeedsPill";
import { fewestNeedsFirst, runsAsIs } from "../../utils/exampleNeeds";
import { matchesSearch } from "../../utils/matchesSearch";
import { listExampleApps } from "../../utils/exampleApps";
import { useOpenExampleApp } from "../../hooks/useOpenExampleApp";
import { EXAMPLE_APPS_QUERY_KEY } from "./DashboardExampleApps";

/** Rows shown on the dashboard before the user searches or opens the Examples tab. */
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
    ".cat-dot": {
      width: 7,
      height: 7,
      borderRadius: BORDER_RADIUS.circle,
      flexShrink: 0
    },
    ".tpl-list": {
      paddingBottom: getSpacingPx(SPACING.sm)
    },
    ".tpl-row": {
      ...selectableTileStyles(theme),
      display: "flex",
      flexDirection: "column",
      alignItems: "stretch",
      minWidth: 0,
      textAlign: "left",
      padding: 0,
      background: theme.vars.palette.c_node_bg,
      color: "inherit",
      cursor: "pointer",
      overflow: "hidden",
      "&.loading": { cursor: "wait", pointerEvents: "none" }
    },
    ".tpl-icon": {
      display: "grid",
      placeItems: "center",
      width: "100%",
      aspectRatio: "16 / 9",
      background: `rgba(${theme.vars.palette.primary.mainChannel} / 0.12)`,
      color: theme.vars.palette.primary.main,
      overflow: "hidden"
    },
    ".tpl-glyph": { width: 28, height: 28 },
    ".tpl-thumb": {
      width: "100%",
      height: "100%",
      objectFit: "cover"
    },
    ".tpl-title": {
      display: "block",
      ...TYPOGRAPHY.sans.label,
      color: theme.vars.palette.text.primary,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },
    ".tpl-desc": {
      ...TYPOGRAPHY.sans.caption,
      color: theme.vars.palette.text.secondary,
      overflow: "hidden",
      textOverflow: "ellipsis",
      display: "-webkit-box",
      WebkitLineClamp: 2,
      WebkitBoxOrient: "vertical",
      whiteSpace: "normal"
    },
    ".tpl-copy": {
      display: "flex",
      flexDirection: "column",
      gap: getSpacingPx(SPACING.xs),
      flex: 1,
      minWidth: 0,
      width: "100%",
      padding: getSpacingPx(SPACING.md)
    },
    ".tpl-compat": {
      display: "grid",
      gap: getSpacingPx(SPACING.micro),
      paddingTop: getSpacingPx(SPACING.xs),
      ...TYPOGRAPHY.mono.caption,
      color: theme.vars.palette.text.disabled,
      "& .entry-compat": {
        display: "grid",
        gap: getSpacingPx(SPACING.micro)
      }
    },
    ".tpl-cat": {
      flexShrink: 0,
      display: "inline-flex",
      alignSelf: "flex-start",
      alignItems: "center",
      gap: getSpacingPx(SPACING.xs),
      ...TYPOGRAPHY.mono.caption,
      color: theme.vars.palette.text.disabled
    },
    ".tpl-loading, .tpl-empty": {
      display: "flex",
      justifyContent: "center",
      padding: `${getSpacingPx(SPACING.xxl)} 0`,
      color: theme.vars.palette.text.secondary
    }
  });

// In full-page (Examples tab) mode this section gets extra breathing room below
// the example apps. The manager content owns scrolling for the full page.
const fullPageStyles = css({
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
  metadata: Record<string, NodeMetadata>;
  isLoading: boolean;
  onClick: (workflow: Workflow) => void;
}

const formatTemplateCost = (estimate: WorkflowCostEstimateDetail, t: (key: string, options?: Record<string, unknown>) => string): string => {
  if (estimate.unknown_count === 0) {
    return t("pass3_17.templates.estimatedCost", { cost: formatUsd(estimate.total) });
  }

  const unknownNodes = t("pass3_17.templates.unknownPrices", { count: estimate.unknown_count });
  return estimate.total > 0
    ? t("pass3_17.templates.estimatedCostAtLeast", { cost: formatUsd(estimate.total), unknownNodes })
    : t("pass3_17.templates.estimatedCostUnknown", { unknownNodes });
};

const TemplateRow = memo(function TemplateRow({
  workflow,
  metadata,
  isLoading,
  onClick
}: TemplateRowProps) {
  const { t } = useTranslation();
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
  const compatibility = useMemo(
    () => getWorkflowCompatibility(workflow, metadata),
    [workflow, metadata]
  );
  const costEstimate = useMemo(
    () =>
      estimateGraphCost(workflow.graph.nodes, (nodeType) => metadata[nodeType]),
    [workflow.graph.nodes, metadata]
  );

  return (
    <Tooltip title={workflow.description || workflow.name} describeChild>
      <button
        type="button"
        className={isLoading ? "tpl-row loading" : "tpl-row"}
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
            <span className="tpl-glyph">{templateGlyph}</span>
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
        <span className="tpl-copy">
          <span className="tpl-title">{workflow.name}</span>
          <span className="tpl-desc">{workflow.description}</span>
          <ExampleNeedsPill needs={workflow.needs} />
          <span className="tpl-compat">
            <CompatibilityDetails compatibility={compatibility} />
            {workflow.graph.nodes.length > 0 && (
              <span>{formatTemplateCost(costEstimate, t)}</span>
            )}
          </span>
          {category && (
            <span className="tpl-cat">
              <span className="cat-dot" style={{ background: category.color }} />
              {category.label}
            </span>
          )}
        </span>
      </button>
    </Tooltip>
  );
});

interface DashboardTemplatesProps {
  /**
   * Render as the Examples page tab: show every example (no cap),
   * and drop the dashboard-only "Browse all"/"More…" links.
   */
  fullPage?: boolean;
}

const DashboardTemplates: React.FC<DashboardTemplatesProps> = ({
  fullPage = false
}) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const sectionWrap = useSectionWrap();
  const metadata = useMetadataStore((state) => state.metadata);
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

    const q = query.trim();
    const searched = q
      ? base.filter((w) =>
          matchesSearch(
            [w.name, w.description, ...(w.tags ?? [])].filter(Boolean).join(" "),
            q
          )
        )
      : base;

    // Examples that run as is come first. Getting-started picks lead within
    // each group when browsing everything unfiltered.
    return [...searched].sort((a, b) => {
      const ra = runsAsIs(a.needs) ? 0 : 1;
      const rb = runsAsIs(b.needs) ? 0 : 1;
      if (ra !== rb) return ra - rb;
      if (category === "all" && !q) {
        const ga = isGettingStarted(a) ? 0 : 1;
        const gb = isGettingStarted(b) ? 0 : 1;
        if (ga !== gb) return ga - gb;
      }
      return a.name.localeCompare(b.name);
    });
  }, [allTemplates, category, query]);

  // A search here also names the example apps that match, which the Apps tab
  // holds: in UX research study 12 every participant searched this tab and
  // none found the Model Arena or Vary Image app.
  const openExampleApp = useOpenExampleApp();
  const { data: exampleApps } = useQuery({
    queryKey: EXAMPLE_APPS_QUERY_KEY,
    queryFn: listExampleApps,
    staleTime: Infinity,
    enabled: query.trim() !== ""
  });
  const matchingApps = useMemo(() => {
    const q = query.trim();
    if (!q || !exampleApps) {
      return [];
    }
    return fewestNeedsFirst(
      exampleApps.filter((app) =>
        matchesSearch(`${app.name} ${app.description}`, q)
      ),
      (app) => app.needs
    );
  }, [exampleApps, query]);

  const visible = fullPage ? filtered : filtered.slice(0, MAX_VISIBLE);
  const countLabel = fullPage
    ? t("pass3_17.templates.exampleCount", { count: filtered.length })
    : visible.length === filtered.length
      ? `${filtered.length}`
      : t("pass3_17.templates.visibleCount", { visible: visible.length, total: filtered.length });

  return (
    <section
      id={DASHBOARD_TEMPLATES_SECTION_ID}
      css={fullPage ? [styles(theme), fullPageStyles] : styles(theme)}
    >
      <div css={sectionWrap}>
        <DashboardSectionHeader title={t("pass3_17.templates.sectionTitle")} count={countLabel}>
          <DashboardSearchBox
            ref={searchRef}
            value={query}
            onChange={setQuery}
            placeholder={t("pass3_17.templates.searchPlaceholder")}
            kbd="/"
            aria-label={t("pass3_17.templates.searchLabel")}
          />
          {!fullPage && (
            <SectionLink onClick={handleViewAllTemplates}>
              {t("pass3_17.templates.browseAll")}
            </SectionLink>
          )}
        </DashboardSectionHeader>

        <div className="cats" role="group" aria-label={t("pass3_17.templates.filterLabel")}>
          <Chip
            compact
            label={t("pass3_17.templates.allCategories")}
            active={category === "all"}
            onClick={() => setCategory("all")}
          />
          {TOP_CATEGORIES.map((cat) => {
            const active = category === cat.id;
            return (
              <Chip
                key={cat.id}
                compact
                label={t(`pass3_17.templates.categories.${cat.id}`, { defaultValue: cat.label })}
                icon={
                  <span className="cat-dot" style={{ background: cat.color }} />
                }
                active={active}
                accent={active ? cat.color : undefined}
                onClick={() => setCategory(cat.id)}
              />
            );
          })}
        </div>

        {matchingApps.length > 0 && (
          <FlexRow
            align="center"
            gap={GAP.tight}
            wrap
            role="group"
            aria-label={t("pass3_17.templates.matchingApps")}
            sx={{ paddingBottom: SPACING.md }}
          >
            <Caption color="secondary">
              {t("pass3_17.templates.matchingApps")}
            </Caption>
            {matchingApps.map((app) => (
              <Chip
                key={app.slug}
                compact
                label={app.name}
                onClick={() => openExampleApp(app)}
              />
            ))}
          </FlexRow>
        )}

        {isLoading ? (
          <div className="tpl-loading">
            <LoadingSpinner size="medium" text={t("pass3_17.templates.loading")} />
          </div>
        ) : isError ? (
          <div className="tpl-empty">
            <EmptyState
              variant="error"
              title={t("pass3_17.templates.loadErrorTitle")}
              description={t("pass3_17.common.tryAgain")}
              actionText={t("pass3_17.common.retry")}
              onAction={() => refetch()}
            />
          </div>
        ) : visible.length === 0 ? (
          <div className="tpl-empty">
            {query.trim() ? (
              <EmptyState
                variant="no-results"
                title={t("pass3_17.templates.noSearchResultsTitle")}
                description={t("pass3_17.templates.noSearchResultsDescription")}
                actionText={t("pass3_17.templates.clearSearch")}
                onAction={() => setQuery("")}
              />
            ) : category !== "all" ? (
              <EmptyState
                variant="no-results"
                title={t("pass3_17.templates.noCategoryResultsTitle")}
                actionText={t("pass3_17.templates.showAll")}
                onAction={() => setCategory("all")}
              />
            ) : (
              <EmptyState
                variant="no-data"
                title={t("pass3_17.templates.emptyTitle")}
                description={t("pass3_17.templates.emptyDescription")}
              />
            )}
          </div>
        ) : (
          <AutoGrid minItemWidth={220} className="tpl-list">
            {visible.map((workflow: Workflow) => (
              <TemplateRow
                key={workflow.id}
                workflow={workflow}
                metadata={metadata}
                isLoading={loadingExampleId === workflow.id}
                onClick={handleExampleClick}
              />
            ))}
          </AutoGrid>
        )}
      </div>
    </section>
  );
};

export default memo(DashboardTemplates);
