/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { alpha, type Theme } from "@mui/material/styles";
import { useTheme } from "@mui/material/styles";
import { memo, useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { BASE_URL } from "../../stores/BASE_URL";
import {
  listExampleApps,
  type ExampleAppSummary
} from "../../utils/exampleApps";
import {
  BORDER_RADIUS,
  EditorButton,
  EmptyState,
  GAP,
  LoadingSpinner,
  MOTION,
  SPACING,
  getSpacingPx
} from "../ui_primitives";
import { useSectionWrap, SectionHeader } from "./dashboardChrome";

/** Query key for the shipped example apps, shared with any invalidation. */
export const EXAMPLE_APPS_QUERY_KEY = ["applications", "examples"] as const;

const styles = (theme: Theme, compact: boolean) =>
  css({
    paddingTop: compact ? 0 : getSpacingPx(SPACING.xxl),
    ".sec-title h2": compact ? { fontSize: "var(--fontSizeNormal)" } : {},
    ".apps-lede": {
      margin: `0 0 ${getSpacingPx(compact ? SPACING.sm : SPACING.xl)}`,
      fontSize: "var(--fontSizeSmall)",
      color: theme.vars.palette.text.secondary
    },
    ".apps-strip": {
      display: "grid",
      gridTemplateColumns: compact
        ? "repeat(auto-fill, minmax(min(100%, 190px), 1fr))"
        : "repeat(auto-fill, minmax(min(100%, 300px), 1fr))",
      gap: getSpacingPx(compact ? GAP.comfortable : SPACING.xl),
      paddingBottom: getSpacingPx(compact ? SPACING.sm : SPACING.xxl)
    },
    ".app-card": {
      display: "flex",
      flexDirection: "column",
      textAlign: "left",
      padding: 0,
      background: theme.vars.palette.c_node_bg,
      border: `1px solid ${theme.vars.palette.divider}`,
      borderRadius: BORDER_RADIUS.lg,
      color: theme.vars.palette.text.primary,
      cursor: "pointer",
      overflow: "hidden",
      minWidth: 0,
      ...(compact && { position: "relative", aspectRatio: "16 / 9" }),
      transition: `border-color ${MOTION.fast}, background ${MOTION.fast}`,
      "&:hover": {
        borderColor: `rgba(${theme.vars.palette.primary.mainChannel} / 0.5)`,
        background: theme.vars.palette.action.hover
      }
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
        background: `linear-gradient(to top, ${alpha(theme.palette.common.black, 0.82)}, ${alpha(theme.palette.common.black, 0)})`
      })
    },
    ".app-name": {
      fontSize: "var(--fontSizeNormal)",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      ...(compact && { color: "inherit" })
    },
    ".app-desc": {
      fontSize: "var(--fontSizeSmaller)",
      color: compact ? "inherit" : theme.vars.palette.text.secondary,
      display: "-webkit-box",
      WebkitLineClamp: compact ? 1 : 2,
      WebkitBoxOrient: "vertical",
      overflow: "hidden"
    },
    ".app-meta": {
      fontFamily: theme.fontFamily2,
      fontSize: "var(--fontSizeSmaller)",
      color: theme.vars.palette.text.disabled,
      ...(compact && { display: "none" })
    },
    ".apps-loading, .apps-empty": {
      display: "flex",
      justifyContent: "center",
      padding: `${getSpacingPx(SPACING.xl)} 0`,
      color: theme.vars.palette.text.secondary,
      fontSize: "var(--fontSizeNormal)"
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
    <button
      type="button"
      className="app-card"
      title={`Use ${app.name}`}
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
        <span className="app-meta">
          {workflows} workflow{workflows === 1 ? "" : "s"}
        </span>
      </span>
    </button>
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
    (app: ExampleAppSummary) =>
      openTab({
        type: "example-app",
        ref: app.slug,
        mode: "view",
        title: app.name
      }),
    [openTab]
  );

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: EXAMPLE_APPS_QUERY_KEY,
    queryFn: listExampleApps,
    staleTime: Infinity
  });

  const apps = data ?? [];
  const countLabel = `${apps.length} app${apps.length === 1 ? "" : "s"}`;
  const visibleApps = compact ? apps.slice(0, 4) : apps;

  return (
    <section
      css={styles(theme, compact)}
      aria-labelledby="dashboard-example-apps-title"
    >
      <div css={compact ? css({ maxWidth: "none", padding: 0 }) : sectionWrap}>
        <SectionHeader title="Start from an app" count={countLabel}>
          {compact && onBrowseAll && apps.length > visibleApps.length && (
            <EditorButton
              variant="text"
              density="compact"
              onClick={onBrowseAll}
            >
              See all apps
            </EditorButton>
          )}
        </SectionHeader>
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
          <div className="apps-strip">
            {visibleApps.map((app) => (
              <ExampleAppCard
                key={app.slug}
                app={app}
                onUse={handleUse}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default memo(DashboardExampleApps);
