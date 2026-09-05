/**
 * Segmented picker that gives the right rails somewhere to live below `md`.
 *
 * The todo, task and memory rails have fixed widths, so on a phone they used
 * to drop out of the layout entirely and their content was unreachable. Here
 * they take the conversation's place one at a time.
 */
import { memo } from "react";

import { ToggleGroup, ToggleOption } from "../../ui_primitives";

export type MobileRail = "chat" | "todos" | "task" | "memory";

const RAIL_LABELS: Record<MobileRail, string> = {
  chat: "Chat",
  todos: "Tasks",
  task: "Task",
  memory: "Memory"
};

interface MobileRailTabsProps {
  value: MobileRail;
  /** Rails with something to show, in display order. Always starts with "chat". */
  available: readonly MobileRail[];
  onChange: (rail: MobileRail) => void;
}

const MobileRailTabs = ({ value, available, onChange }: MobileRailTabsProps) => (
  <ToggleGroup
    className="mobile-rail-tabs"
    value={value}
    exclusive
    segmented
    size="small"
    aria-label="Conversation panel"
    onChange={(_event, next: MobileRail | null) => {
      if (next !== null) {
        onChange(next);
      }
    }}
  >
    {available.map((rail) => (
      <ToggleOption key={rail} value={rail}>
        {RAIL_LABELS[rail]}
      </ToggleOption>
    ))}
  </ToggleGroup>
);

export default memo(MobileRailTabs);
