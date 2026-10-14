import { useEffect, useRef } from "react";
import type { GameDocument3D } from "@nodetool-ai/protocol";
import { Caption, EditorButton, FlexColumn, FlexRow, SPACING, Text } from "../ui_primitives";
import ReportBugButton from "../support/ReportBugButton";
import GameViewport3D from "./viewport3d/GameViewport3D";
import { useGamePlaySession3D } from "./useGamePlaySession3D";
import { gamePlayStatus } from "./gamePlayStatus";

interface GamePlayer3DProps { readonly gameId: string; readonly name: string; readonly document: GameDocument3D; readonly active?: boolean;
  /** Start the game as soon as the renderer is ready, for a Play button that opened the player. */
  readonly autoPlay?: boolean; }

export default function GamePlayer3D({ gameId, name, document, active = true, autoPlay = false }: GamePlayer3DProps) {
  const host = useGamePlaySession3D({ refId: gameId, document, active });
  const status = gamePlayStatus({
    won: Boolean(host.inspection?.won),
    playing: host.playing,
    paused: Boolean(host.playDocument),
    sceneName: document.scenes.find((scene) => scene.id === host.inspection?.sceneId)?.name,
    sceneCount: document.scenes.length
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
      <EditorButton onClick={host.beginPlay} disabled={host.backend === "Initializing"}>{host.playing ? "Pause" : host.playDocument ? "Resume" : "Play"}</EditorButton>
      <EditorButton onClick={host.stop} disabled={!host.playDocument}>Stop</EditorButton>
      <Caption>Score {host.inspection?.score ?? 0} · {status} · {host.backend}</Caption>
    </FlexRow>
    {host.error && <FlexRow gap={SPACING.xs}><Caption color="error" role="alert">{host.error}</Caption>
      <ReportBugButton context={{ source: "panel-crash", summary: "3D game player failed", errorText: host.error,
        nodeDetail: `Game: ${gameId}\nScene: ${host.inspection?.sceneId ?? document.entrySceneId}\nTick: ${host.inspection?.tick ?? 0}` }} /></FlexRow>}
    <GameViewport3D document={document} host={host} sceneId={document.entrySceneId} playerOnly />
  </FlexColumn>;
}
