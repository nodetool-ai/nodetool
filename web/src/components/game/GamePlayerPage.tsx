import { lazy, Suspense, useEffect, useRef, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import type { GameDocument } from "@nodetool-ai/protocol/game.js";

import { trpc } from "../../trpc/client";
import { Box, Caption, EditorButton, EmptyState, FlexColumn, FlexRow, LoadingSpinner, SPACING, Text } from "../ui_primitives";
import ErrorBanner from "../support/ErrorBanner";
import ReportBugButton from "../support/ReportBugButton";
import { useGamePlaySession } from "./useGamePlaySession";
import { gamePlayStatus } from "./gamePlayStatus";

interface GamePlayerProps {
  gameId: string;
  name: string;
  document: GameDocument;
  active?: boolean;
  /** False when the player is embedded in another page, such as a chat reply. */
  setsDocumentTitle?: boolean;
  /** Start the game as soon as the renderer is ready, for a Play button that opened the player. */
  autoPlay?: boolean;
}

export function GamePlayer({ gameId, name, document, active = true, setsDocumentTitle = true, autoPlay = false }: GamePlayerProps) {
  const { t, i18n } = useTranslation();
  const numberFormat = new Intl.NumberFormat(i18n.resolvedLanguage);
  const { canvasRef, inputRef, playing, playDocument, playState, backend, error,
    beginPlay, stop } = useGamePlaySession({ refId: gameId, active, document, name });
  const status = gamePlayStatus({
    won: playState.won,
    playing,
    paused: Boolean(playDocument),
    sceneName: document.scenes.find((scene) => scene.id === playState.sceneId)?.name,
    sceneCount: document.scenes.length,
    t
  });

  const autoPlayedRef = useRef(false);
  useEffect(() => {
    if (!autoPlay || autoPlayedRef.current || backend === "Initializing" || playDocument) return;
    autoPlayedRef.current = true;
    beginPlay();
  }, [autoPlay, backend, playDocument, beginPlay]);

  useEffect(() => {
    if (!setsDocumentTitle) return;
    const previousTitle = window.document.title;
    window.document.title = `${name} · NodeTool`;
    return () => { window.document.title = previousTitle; };
  }, [name, setsDocumentTitle]);

  const onKeyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
    if (playing && inputRef.current.handlesKey(document, event.code, event.key)) {
      inputRef.current.keyDown(event.code, event.key);
      event.preventDefault();
    }
  };

  return <FlexColumn gap={SPACING.sm} sx={{ height: "100%", minHeight: 0, p: SPACING.md }}>
    <FlexRow align="center" gap={SPACING.sm} wrap>
      <Text size="big">{name}</Text>
      <EditorButton onClick={beginPlay} disabled={backend === "Initializing"}>
        {playing ? t("screen_game.player.pause") : playDocument ? t("screen_game.player.resume") : t("screen_game.player.play")}
      </EditorButton>
      <EditorButton onClick={stop} disabled={!playDocument}>{t("screen_game.player.stop")}</EditorButton>
      <Caption>{t("screen_game.player.score", { score: numberFormat.format(playState.score) })} · {status} · {backend}</Caption>
    </FlexRow>
    {error && <ErrorBanner report={{ source: "panel-crash", summary: t("screen_game.player.failed"), errorText: error }}>{error}</ErrorBanner>}
    <Box sx={{ flex: 1, minHeight: 0, minWidth: 0, bgcolor: "common.black" }}>
      <Box component="canvas" ref={canvasRef} width={512} height={288} aria-label={t("screen_game.player.gameCanvas", { name })} tabIndex={0}
        onKeyDown={onKeyDown}
        onKeyUp={(event) => inputRef.current.keyUp(event.code)}
        onBlur={() => inputRef.current.release()}
        onPointerDown={() => canvasRef.current?.focus()}
        sx={{ width: "100%", height: "100%", objectFit: "contain" }} />
    </Box>
  </FlexColumn>;
}

const Player3D = lazy(() => import("./GamePlayer3D"));

export function SavedGamePlayer({ gameId, active = true, setsDocumentTitle = true }: { gameId: string; active?: boolean; setsDocumentTitle?: boolean }) {
  const { t } = useTranslation();
  const { data, isPending, error } = trpc.games.getDraft.useQuery({ id: gameId ?? "" },
    { enabled: Boolean(gameId), staleTime: 15_000 });
  if (!gameId) return <EmptyState variant="error" title={t("screen_game.player.notFound")} description={t("screen_game.player.incompleteLink")} />;
  if (isPending) return <LoadingSpinner text={t("screen_game.player.loadingGame")} />;
  if (error || !data) return <EmptyState variant="error" title={t("screen_game.player.loadFailed")} description={error?.message ?? t("screen_game.player.mayBeDeleted")} />;
  if (data.document.schemaVersion === 3) {
    return <Suspense fallback={<LoadingSpinner text={t("screen_game.player.loading3dPlayer")} />}><Player3D gameId={gameId} name={data.game.name} document={data.document} active={active} /></Suspense>;
  }
  return <GamePlayer gameId={gameId} name={data.game.name} document={data.document} active={active} setsDocumentTitle={setsDocumentTitle} />;
}

export default function GamePlayerPage() {
  const { gameId } = useParams<{ gameId: string }>();
  return <SavedGamePlayer gameId={gameId ?? ""} />;
}
