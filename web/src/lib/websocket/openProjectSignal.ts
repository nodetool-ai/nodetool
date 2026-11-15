/**
 * Tells the server which project this client has open.
 *
 * The server watches the folder of an open project, so that a file another
 * app saves there shows up within seconds. It stops watching when no client
 * has the project open. The signal is the `set_open_project` command on the
 * shared socket: one project per connection, replaced by the next command and
 * dropped by the server when the connection closes.
 *
 * The signal never opens the socket. It is sent when the socket opens, for
 * whatever reason, and again whenever the active project changes while it is
 * open.
 */
import { globalWebSocketManager } from "./GlobalWebSocketManager";
import {
  LOOSE_PROJECT_ID,
  useWorkspaceTabsStore
} from "../../stores/WorkspaceTabsStore";

/** The project on screen. No active project is the loose bucket, Personal. */
const openProjectId = (): string =>
  useWorkspaceTabsStore.getState().activeProjectId ?? LOOSE_PROJECT_ID;

const sendOpenProject = (): void => {
  if (!globalWebSocketManager.isConnectionOpen()) {
    return;
  }
  globalWebSocketManager
    .send({
      type: "set_open_project",
      command: "set_open_project",
      data: { project_id: openProjectId() }
    })
    .catch((error: unknown) => {
      // The next socket open sends the signal again.
      console.debug("openProjectSignal: send failed", error);
    });
};

/**
 * Start sending the open-project signal. Returns a function that stops it.
 * Call once at application start.
 */
export const startOpenProjectSignal = (): (() => void) => {
  const offOpen = globalWebSocketManager.subscribeEvent("open", sendOpenProject);
  const offStore = useWorkspaceTabsStore.subscribe((state, previous) => {
    if (state.activeProjectId !== previous.activeProjectId) {
      sendOpenProject();
    }
  });
  sendOpenProject();
  return () => {
    offOpen();
    offStore();
  };
};
