/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { useTheme } from "@mui/material/styles";
import { memo, useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { BASE_URL } from "../../stores/BASE_URL";
import {
  installExampleApp,
  listExampleApps,
  type ExampleAppSummary
} from "../../utils/exampleApps";
import {
  BORDER_RADIUS,
  EditorButton,
  EmptyState,
  LoadingSpinner,
  MOTION,
  SPACING,
  getSpacingPx
} from "../ui_primitives";
import { useSectionWrap, SectionHeader } from "./dashboardChrome";
import {
  CompatibilityDetails,
  getAppCompatibility
} from "./entryCompatibility";

/** Query key for the shipped example apps, shared with any invalidation. */
export const EXAMPLE_APPS_QUERY_KEY = ["applications", "examples"] as const;

const styles = (theme: Theme) =>
  css({
    paddingTop: getSpacingPx(SPACING.xxl),
    ".apps-lede": {
      margin: `0 0 ${getSpacingPx(SPACING.sm)}`,
      fontSize: "var(--fontSizeSmall)",
      color: theme.vars.palette.text.secondary
    },
    ".apps-strip": {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
      gap: getSpacingPx(SPACING.md),
      paddingBottom: getSpacingPx(SPACING.sm)
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
      transition: `border-color ${MOTION.fast}, background ${MOTION.fast}`,
      "&:hover": {
        borderColor: `rgba(${theme.vars.palette.primary.mainChannel} / 0.5)`,
        background: theme.vars.palette.action.hover
      },
      "&.installing": { cursor: "wait", pointerEvents: "none" }
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
      fontSize: "var(--fontSizeNormal)",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },
    ".app-desc": {
      fontSize: "var(--fontSizeSmaller)",
      color: theme.vars.palette.text.secondary,
      display: "-webkit-box",
      WebkitLineClamp: 2,
      WebkitBoxOrient: "vertical",
      overflow: "hidden"
    },
    ".app-compat": {
      display: "grid",
      gap: getSpacingPx(SPACING.micro),
      paddingTop: getSpacingPx(SPACING.xs),
      fontFamily: theme.fontFamily2,
      fontSize: "var(--fontSizeSmaller)",
      lineHeight: 1.4,
      color: theme.vars.palette.text.disabled,
      "& .entry-compat": {
        display: "grid",
        gap: getSpacingPx(SPACING.micro)
      }
    },
    ".app-meta": {
      fontFamily: theme.fontFamily2,
      fontSize: "var(--fontSizeSmaller)",
      color: theme.vars.palette.text.disabled
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
  installing: boolean;
  onInstall: (app: ExampleAppSummary) => void;
}

const ExampleAppCard = memo(function ExampleAppCard({
  app,
  installing,
  onInstall
}: ExampleAppCardProps) {
  const [thumbFailed, setThumbFailed] = useState(false);
  const src = thumbSrc(app.thumbnailUrl);
  const workflows = app.workflows.length;
  // The summary endpoint intentionally omits workflow graphs. Keep every
  // compatibility field explicit instead of deriving claims from the app's
  // name or workflow count.
  const compatibility = getAppCompatibility(
    { workflows: app.workflows.map(() => ({})) },
    {}
  );
  return (
    <button
      type="button"
      className={installing ? "app-card installing" : "app-card"}
      title={`Add ${app.name} to your apps`}
      aria-busy={installing}
      onClick={() => onInstall(app)}
    >
      <span className="app-thumb" aria-hidden>
        {installing ? (
          <LoadingSpinner size="medium" />
        ) : src && !thumbFailed ? (
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
        <span className="app-compat">
          <CompatibilityDetails compatibility={compatibility} />
          <span>
            Estimated cost: unknown — workflow graphs are not included in the
            app listing
          </span>
          <span>Duration: unknown — execution time is not declared</span>
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
 * The shipped example apps. Clicking one installs it (the app plus the
 * workflows it binds) and opens it.
 */
const DashboardExampleApps: React.FC<DashboardExampleAppsProps> = ({
  compact = false,
  onBrowseAll
}) => {
  const theme = useTheme();
  const sectionWrap = useSectionWrap();
  const queryClient = useQueryClient();
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: EXAMPLE_APPS_QUERY_KEY,
    queryFn: listExampleApps,
    staleTime: Infinity
  });

  const install = useMutation({
    mutationFn: (app: ExampleAppSummary) => installExampleApp(app.slug),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ["applications"] });
      await queryClient.invalidateQueries({ queryKey: ["workflows"] });
      openTab({
        type: "application",
        ref: created.id,
        mode: "view",
        title: created.name
      });
      addNotification({
        type: "success",
        alert: true,
        content: `Added "${created.name}" to your apps`
      });
    },
    onError: (error: unknown, app) => {
      addNotification({
        type: "error",
        alert: true,
        content: `Couldn't add ${app.name}: ${error instanceof Error ? error.message : "Unknown error"}`
      });
    }
  });

  const handleInstall = useCallback(
    (app: ExampleAppSummary) => {
      if (install.isPending) return;
      install.mutate(app);
    },
    [install]
  );

  const apps = data ?? [];
  const installingSlug = install.isPending ? install.variables?.slug : null;
  const countLabel = `${apps.length} app${apps.length === 1 ? "" : "s"}`;
  const visibleApps = compact ? apps.slice(0, 3) : apps;

  return (
    <section css={styles(theme)} aria-labelledby="dashboard-example-apps-title">
      <div css={sectionWrap}>
        <SectionHeader title="Start from an app" count={countLabel}>
          {compact && onBrowseAll && apps.length > visibleApps.length && (
            <EditorButton variant="text" density="compact" onClick={onBrowseAll}>
              See all apps
            </EditorButton>
          )}
        </SectionHeader>
        <p className="apps-lede">
          One upload, a few choices, one result. Adding an app also adds the
          workflows it runs, so you can open the graph behind any of them.
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
                installing={installingSlug === app.slug}
                onInstall={handleInstall}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default memo(DashboardExampleApps);
