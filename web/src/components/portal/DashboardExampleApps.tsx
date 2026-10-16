/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { useTheme } from "@mui/material/styles";
import { memo, useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import useOnboardingStore from "../../stores/OnboardingStore";
import { BASE_URL } from "../../stores/BASE_URL";
import {
  listExampleApps,
  type ExampleAppSummary
} from "../../utils/exampleApps";
import { runsAsIsFirst } from "../../utils/exampleNeeds";
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
import { useSectionWrap, DashboardSectionHeader } from "./dashboardChrome";
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
      minWidth: 0,
      ...(compact && { position: "relative", aspectRatio: "16 / 9" })
    },
    ".app-thumb": {
      position: "relative",
      display: "grid",
      placeItems: "center",
      width: "100%",
      aspectRatio: "16 / 9",
      background: theme.vars.palette.c_node_bg_group,
      color: theme.vars.palette.primary.main,
      overflow: "hidden",
      ...(compact && { position: "absolute", inset: 0, height: "100%" }),
      img: {
        width: "100%",
        height: "100%",
        objectFit: "cover"
      }
    },
    ".app-body": {
      display: "flex",
      flexDirection: "column",
      gap: getSpacingPx(compact ? SPACING.xs : SPACING.sm),
      padding: getSpacingPx(compact ? SPACING.md : SPACING.lg),
      ...(compact && {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        color: theme.vars.palette.common.white,
        background: `linear-gradient(to top, ${theme.vars.palette.c_scrim_strong}, transparent)`
      })
    },
    ".app-name": {
      ...TYPOGRAPHY.sans.label,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      ...(compact && { color: "inherit" })
    },
    ".app-desc": {
      ...TYPOGRAPHY.sans.caption,
      color: compact ? "inherit" : theme.vars.palette.text.secondary,
      display: "-webkit-box",
      WebkitLineClamp: compact ? 1 : 2,
      WebkitBoxOrient: "vertical",
      overflow: "hidden"
    },
    ".app-meta": {
      ...TYPOGRAPHY.mono.caption,
      color: theme.vars.palette.text.disabled,
      ...(compact && { display: "none" })
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
  const [thumbFailed, setThumbFailed] = useState(false);
  const src = thumbSrc(app.thumbnailUrl);
  const workflows = app.workflows.length;
  return (
    <Tooltip title={`Use ${app.name}`} describeChild>
      <button
        type="button"
        className="app-card"
        onClick={() => onUse(app)}
      >
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
            {workflows} workflow{workflows === 1 ? "" : "s"}
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
  const sectionWrap = useSectionWrap();
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const handleUse = useCallback(
    (app: ExampleAppSummary) => {
      openTab({
        type: "example-app",
        ref: app.slug,
        mode: "view",
        title: app.name
      });
      useOnboardingStore.getState().markStep("keep-creating");
    },
    [openTab]
  );

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: EXAMPLE_APPS_QUERY_KEY,
    queryFn: listExampleApps,
    staleTime: Infinity
  });

  const apps = useMemo(
    () => runsAsIsFirst(data ?? [], (app) => app.needs),
    [data]
  );
  const countLabel = `${apps.length} app${apps.length === 1 ? "" : "s"}`;
  const visibleApps = compact ? apps.slice(0, 4) : apps;

  return (
    <section
      css={styles(theme, compact)}
      aria-labelledby="dashboard-example-apps-title"
    >
      <div css={compact ? css({ maxWidth: "none", padding: 0 }) : sectionWrap}>
        <DashboardSectionHeader title="Start from an app" count={countLabel}>
          {compact && onBrowseAll && apps.length > visibleApps.length && (
            <EditorButton
              variant="text"
              density="compact"
              onClick={onBrowseAll}
            >
              See all apps
            </EditorButton>
          )}
        </DashboardSectionHeader>
        <p className="apps-lede">
          Open an app to use it, or edit a copy to customize its workflows.
        </p>
        {isLoading ? (
          <div className="apps-loading">
            <LoadingSpinner size="medium" text="Loading apps" />
          </div>
        ) : isError ? (
          <div className="apps-empty">
            <EmptyState
              variant="error"
              title="Couldn't load apps"
              description="Try again in a moment."
              actionText="Retry"
              onAction={() => refetch()}
            />
          </div>
        ) : apps.length === 0 ? (
          <div className="apps-empty">
            <EmptyState
              variant="no-data"
              title="No apps available"
              description="Example apps will appear here when the server ships them."
            />
          </div>
        ) : (
          <AutoGrid
            className="apps-strip"
            minItemWidth={compact ? 190 : 300}
            gap={compact ? GAP.comfortable : SPACING.xl}
          >
            {visibleApps.map((app) => (
              <ExampleAppCard
                key={app.slug}
                app={app}
                onUse={handleUse}
              />
            ))}
          </AutoGrid>
        )}
      </div>
    </section>
  );
};

export default memo(DashboardExampleApps);
