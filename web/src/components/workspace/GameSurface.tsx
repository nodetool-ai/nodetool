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
    // The workspace titles the browser tab after the active tab.
    <SavedGamePlayer gameId={refId} active={active} setsDocumentTitle={false} />
  ) : (
    <GameEditor refId={refId} active={active} />
  );
}
