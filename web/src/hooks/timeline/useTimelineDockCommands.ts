import { useMemo } from "react";
import { useStore, type StoreApi } from "zustand";

import { useSettingsStore } from "../../stores/SettingsStore";
import type { ContextCommand } from "../../stores/CommandMenuStore";
import type { DockLayoutState } from "../../stores/dock/DockLayoutStore";
import { TIMELINE_WORKSPACES } from "../../stores/timeline/TimelineDockLayout";
import { useTimelineIsActive } from "../../stores/timeline/TimelineInstance";
import type { TimelineDockController } from "../../components/timeline/dock/timelineDockController";
import { timelinePanelRegistrations } from "../../components/timeline/dock/timelinePanels";
import { formatActionShortcut, type TimelineAction } from "../../components/timeline/timelineKeymap";
import { useContextCommands } from "../useContextCommands";

/** The actions that switch workspace, in the order of the built-in workspaces. */
export const TIMELINE_WORKSPACE_ACTIONS: readonly TimelineAction[] = ["workspace1", "workspace2", "workspace3", "workspace4"];

/** The keymap actions these commands replace, so the key replay list in the command menu skips them. */
export const TIMELINE_DOCK_ACTIONS: ReadonlySet<TimelineAction> = new Set<TimelineAction>([
  "maximizePanel", "toggleProgramFullscreen", "resetWorkspace", ...TIMELINE_WORKSPACE_ACTIONS
]);

/**
 * The command menu entries for the timeline's dock: open or focus each panel by
 * name, maximize the focused group, full screen, reset, and switch workspace.
 * Pass a null `controller` where the editor has no dock (phones): nothing is listed.
 */
export function useTimelineDockCommands(
  controller: TimelineDockController | null,
  store: StoreApi<DockLayoutState>
): void {
  const active = useTimelineIsActive();
  const preset = useSettingsStore((state) => state.settings.timelineKeyboardPreset);
  const savedLayouts = useStore(store, (state) => state.customLayouts);

  const commands = useMemo<ContextCommand[]>(() => {
    if (!controller) { return []; }
    const key = (action: TimelineAction): string | undefined => formatActionShortcut(preset, action) ?? undefined;
    const list: ContextCommand[] = [];
    for (const panel of timelinePanelRegistrations(false)) {
      list.push({
        id: `dock.open.${panel.id}`,
        label: `Open ${panel.title}`,
        keywords: ["panel", "window", "focus", "show", panel.id],
        run: () => { controller.openPanel(panel.id); }
      });
    }
    list.push(
      { id: "dock.maximize", label: "Maximize or restore panel group", keywords: ["panel", "frame", "full"], shortcut: key("maximizePanel"),
        run: controller.toggleMaximize },
      { id: "dock.fullscreen", label: "Program monitor full screen", keywords: ["preview", "fullscreen"], shortcut: key("toggleProgramFullscreen"),
        run: controller.toggleProgramFullscreen },
      { id: "dock.reset", label: "Reset workspace", keywords: ["layout", "saved"], shortcut: key("resetWorkspace"),
        run: controller.resetWorkspace }
    );
    TIMELINE_WORKSPACES.forEach((name, index) => {
      list.push({
        id: `dock.workspace.${index}`, label: `Workspace: ${name}`, keywords: ["layout", "preset", "switch"],
        shortcut: key(TIMELINE_WORKSPACE_ACTIONS[index]), run: () => controller.switchWorkspace(index)
      });
    });
    for (const saved of savedLayouts) {
      list.push({
        id: `dock.saved.${saved.name}`, label: `Workspace: ${saved.name}`, keywords: ["layout", "saved", "switch"],
        run: () => { store.getState().selectLayout(saved.name); store.getState().setMaximizedGroup(null); }
      });
    }
    return list;
  }, [controller, preset, savedLayouts, store]);

  useContextCommands("Workspace", commands, active);
}
