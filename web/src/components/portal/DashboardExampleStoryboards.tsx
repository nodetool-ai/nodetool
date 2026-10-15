/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme, type Theme } from "@mui/material/styles";
import AutoStoriesOutlinedIcon from "@mui/icons-material/AutoStoriesOutlined";
import { memo, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { ExampleStoryboardSummary } from "@nodetool-ai/protocol/api-schemas/storyboards.js";
import { useExampleStoryboards, useInstallExampleStoryboard } from "../../hooks/storyboard/useStoryboards";
import { useNotificationStore } from "../../stores/NotificationStore";
import { BASE_URL } from "../../stores/BASE_URL";
import { creationProjectId, useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import useOnboardingStore from "../../stores/OnboardingStore";
import {
  AutoGrid,
  EmptyState,
  LoadingSpinner,
  SPACING,
  TYPOGRAPHY,
  getSpacingPx,
  selectableTileStyles,
  Tooltip
} from "../ui_primitives";
import { runsAsIsFirst, storyboardNeeds } from "../../utils/exampleNeeds";
import { DashboardSectionHeader, useSectionWrap } from "./dashboardChrome";
import ExampleNeedsPill from "./ExampleNeedsPill";

const styles = (theme: Theme) =>
  css({
    paddingTop: getSpacingPx(SPACING.xxl),
    paddingBottom: getSpacingPx(SPACING.xxxl),
    ".boards-lede": {
      margin: `0 0 ${getSpacingPx(SPACING.sm)}`,
      ...TYPOGRAPHY.sans.caption,
      color: theme.vars.palette.text.secondary
    },
    ".board-card": {
      ...selectableTileStyles(theme),
      display: "flex",
      flexDirection: "column",
      minWidth: 0,
      padding: 0,
      textAlign: "left",
      color: theme.vars.palette.text.primary,
      background: theme.vars.palette.c_node_bg,
      overflow: "hidden",
      cursor: "pointer",
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
    ".board-name": TYPOGRAPHY.sans.label,
    ".board-description": {
      display: "-webkit-box",
      WebkitLineClamp: 2,
      WebkitBoxOrient: "vertical",
      overflow: "hidden",
      ...TYPOGRAPHY.sans.caption,
      color: theme.vars.palette.text.secondary
    },
    ".board-meta": {
      ...TYPOGRAPHY.sans.caption,
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
    <Tooltip title={`Add ${storyboard.name} to your storyboards`} describeChild>
      <button
        type="button"
        className={installing ? "board-card installing" : "board-card"}
        aria-busy={installing}
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
          <ExampleNeedsPill needs={storyboardNeeds(storyboard)} />
          <span className="board-meta">
            {storyboard.shotCount} shot{storyboard.shotCount === 1 ? "" : "s"} · Stills included
          </span>
        </span>
      </button>
    </Tooltip>
  );
});

const DashboardExampleStoryboards = () => {
  const theme = useTheme();
  const sectionWrap = useSectionWrap();
  const navigate = useNavigate();
  const openTab = useWorkspaceTabsStore((state) => state.openForegroundTab);
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
            useOnboardingStore.getState().markStep("keep-creating");
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

  const storyboards = useMemo(
    () => runsAsIsFirst(data ?? [], storyboardNeeds),
    [data]
  );
  return (
    <section css={styles(theme)} aria-label="Example storyboards">
      <div css={sectionWrap}>
        <DashboardSectionHeader title="Start from a storyboard" count={`${storyboards.length} boards`} />
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
          <AutoGrid minItemWidth={280} fill="fit">
            {storyboards.map((storyboard) => (
              <StoryboardCard
                key={storyboard.slug}
                storyboard={storyboard}
                installing={install.isPending && install.variables?.slug === storyboard.slug}
                onInstall={handleInstall}
              />
            ))}
          </AutoGrid>
        )}
      </div>
    </section>
  );
};

export default memo(DashboardExampleStoryboards);
