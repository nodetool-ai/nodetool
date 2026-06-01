import { useCallback, useState } from "react";

import {
  saveSketchDocument,
  useSketchSessionStore
} from "../../stores/sketch/SketchSessionStore";
import { useSketchInstance } from "../../stores/sketch/SketchInstance";
import { trpc } from "../../trpc/client";
import { useNotificationStore } from "../../stores/NotificationStore";

export function useSaveSketchDocument() {
  const utils = trpc.useUtils();
  const instance = useSketchInstance();
  const saveState = useSketchSessionStore((state) => state.saveState);
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

  return { save, saving: saving || saveState === "saving" };
}
