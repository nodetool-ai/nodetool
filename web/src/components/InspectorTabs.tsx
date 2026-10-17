import React, { useMemo } from "react";
import { TabGroup, type TabItem } from "./ui_primitives";

/** The tabs shown at the top of the Inspector panel. */
export type InspectorTab = "params" | "io" | "help";

const TAB_DEFS: { value: InspectorTab; label: string; hasCount: boolean }[] = [
  { value: "params", label: "Params", hasCount: true },
  { value: "io", label: "I/O", hasCount: true },
  { value: "help", label: "Help", hasCount: false }
];

const isInspectorTab = (value: string): value is InspectorTab =>
  TAB_DEFS.some((tab) => tab.value === value);

interface InspectorTabsProps {
  active: InspectorTab;
  onChange: (next: InspectorTab) => void;
  counts: Partial<Record<InspectorTab, number>>;
}

/** Presentational tab strip for the Inspector. */
export const InspectorTabs: React.FC<InspectorTabsProps> = ({
  active,
  onChange,
  counts
}) => {
  const tabs = useMemo<TabItem[]>(
    () =>
      TAB_DEFS.map((tab) => ({
        value: tab.value,
        label: tab.label,
        count: tab.hasCount ? counts[tab.value] : undefined
      })),
    [counts]
  );
  return (
    <TabGroup
      className="inspector-tabs"
      size="small"
      aria-label="Inspector sections"
      tabs={tabs}
      value={active}
      onChange={(next) => {
        if (isInspectorTab(next)) {
          onChange(next);
        }
      }}
    />
  );
};
