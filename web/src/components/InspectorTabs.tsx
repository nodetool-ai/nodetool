import React from "react";
import { useTranslation } from "react-i18next";
import { TabGroup, type TabItem } from "./ui_primitives";

/** The tabs shown at the top of the Inspector panel. */
export type InspectorTab = "params" | "io" | "help";

const isInspectorTab = (value: string): value is InspectorTab =>
  value === "params" || value === "io" || value === "help";

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
  const { t } = useTranslation();
  const tabDefs: { value: InspectorTab; label: string; hasCount: boolean }[] = [
    { value: "params", label: t("screen_remaining.inspector.params"), hasCount: true },
    { value: "io", label: t("screen_remaining.inspector.io"), hasCount: true },
    { value: "help", label: t("screen_remaining.inspector.help"), hasCount: false }
  ];
  const tabs: TabItem[] = tabDefs.map((tab) => ({
        value: tab.value,
        label: tab.label,
        count: tab.hasCount ? counts[tab.value] : undefined
      }));
  return (
    <TabGroup
      className="inspector-tabs"
      size="small"
      aria-label={t("screen_remaining.inspector.sections")}
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
