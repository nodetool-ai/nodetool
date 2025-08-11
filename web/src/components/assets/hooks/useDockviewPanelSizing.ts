import { useCallback } from "react";
import type { DockviewApi } from "dockview";

interface EnsurePanelWidthOptions {
  scheduleWithRaf?: boolean;
}

export function useDockviewPanelSizing() {
  const ensurePanelWidth = useCallback(
    (
      api: DockviewApi,
      panelId: string,
      width: number,
      options: EnsurePanelWidthOptions = { scheduleWithRaf: true }
    ) => {
      const applyWidth = () => {
        const panel = api.getPanel(panelId);
        const groupApi: unknown =
          (panel as any)?.group?.api ?? (panel as any)?.group;
        if (groupApi && typeof (groupApi as any).setSize === "function") {
          (groupApi as any).setSize({ width });
          return;
        }
        if (panel && typeof (panel as any).setSize === "function") {
          (panel as any).setSize({ width });
        }
      };

      if (
        options.scheduleWithRaf &&
        typeof window !== "undefined" &&
        "requestAnimationFrame" in window
      ) {
        window.requestAnimationFrame(applyWidth);
      } else {
        applyWidth();
      }
    },
    []
  );

  return { ensurePanelWidth };
}

export default useDockviewPanelSizing;
