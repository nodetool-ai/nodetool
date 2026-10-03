import type { WorkspaceTabMode } from "../../stores/WorkspaceTabsStore";
import GameEditor from "../game/GameEditor";
import { SavedGamePlayer } from "../game/GamePlayerPage";

interface GameSurfaceProps {
  refId: string;
  active: boolean;
  mode: WorkspaceTabMode;
}

export default function GameSurface({ refId, active, mode }: GameSurfaceProps) {
  return mode === "view" ? (
    <SavedGamePlayer gameId={refId} active={active} />
  ) : (
    <GameEditor refId={refId} active={active} />
  );
}
