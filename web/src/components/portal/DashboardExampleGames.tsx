/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme, type Theme } from "@mui/material/styles";
import { memo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { ExampleGameSummary } from "@nodetool-ai/protocol/game.js";
import {
  useExampleGames,
  useInstallExampleGame
} from "../../hooks/useExampleGames";
import { useNotificationStore } from "../../stores/NotificationStore";
import {
  creationProjectId,
  useWorkspaceTabsStore
} from "../../stores/WorkspaceTabsStore";
import useOnboardingStore from "../../stores/OnboardingStore";
import {
  AutoGrid,
  FlexRow,
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
  TYPOGRAPHY,
  getSpacingPx
} from "../ui_primitives";
import { NO_EXAMPLE_NEEDS } from "../../utils/exampleNeeds";
import { DashboardSectionHeader, useSectionWrap } from "./dashboardChrome";
import ExampleNeedsPill from "./ExampleNeedsPill";

const styles = (theme: Theme) =>
  css({
    paddingTop: getSpacingPx(SPACING.xxl),
    paddingBottom: getSpacingPx(SPACING.xxxl),
    ".game-card": {
      minWidth: 0,
      overflow: "hidden",
      border: `1px solid ${theme.vars.palette.divider}`,
      borderRadius: BORDER_RADIUS.md,
      background: theme.vars.palette.c_node_bg
    },
    ".game-poster": { background: theme.vars.palette.common.black }
  });

interface GameCardProps {
  game: ExampleGameSummary;
  installing: boolean;
  onPlay: (game: ExampleGameSummary) => void;
  onInstall: (game: ExampleGameSummary) => void;
}

const GameCard = memo(function GameCard({
  game,
  installing,
  onInstall,
  onPlay
}: GameCardProps) {
  const { t } = useTranslation();
  const handleClick = useCallback(() => onInstall(game), [game, onInstall]);
  return (
    <article className="game-card">
      <ResponsiveImage
        className="game-poster"
        locator={game.posterUri}
        alt={t("pass3_16.portal.games.gameplayImageAlt", { name: game.name })}
        aspectRatio="16/9"
        loading="lazy"
        showSkeleton
        preferThumbnail
      />
      <FlexColumn gap={SPACING.xs} padding={PADDING.normal}>
        <Text sx={TYPOGRAPHY.sans.label}>{game.name}</Text>
        <Caption size="smaller" color="secondary">
          {game.description}
        </Caption>
        <ExampleNeedsPill needs={NO_EXAMPLE_NEEDS} />
        <Caption size="smaller" color="muted">
          {game.controls}
        </Caption>
        <FlexRow gap={SPACING.sm}>
          <EditorButton
            density="compact"
            variant="contained"
            onClick={() => onPlay(game)}
          >
            {t("pass3_16.portal.games.play")}
          </EditorButton>
          <EditorButton
            variant="outlined"
            density="compact"
            disabled={installing}
            onClick={handleClick}
            sx={{ alignSelf: "flex-start" }}
          >
            {installing
              ? t("pass3_16.portal.games.adding")
              : t("pass3_16.portal.games.install")}
          </EditorButton>
        </FlexRow>
      </FlexColumn>
    </article>
  );
});

interface DashboardExampleGamesProps {
  /** Opens the Game guided flow. The home screen passes it, so a person
   *  looking for the game maker under Games finds it (study-6-I6). */
  onMakeGame?: () => void;
}

const DashboardExampleGames = ({ onMakeGame }: DashboardExampleGamesProps) => {
  const { t } = useTranslation();
  // The game opens full page in its own browser tab, so it gets the whole
  // window and keyboard focus instead of a small embed under the cards.
  const handlePlay = useCallback((game: ExampleGameSummary) => {
    window.open(
      `/game/example/${encodeURIComponent(game.slug)}`,
      "_blank",
      "noopener,noreferrer"
    );
    useOnboardingStore.getState().markStep("keep-creating");
  }, []);
  const theme = useTheme();
  const sectionWrap = useSectionWrap();
  const navigate = useNavigate();
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const { data, isLoading, isError, refetch } = useExampleGames();
  const install = useInstallExampleGame();

  const handleInstall = useCallback(
    (game: ExampleGameSummary) => {
      if (install.isPending) return;
      install.mutate(
        { slug: game.slug, projectId: creationProjectId() },
        {
          onSuccess: (created) => {
            openTab({
              type: "game",
              ref: created.game.id,
              mode: "view",
              title: created.game.name,
              projectId: created.game.projectId
            });
            navigate("/workspace");
            useOnboardingStore.getState().markStep("keep-creating");
          },
          onError: (error) => {
            addNotification({
              type: "error",
              alert: true,
              content: t("pass3_16.portal.games.installError", {
                name: game.name,
                message: error.message
              })
            });
          }
        }
      );
    },
    [addNotification, install, navigate, openTab, t]
  );

  const games = data ?? [];
  return (
    <section
      css={styles(theme)}
      aria-label={t("pass3_16.portal.games.ariaLabel")}
    >
      <div css={sectionWrap}>
        <DashboardSectionHeader
          title={t("pass3_16.portal.games.title")}
          count={t("pass3_16.portal.games.count", { count: games.length })}
        >
          {onMakeGame && (
            <EditorButton
              variant="contained"
              density="compact"
              onClick={onMakeGame}
            >
              {t("pass3_16.portal.games.makeGame")}
            </EditorButton>
          )}
        </DashboardSectionHeader>
        <Caption
          color="secondary"
          sx={{ marginBottom: getSpacingPx(SPACING.sm) }}
        >
          {t("pass3_16.portal.games.description")}
        </Caption>
        {isLoading ? (
          <FlexColumn align="center" padding={PADDING.spacious}>
            <LoadingSpinner
              size="medium"
              text={t("pass3_16.portal.games.loading")}
            />
          </FlexColumn>
        ) : isError ? (
          <EmptyState
            variant="error"
            title={t("pass3_16.portal.games.loadErrorTitle")}
            description={t("pass3_16.portal.games.loadErrorDescription")}
            actionText={t("pass3_16.portal.games.retry")}
            onAction={() => refetch()}
          />
        ) : games.length === 0 ? (
          <EmptyState
            variant="no-data"
            title={t("pass3_16.portal.games.emptyTitle")}
            description={t("pass3_16.portal.games.emptyDescription")}
            actionText={
              onMakeGame ? t("pass3_16.portal.games.makeGame") : undefined
            }
            onAction={onMakeGame}
          />
        ) : (
          <AutoGrid minItemWidth={360} fill="fit">
            {games.map((game) => (
              <GameCard
                key={game.slug}
                game={game}
                installing={
                  install.isPending && install.variables?.slug === game.slug
                }
                onInstall={handleInstall}
                onPlay={handlePlay}
              />
            ))}
          </AutoGrid>
        )}
      </div>
    </section>
  );
};

export default memo(DashboardExampleGames);
