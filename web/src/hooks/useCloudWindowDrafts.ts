/**
 * In the desktop app's cloud window, runs the drafts driver for one open
 * document of a D26 kind (FR11). Does nothing in any other window.
 *
 * `makeEditor` and `subscribe` must be stable, such as module functions.
 */
import { useEffect } from "react";

import { CloudWindowDraftDriver, type DraftableEditor } from "../lib/cloud/cloudWindowDrafts";
import { CLOUD_WINDOW } from "../lib/cloud/cloudWindow";
import { SAVER_TICK_MS } from "../lib/cloud/CloudDocumentSaver";
import { desktopCloudLocalDraftsClient, LocalDraftStore, serverKeyOf } from "../lib/cloud/localDraftStore";

export const useCloudWindowDrafts = (
  documentId: string,
  makeEditor: (documentId: string) => DraftableEditor,
  subscribe: (listener: () => void) => () => void
): void => {
  useEffect(() => {
    const client = desktopCloudLocalDraftsClient();
    if (!CLOUD_WINDOW || !client) {
      return;
    }
    const origin = CLOUD_WINDOW;
    let driver: CloudWindowDraftDriver | null = null;
    let disposed = false;
    void serverKeyOf(origin.server).then((serverKey) => {
      if (!disposed) {
        driver = new CloudWindowDraftDriver(makeEditor(documentId), new LocalDraftStore(client), {
          serverKey,
          accountId: origin.account
        });
      }
    });
    const tick = (): void => {
      void driver?.tick(Date.now());
    };
    const timer = window.setInterval(tick, SAVER_TICK_MS);
    const unsubscribe = subscribe(tick);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      unsubscribe();
    };
  }, [documentId, makeEditor, subscribe]);
};
