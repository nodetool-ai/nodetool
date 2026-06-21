import React from "react";

/** The tabs shown at the top of the Inspector panel. */
export type InspectorTab = "params" | "io" | "help";

const TAB_DEFS: { value: InspectorTab; label: string; hasCount: boolean }[] = [
  { value: "params", label: "Params", hasCount: true },
  { value: "io", label: "I/O", hasCount: true },
  { value: "help", label: "Help", hasCount: false }
];

export interface InspectorTabsProps {
  active: InspectorTab;
  onChange: (next: InspectorTab) => void;
  counts: Partial<Record<InspectorTab, number>>;
}

/** Presentational tab strip for the Inspector. */
export const InspectorTabs: React.FC<InspectorTabsProps> = ({
  active,
  onChange,
  counts
}) => (
  <div className="inspector-tabs" role="tablist">
    {TAB_DEFS.map((tab) => {
      const count = counts[tab.value];
      const isActive = active === tab.value;
      return (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={isActive}
          className={`inspector-tab${isActive ? " is-active" : ""}`}
          onClick={() => onChange(tab.value)}
        >
          {tab.label}
          {tab.hasCount && typeof count === "number" ? (
            <span className="tab-count">{count}</span>
          ) : null}
        </button>
      );
    })}
  </div>
);
