import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { GameDocument3D } from "@nodetool-ai/protocol";
import { Caption, EditorButton, FlexColumn, FlexRow, SPACING, Text } from "../ui_primitives";
import ErrorBanner from "../support/ErrorBanner";
import GameViewport3D from "./viewport3d/GameViewport3D";
import { useGamePlaySession3D } from "./useGamePlaySession3D";
import { gamePlayStatus } from "./gamePlayStatus";

interface GamePlayer3DProps { readonly gameId: string; readonly name: string; readonly document: GameDocument3D; readonly active?: boolean;
  /** Start the game as soon as the renderer is ready, for a Play button that opened the player. */
  readonly autoPlay?: boolean; }

export default function GamePlayer3D({ gameId, name, document, active = true, autoPlay = false }: GamePlayer3DProps) {
  const { t, i18n } = useTranslation();
  const numberFormat = new Intl.NumberFormat(i18n.resolvedLanguage);
  const host = useGamePlaySession3D({ refId: gameId, document, active });
  const status = gamePlayStatus({
    won: Boolean(host.inspection?.won),
    playing: host.playing,
    paused: Boolean(host.playDocument),
    sceneName: document.scenes.find((scene) => scene.id === host.inspection?.sceneId)?.name,
    sceneCount: document.scenes.length,
    t
  });
  const { backend, playDocument, beginPlay } = host;
  const autoPlayedRef = useRef(false);
  useEffect(() => {
    if (!autoPlay || autoPlayedRef.current || backend === "Initializing" || playDocument) return;
    autoPlayedRef.current = true;
    beginPlay();
  }, [autoPlay, backend, playDocument, beginPlay]);
  return <FlexColumn gap={SPACING.sm} sx={{ height: "100%", minHeight: 0, p: SPACING.md }}>
    <FlexRow gap={SPACING.sm} align="center" wrap>
      <Text size="big">{name}</Text>
      <EditorButton onClick={host.beginPlay} disabled={host.backend === "Initializing"}>{host.playing ? t("screen_game.player.pause") : host.playDocument ? t("screen_game.player.resume") : t("screen_game.player.play")}</EditorButton>
      <EditorButton onClick={host.stop} disabled={!host.playDocument}>{t("screen_game.player.stop")}</EditorButton>
      <Caption>{t("screen_game.player.score", { score: numberFormat.format(host.inspection?.score ?? 0) })} · {status} · {host.backend}</Caption>
    </FlexRow>
    {host.error && <ErrorBanner report={{ source: "panel-crash", summary: t("screen_game.player.failed3d"), errorText: host.error,
      nodeDetail: `${t("screen_game.player.gameDetail", { id: gameId })}\n${t("screen_game.player.sceneDetail", { scene: host.inspection?.sceneId ?? document.entrySceneId })}\n${t("screen_game.player.tickDetail", { tick: host.inspection?.tick ?? 0 })}` }}>
      {host.error}
    </ErrorBanner>}
    <GameViewport3D document={document} host={host} sceneId={document.entrySceneId} playerOnly />
  </FlexColumn>;
}
