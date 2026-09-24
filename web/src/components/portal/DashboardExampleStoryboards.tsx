/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme, type Theme } from "@mui/material/styles";
import AutoStoriesOutlinedIcon from "@mui/icons-material/AutoStoriesOutlined";
import { memo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { ExampleStoryboardSummary } from "@nodetool-ai/protocol/api-schemas/storyboards.js";
import { useExampleStoryboards, useInstallExampleStoryboard } from "../../hooks/storyboard/useStoryboards";
import { useNotificationStore } from "../../stores/NotificationStore";
import { BASE_URL } from "../../stores/BASE_URL";
import { creationProjectId, useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { BORDER_RADIUS, EmptyState, LoadingSpinner, MOTION, SPACING, getSpacingPx } from "../ui_primitives";
import { SectionHeader, useSectionWrap } from "./dashboardChrome";

const styles = (theme: Theme) =>
  css({
    paddingTop: getSpacingPx(SPACING.xxl),
    paddingBottom: getSpacingPx(SPACING.xxxl),
    ".boards-lede": {
      margin: `0 0 ${getSpacingPx(SPACING.sm)}`,
      fontSize: "var(--fontSizeSmall)",
      color: theme.vars.palette.text.secondary
    },
    ".boards-grid": {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))",
      gap: getSpacingPx(SPACING.md)
    },
    ".board-card": {
      display: "flex",
      flexDirection: "column",
      minWidth: 0,
      padding: 0,
      textAlign: "left",
      color: theme.vars.palette.text.primary,
      background: theme.vars.palette.c_node_bg,
      border: `1px solid ${theme.vars.palette.divider}`,
      borderRadius: BORDER_RADIUS.lg,
      overflow: "hidden",
      cursor: "pointer",
      transition: `border-color ${MOTION.fast}, background ${MOTION.fast}`,
      "&:hover": {
        borderColor: `rgba(${theme.vars.palette.primary.mainChannel} / 0.5)`,
        background: theme.vars.palette.action.hover
      },
      "&.installing": { cursor: "wait", pointerEvents: "none" }
    },
    ".board-hero": {
      display: "grid",
      placeItems: "center",
      width: "100%",
      aspectRatio: "16 / 9",
      background: theme.vars.palette.c_node_bg_group,
      color: theme.vars.palette.primary.main,
      overflow: "hidden"
    },
    ".board-hero img, .board-stills img": {
      width: "100%",
      height: "100%",
      objectFit: "cover"
    },
    ".board-stills": {
      display: "grid",
      gap: getSpacingPx(SPACING.micro),
      padding: getSpacingPx(SPACING.micro),
      background: theme.vars.palette.c_node_bg_group
    },
    ".board-stills img": {
      aspectRatio: "16 / 9"
    },
    ".board-body": {
      display: "flex",
      flexDirection: "column",
      gap: getSpacingPx(SPACING.xs),
      padding: getSpacingPx(SPACING.md)
    },
    ".board-name": { fontSize: "var(--fontSizeNormal)" },
    ".board-description": {
      display: "-webkit-box",
      WebkitLineClamp: 2,
      WebkitBoxOrient: "vertical",
      overflow: "hidden",
      fontSize: "var(--fontSizeSmaller)",
      color: theme.vars.palette.text.secondary
    },
    ".board-meta": {
      fontSize: "var(--fontSizeSmaller)",
      color: theme.vars.palette.text.disabled
    },
    ".boards-state": {
      display: "flex",
      justifyContent: "center",
      padding: `${getSpacingPx(SPACING.xl)} 0`
    }
  });

const imageSrc = (url: string): string =>
  url.startsWith("http") ? url : `${BASE_URL}${url}`;

interface StoryboardCardProps {
  storyboard: ExampleStoryboardSummary;
  installing: boolean;
  onInstall: (storyboard: ExampleStoryboardSummary) => void;
}

const StoryboardCard = memo(function StoryboardCard({
  storyboard,
  installing,
  onInstall
}: StoryboardCardProps) {
  const stills = storyboard.stillUrls;
  return (
    <button
      type="button"
      className={installing ? "board-card installing" : "board-card"}
      aria-busy={installing}
      title={`Add ${storyboard.name} to your storyboards`}
      onClick={() => onInstall(storyboard)}
    >
      <span className="board-hero" aria-hidden>
        {installing ? (
          <LoadingSpinner size="medium" />
        ) : storyboard.thumbnailUrl ? (
          <img src={imageSrc(storyboard.thumbnailUrl)} alt="" loading="lazy" />
        ) : (
          <AutoStoriesOutlinedIcon />
        )}
      </span>
      {stills.length > 1 && (
        <span
          className="board-stills"
          css={{ gridTemplateColumns: `repeat(${Math.min(stills.length - 1, 3)}, minmax(0, 1fr))` }}
          aria-hidden
        >
          {stills.slice(1, 4).map((url) => (
            <img key={url} src={imageSrc(url)} alt="" loading="lazy" />
          ))}
        </span>
      )}
      <span className="board-body">
        <span className="board-name">{storyboard.name}</span>
        <span className="board-description">{storyboard.description}</span>
        <span className="board-meta">
          {storyboard.shotCount} shot{storyboard.shotCount === 1 ? "" : "s"} · Stills included
        </span>
      </span>
    </button>
  );
});

const DashboardExampleStoryboards = () => {
  const theme = useTheme();
  const sectionWrap = useSectionWrap();
  const navigate = useNavigate();
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const addNotification = useNotificationStore((state) => state.addNotification);
  const { data, isLoading, isError, refetch } = useExampleStoryboards();
  const install = useInstallExampleStoryboard();

  const handleInstall = useCallback(
    (storyboard: ExampleStoryboardSummary) => {
      if (install.isPending) return;
      install.mutate(
        { slug: storyboard.slug, projectId: creationProjectId() },
        {
          onSuccess: (created) => {
            openTab({
              type: "storyboard",
              ref: created.id,
              mode: "edit",
              title: created.name,
              projectId: created.projectId
            });
            navigate("/workspace");
          },
          onError: (error) => {
            addNotification({
              type: "error",
              alert: true,
              content: `Couldn't add ${storyboard.name}: ${error.message}`
            });
          }
        }
      );
    },
    [addNotification, install, navigate, openTab]
  );

  const storyboards = data ?? [];
  return (
    <section css={styles(theme)} aria-label="Example storyboards">
      <div css={sectionWrap}>
        <SectionHeader title="Start from a storyboard" count={`${storyboards.length} boards`} />
        <p className="boards-lede">
          Explore a shot sequence with rendered stills. Open a board to make your own copy.
        </p>
        {isLoading ? (
          <div className="boards-state"><LoadingSpinner size="medium" text="Loading storyboards" /></div>
        ) : isError ? (
          <div className="boards-state">
            <EmptyState variant="error" title="Couldn't load storyboards" description="Try again in a moment." actionText="Retry" onAction={() => refetch()} />
          </div>
        ) : storyboards.length === 0 ? (
          <div className="boards-state">
            <EmptyState variant="no-data" title="No storyboards available" description="Example storyboards will appear here when this install ships them." />
          </div>
        ) : (
          <div className="boards-grid">
            {storyboards.map((storyboard) => (
              <StoryboardCard
                key={storyboard.slug}
                storyboard={storyboard}
                installing={install.isPending && install.variables?.slug === storyboard.slug}
                onInstall={handleInstall}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default memo(DashboardExampleStoryboards);
