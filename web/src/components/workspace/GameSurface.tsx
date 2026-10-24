import type {
  WorkspaceTab,
  WorkspaceTabMode
} from "../../stores/WorkspaceTabsStore";
import GameEditor from "../game/GameEditor";
import { SavedGamePlayer } from "../game/GamePlayerPage";
import { WithDocumentBar, workspaceDocumentBar } from "./documentBarParts";

interface GameSurfaceProps {
  refId: string;
  active: boolean;
  mode: WorkspaceTabMode;
  /** The workspace tab, whose document bar tops the surface. */
  tab: WorkspaceTab;
}

/**
 * The editor draws the document bar in edit mode, with the transport row
 * under it. The player gets the bar with the title and View/Edit.
 */
export default function GameSurface({ refId, active, mode, tab }: GameSurfaceProps) {
  return mode === "view" ? (
    <WithDocumentBar tab={tab}>
      {/* The workspace titles the browser tab after the active tab. */}
      <SavedGamePlayer gameId={refId} active={active} setsDocumentTitle={false} />
    </WithDocumentBar>
  ) : (
    <GameEditor refId={refId} active={active} documentBar={workspaceDocumentBar(tab)} />
  );
}
