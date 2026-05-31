import { useCallback, useState } from "react";

import {
  saveCurrentSketchDocument,
  useSketchSessionStore
} from "../../stores/sketch/SketchSessionStore";
import { trpc } from "../../trpc/client";
import { useNotificationStore } from "../../stores/NotificationStore";

export function useSaveSketchDocument() {
  const utils = trpc.useUtils();
  const saveState = useSketchSessionStore((state) => state.saveState);
  const [saving, setSaving] = useState(false);

  const save = useCallback(async () => {
    const session = useSketchSessionStore.getState();
    if (!session.documentId) {
      return;
    }
    setSaving(true);
    try {
      await saveCurrentSketchDocument((saved) => {
        utils.sketch.get.setData({ id: saved.id }, saved);
      });
      useNotificationStore.getState().addNotification({
        content: "Sketch saved.",
        type: "success",
        alert: false,
        dedupeKey: `sketch-manual-save:${session.documentId}`,
        replaceExisting: true
      });
    } finally {
      setSaving(false);
    }
  }, [utils]);

  return { save, saving: saving || saveState === "saving" };
}
