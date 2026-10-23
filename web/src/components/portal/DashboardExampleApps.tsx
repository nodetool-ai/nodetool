/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { useTheme } from "@mui/material/styles";
import { memo, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { BASE_URL } from "../../stores/BASE_URL";
import { useOpenExampleApp } from "../../hooks/useOpenExampleApp";
import {
  listExampleApps,
  type ExampleAppSummary
} from "../../utils/exampleApps";
import { fewestNeedsFirst } from "../../utils/exampleNeeds";
import { matchesSearch } from "../../utils/matchesSearch";
import {
  AutoGrid,
  EditorButton,
  EmptyState,
  GAP,
  LoadingSpinner,
  SPACING,
  TYPOGRAPHY,
  getSpacingPx,
  selectableTileStyles,
  Tooltip
} from "../ui_primitives";
import {
  useSectionWrap,
  DashboardSectionHeader,
  DashboardSearchBox
} from "./dashboardChrome";
import ExampleNeedsPill from "./ExampleNeedsPill";

/** Query key for the shipped example apps, shared with any invalidation. */
export const EXAMPLE_APPS_QUERY_KEY = ["applications", "examples"] as const;

const styles = (theme: Theme, compact: boolean) =>
  css({
    paddingTop: compact ? 0 : getSpacingPx(SPACING.xxl),
    ".sec-title h2": compact ? TYPOGRAPHY.sans.body : {},
    ".apps-lede": {
      margin: `0 0 ${getSpacingPx(compact ? SPACING.sm : SPACING.xl)}`,
      ...TYPOGRAPHY.sans.caption,
      color: theme.vars.palette.text.secondary
    },
    ".apps-strip": {
      paddingBottom: getSpacingPx(compact ? SPACING.sm : SPACING.xxl)
    },
    ".app-card": {
      ...selectableTileStyles(theme),
      display: "flex",
      flexDirection: "column",
      textAlign: "left",
      padding: 0,
      background: theme.vars.palette.c_node_bg,
      color: theme.vars.palette.text.primary,
      cursor: "pointer",
      overflow: "hidden",
      minWidth: 0
    },
    ".app-thumb": {
      display: "grid",
      placeItems: "center",
      width: "100%",
      aspectRatio: "16 / 9",
      background: theme.vars.palette.c_node_bg_group,
      color: theme.vars.palette.primary.main,
      overflow: "hidden",
      img: {
        width: "100%",
        height: "100%",
        objectFit: "cover"
      }
    },
    ".app-body": {
      display: "flex",
      flexDirection: "column",
      gap: getSpacingPx(SPACING.xs),
      padding: getSpacingPx(SPACING.md)
    },
    ".app-name": {
      ...TYPOGRAPHY.sans.label,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },
    ".app-desc": {
      ...TYPOGRAPHY.sans.caption,
      color: theme.vars.palette.text.secondary,
      display: "-webkit-box",
      WebkitLineClamp: 2,
      WebkitBoxOrient: "vertical",
      overflow: "hidden"
    },
    ".app-meta": {
      ...TYPOGRAPHY.sans.caption,
      color: theme.vars.palette.text.disabled
    },
    ".apps-loading, .apps-empty": {
      display: "flex",
      justifyContent: "center",
      padding: `${getSpacingPx(SPACING.xl)} 0`,
      color: theme.vars.palette.text.secondary
    }
  });

/** Stand-in when an app's first workflow ships no gallery art. */
const appGlyph = (
  <svg
    width="28"
    height="28"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.2"
  >
    <rect x="2" y="2" width="12" height="12" rx="2" />
    <path d="M2 6h12M6 6v8" />
  </svg>
);

const thumbSrc = (url: string | null): string | null => {
  if (!url) return null;
  return url.startsWith("http") ? url : `${BASE_URL}${url}`;
};

interface ExampleAppCardProps {
  app: ExampleAppSummary;
  onUse: (app: ExampleAppSummary) => void;
}

const ExampleAppCard = memo(function ExampleAppCard({
  app,
  onUse
}: ExampleAppCardProps) {
  const { t } = useTranslation();
  const [thumbFailed, setThumbFailed] = useState(false);
  const src = thumbSrc(app.thumbnailUrl);
  const workflows = app.workflows.length;
  return (
    <Tooltip
      title={t("pass3_16.portal.apps.useApp", { name: app.name })}
      describeChild
    >
      <button type="button" className="app-card" onClick={() => onUse(app)}>
        <span className="app-thumb" aria-hidden>
          {src && !thumbFailed ? (
            <img
              src={src}
              alt=""
              loading="lazy"
              onError={() => setThumbFailed(true)}
            />
          ) : (
            appGlyph
          )}
        </span>
        <span className="app-body">
          <span className="app-name">{app.name}</span>
          <span className="app-desc">{app.description}</span>
          <ExampleNeedsPill needs={app.needs} />
          <span className="app-meta">
            {t("pass3_16.portal.apps.workflowCount", { count: workflows })}
          </span>
        </span>
      </button>
    </Tooltip>
  );
});

interface DashboardExampleAppsProps {
  /** Show a small entry-point selection instead of the full catalog. */
  compact?: boolean;
  onBrowseAll?: () => void;
}

/**
 * The shipped example apps. A card opens the app in its own tab, where the
 * user can make an editable copy.
 */
const DashboardExampleApps: React.FC<DashboardExampleAppsProps> = ({
  compact = false,
  onBrowseAll
}) => {
  const theme = useTheme();
  const { t } = useTranslation();
  const sectionWrap = useSectionWrap();
  const handleUse = useOpenExampleApp();
  const [query, setQuery] = useState("");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: EXAMPLE_APPS_QUERY_KEY,
    queryFn: listExampleApps,
    staleTime: Infinity
  });

  // Simplest first: fewest kinds of model, then fewest workflows. In study 12
  // a four-workflow kit that asks for a product photo led the tab and was
  // opened and left before the one-workflow Model Arena.
  const apps = useMemo(
    () =>
      fewestNeedsFirst(
        [...(data ?? [])].sort(
          (a, b) => a.workflows.length - b.workflows.length
        ),
        (app) => app.needs
      ),
    [data]
  );
  const matchingApps = useMemo(
    () =>
      apps.filter((app) =>
        matchesSearch(`${app.name} ${app.description}`, query)
      ),
    [apps, query]
  );
  const countLabel = t("pass3_16.portal.apps.count", {
    count: matchingApps.length
  });
  const visibleApps = compact ? apps.slice(0, 4) : matchingApps;

  return (
    <section
      css={styles(theme, compact)}
      aria-labelledby="dashboard-example-apps-title"
    >
      <div css={compact ? css({ maxWidth: "none", padding: 0 }) : sectionWrap}>
        <DashboardSectionHeader
          title={t("pass3_16.portal.apps.title")}
          count={countLabel}
        >
          {!compact && (
            <DashboardSearchBox
              value={query}
              onChange={setQuery}
              placeholder={t("pass3_16.portal.apps.searchPlaceholder")}
              aria-label={t("pass3_16.portal.apps.searchLabel")}
            />
          )}
          {compact && onBrowseAll && apps.length > visibleApps.length && (
            <EditorButton
              variant="text"
              density="compact"
              onClick={onBrowseAll}
            >
              {t("pass3_16.portal.apps.seeAll")}
            </EditorButton>
          )}
        </DashboardSectionHeader>
        <p className="apps-lede">{t("pass3_16.portal.apps.description")}</p>
        {isLoading ? (
          <div className="apps-loading">
            <LoadingSpinner
              size="medium"
              text={t("pass3_16.portal.apps.loading")}
            />
          </div>
        ) : isError ? (
          <div className="apps-empty">
            <EmptyState
              variant="error"
              title={t("pass3_16.portal.apps.loadErrorTitle")}
              description={t("pass3_16.portal.apps.loadErrorDescription")}
              actionText={t("pass3_16.portal.apps.retry")}
              onAction={() => refetch()}
            />
          </div>
        ) : apps.length === 0 ? (
          <div className="apps-empty">
            <EmptyState
              variant="no-data"
              title={t("pass3_16.portal.apps.emptyTitle")}
              description={t("pass3_16.portal.apps.emptyDescription")}
            />
          </div>
        ) : visibleApps.length === 0 ? (
          <div className="apps-empty">
            <EmptyState
              variant="no-results"
              title={t("pass3_16.portal.apps.noSearchResultsTitle")}
              actionText={t("pass3_16.portal.apps.clearSearch")}
              onAction={() => setQuery("")}
            />
          </div>
        ) : (
          <AutoGrid
            className="apps-strip"
            minItemWidth={compact ? 190 : 300}
            gap={compact ? GAP.comfortable : SPACING.xl}
          >
            {visibleApps.map((app) => (
              <ExampleAppCard key={app.slug} app={app} onUse={handleUse} />
            ))}
          </AutoGrid>
        )}
      </div>
    </section>
  );
};

export default memo(DashboardExampleApps);
