/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme, type Theme } from "@mui/material/styles";
import { memo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { ExampleGameSummary } from "@nodetool-ai/protocol/game.js";
import { useExampleGames, useInstallExampleGame } from "../../hooks/useExampleGames";
import { useNotificationStore } from "../../stores/NotificationStore";
import { creationProjectId, useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import {
  BORDER_RADIUS,
  Caption,
  EditorButton,
  EmptyState,
  FlexColumn,
  LoadingSpinner,
  PADDING,
  ResponsiveImage,
  SPACING,
  Text,
  getSpacingPx
} from "../ui_primitives";
import { SectionHeader, useSectionWrap } from "./dashboardChrome";

const styles = (theme: Theme) => css({
  paddingTop: getSpacingPx(SPACING.xxl),
  paddingBottom: getSpacingPx(SPACING.xxxl),
  ".game-grid": {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))",
    gap: getSpacingPx(SPACING.md)
  },
  ".game-card": {
    minWidth: 0,
    overflow: "hidden",
    border: `1px solid ${theme.vars.palette.divider}`,
    borderRadius: BORDER_RADIUS.lg,
    background: theme.vars.palette.c_node_bg
  },
  ".game-poster": { background: theme.vars.palette.common.black }
});

interface GameCardProps {
  game: ExampleGameSummary;
  installing: boolean;
  onInstall: (game: ExampleGameSummary) => void;
}

const GameCard = memo(function GameCard({ game, installing, onInstall }: GameCardProps) {
  const handleClick = useCallback(() => onInstall(game), [game, onInstall]);
  return (
    <article className="game-card">
      <ResponsiveImage
        className="game-poster"
        locator={game.posterUri}
        alt={`${game.name} gameplay`}
        aspectRatio="16/9"
        loading="lazy"
      />
      <FlexColumn gap={SPACING.xs} padding={PADDING.normal}>
        <Text size="normal">{game.name}</Text>
        <Caption size="smaller" color="secondary">{game.description}</Caption>
        <Caption size="smaller" color="muted">{game.controls}</Caption>
        <EditorButton
          variant="contained"
          density="compact"
          disabled={installing}
          onClick={handleClick}
          sx={{ alignSelf: "flex-start", marginTop: getSpacingPx(SPACING.xs) }}
        >
          {installing ? "Adding game…" : "Play and edit"}
        </EditorButton>
      </FlexColumn>
    </article>
  );
});

const DashboardExampleGames = () => {
  const theme = useTheme();
  const sectionWrap = useSectionWrap();
  const navigate = useNavigate();
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const addNotification = useNotificationStore((state) => state.addNotification);
  const { data, isLoading, isError, refetch } = useExampleGames();
  const install = useInstallExampleGame();

  const handleInstall = useCallback((game: ExampleGameSummary) => {
    if (install.isPending) return;
    install.mutate({ slug: game.slug, projectId: creationProjectId() }, {
      onSuccess: (created) => {
        openTab({ type: "game", ref: created.game.id, title: created.game.name, projectId: created.game.projectId });
        navigate("/workspace");
      },
      onError: (error) => {
        addNotification({ type: "error", alert: true, content: `Couldn't add ${game.name}: ${error.message}` });
      }
    });
  }, [addNotification, install, navigate, openTab]);

  const games = data ?? [];
  return (
    <section css={styles(theme)} aria-label="Example games">
      <div css={sectionWrap}>
        <SectionHeader title="Start from a game" count={`${games.length} games`} />
        <Caption size="small" color="secondary" sx={{ marginBottom: getSpacingPx(SPACING.sm) }}>
          Each game runs in NodeTool&apos;s built-in engine. Open one to play it, then change its art, levels and rules.
        </Caption>
        {isLoading ? (
          <FlexColumn align="center" padding={PADDING.spacious}><LoadingSpinner size="medium" text="Loading games" /></FlexColumn>
        ) : isError ? (
          <EmptyState variant="error" title="Couldn't load games" description="Try again in a moment." actionText="Retry" onAction={() => refetch()} />
        ) : games.length === 0 ? (
          <EmptyState variant="no-data" title="No games available" description="Example games will appear here when this install ships them." />
        ) : (
          <div className="game-grid">
            {games.map((game) => (
              <GameCard key={game.slug} game={game} installing={install.isPending && install.variables?.slug === game.slug} onInstall={handleInstall} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default memo(DashboardExampleGames);
