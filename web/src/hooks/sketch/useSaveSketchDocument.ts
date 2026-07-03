import { useCallback, useState } from "react";

import { saveSketchDocument } from "../../stores/sketch/SketchSessionStore";
import { useSketchInstance } from "../../stores/sketch/SketchInstance";
import { trpc } from "../../trpc/client";
import { useNotificationStore } from "../../stores/NotificationStore";

export function useSaveSketchDocument(): { save: () => Promise<void>; saving: boolean } {
  const utils = trpc.useUtils();
  const instance = useSketchInstance();
  const [saving, setSaving] = useState(false);

  const save = useCallback(async () => {
    const session = instance.session.getState();
    if (!session.documentId) {
      return;
    }
    setSaving(true);
    try {
      await saveSketchDocument(instance, (saved) => {
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
  }, [utils, instance]);

  // Only the manual save (button / Cmd+S) flips the button — background
  // autosave (session `saveState`) must not disable it or swap its label.
  return { save, saving };
}
