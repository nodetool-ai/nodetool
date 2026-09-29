/**
 * useGuardedPanelTab
 *
 * `TimelineUIStore.setPanelTab` is a pure setter — it does not know how to
 * ask the user anything. Leaving a dirty Code tab needs confirmation first,
 * so that guard lives here, at the component layer, backed by the
 * design-system `ConfirmDialog` instead of `window.confirm`.
 *
 * One instance of this hook should back every tab switcher in a timeline
 * editor (the desktop `InspectorRegion` tab group and the phone
 * `MobilePanelSheet`) so a dirty-code switch shows exactly one dialog no
 * matter which switcher triggered it.
 */

import React, { useCallback, useState } from "react";
import { ConfirmDialog } from "../../components/ui_primitives";
import {
  useTimelineUIStore,
  type TimelineUIState
} from "../../stores/timeline/TimelineUIStore";

type PanelTab = TimelineUIState["panelTab"];

export interface UseGuardedPanelTabResult {
  panelTab: PanelTab;
  /** Switch tabs, confirming first when leaving a dirty Code tab. */
  setPanelTab: (tab: PanelTab) => void;
  /** Render once, anywhere in the editor's tree. */
  confirmDialog: React.ReactNode;
}

export const useGuardedPanelTab = (): UseGuardedPanelTabResult => {
  const panelTab = useTimelineUIStore((s) => s.panelTab);
  const codePanelDirty = useTimelineUIStore((s) => s.codePanelDirty);
  const setPanelTabRaw = useTimelineUIStore((s) => s.setPanelTab);
  const [pendingTab, setPendingTab] = useState<PanelTab | null>(null);

  const setPanelTab = useCallback(
    (tab: PanelTab) => {
      const leavingDirtyCode =
        panelTab === "code" && tab !== "code" && codePanelDirty;
      if (leavingDirtyCode) {
        setPendingTab(tab);
        return;
      }
      setPanelTabRaw(tab);
    },
    [panelTab, codePanelDirty, setPanelTabRaw]
  );

  const handleCancel = useCallback(() => setPendingTab(null), []);

  const handleConfirm = useCallback(() => {
    if (pendingTab !== null) setPanelTabRaw(pendingTab);
    setPendingTab(null);
  }, [pendingTab, setPanelTabRaw]);

  const confirmDialog = (
    <ConfirmDialog
      open={pendingTab !== null}
      onClose={handleCancel}
      onConfirm={handleConfirm}
      title="Unsaved code changes"
      content="You have unsaved code changes. Leave without baking them?"
      confirmText="Leave"
      cancelText="Cancel"
    />
  );

  return { panelTab, setPanelTab, confirmDialog };
};

export default useGuardedPanelTab;
