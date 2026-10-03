import { lazy, Suspense, useEffect, type KeyboardEvent } from "react";
import { useParams } from "react-router-dom";
import type { GameDocument } from "@nodetool-ai/protocol/game.js";

import { trpc } from "../../trpc/client";
import { Box, Caption, EditorButton, EmptyState, FlexColumn, FlexRow, LoadingSpinner, SPACING, Text } from "../ui_primitives";
import ReportBugButton from "../support/ReportBugButton";
import { pressGameKey } from "./gameInputFrame";
import { useGamePlaySession } from "./useGamePlaySession";

interface GamePlayerProps {
  gameId: string;
  name: string;
  document: GameDocument;
  active?: boolean;
}

export function GamePlayer({ gameId, name, document, active = true }: GamePlayerProps) {
  const { canvasRef, keysRef, newlyPressedRef, playing, playDocument, playState, backend, error,
    beginPlay, stop } = useGamePlaySession({ refId: gameId, active, document, name });
  const status = playState.won ? "Won" : playing ? "Playing" : playDocument ? "Paused" : "Ready";

  useEffect(() => {
    const previousTitle = window.document.title;
    window.document.title = `${name} · NodeTool`;
    return () => { window.document.title = previousTitle; };
  }, [name]);

  const onKeyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
    if (playing && pressGameKey(keysRef.current, newlyPressedRef.current, event.code, event.key, document.inputActions)) {
      event.preventDefault();
    }
  };

  return <FlexColumn gap={SPACING.sm} sx={{ height: "100%", minHeight: 0, p: SPACING.md }}>
    <FlexRow align="center" gap={SPACING.sm} wrap>
      <Text size="big">{name}</Text>
      <EditorButton onClick={beginPlay} disabled={backend === "Initializing"}>
        {playing ? "Pause" : playDocument ? "Resume" : "Play"}
      </EditorButton>
      <EditorButton onClick={stop} disabled={!playDocument}>Stop</EditorButton>
      <Caption>Score {playState.score} · {status} · {backend}</Caption>
    </FlexRow>
    {error && <FlexRow align="center" gap={SPACING.sm}>
      <Caption color="error" role="alert">{error}</Caption>
      <ReportBugButton context={{ source: "panel-crash", summary: "Game player failed", errorText: error }} />
    </FlexRow>}
    <Box sx={{ flex: 1, minHeight: 0, minWidth: 0, bgcolor: "common.black" }}>
      <Box component="canvas" ref={canvasRef} width={512} height={288} aria-label={`${name} game`} tabIndex={0}
        onKeyDown={onKeyDown}
        onKeyUp={(event) => keysRef.current.delete(event.code)}
        onBlur={() => { keysRef.current.clear(); newlyPressedRef.current.clear(); }}
        onPointerDown={() => canvasRef.current?.focus()}
        sx={{ width: "100%", height: "100%", objectFit: "contain" }} />
    </Box>
  </FlexColumn>;
}

const Player3D = lazy(() => import("./GamePlayer3D"));

export function SavedGamePlayer({ gameId, active = true }: { gameId: string; active?: boolean }) {
  const { data, isPending, error } = trpc.games.getDraft.useQuery({ id: gameId ?? "" },
    { enabled: Boolean(gameId), staleTime: 15_000 });
  if (!gameId) return <EmptyState variant="error" title="Game not found" description="The game link is incomplete." />;
  if (isPending) return <LoadingSpinner text="Loading game" />;
  if (error || !data) return <EmptyState variant="error" title="Could not load game" description={error?.message ?? "The game may have been deleted."} />;
  if (data.document.schemaVersion === 3) {
    return <Suspense fallback={<LoadingSpinner text="Loading 3D player" />}><Player3D gameId={gameId} name={data.game.name} document={data.document} active={active} /></Suspense>;
  }
  return <GamePlayer gameId={gameId} name={data.game.name} document={data.document} active={active} />;
}

export default function GamePlayerPage() {
  const { gameId } = useParams<{ gameId: string }>();
  return <SavedGamePlayer gameId={gameId ?? ""} />;
}
