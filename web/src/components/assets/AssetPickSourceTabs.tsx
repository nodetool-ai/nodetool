/**
 * The "This project / Personal" switch an asset picker shows in a named
 * project. Personal is the library: the hint says that picking from it copies
 * the file into the project.
 */
import React from "react";
import { useTranslation } from "react-i18next";
import type { AssetPickSource } from "../../hooks/assets/useProjectAssetPick";
import { Caption, FlexColumn, SPACING, TabGroup } from "../ui_primitives";

interface AssetPickSourceTabsProps {
  readonly value: AssetPickSource;
  readonly onChange: (source: AssetPickSource) => void;
}

const isSource = (value: string): value is AssetPickSource =>
  value === "project" || value === "personal";

export const AssetPickSourceTabs: React.FC<AssetPickSourceTabsProps> = ({
  value,
  onChange
}) => {
  const { t } = useTranslation();
  return (
    <FlexColumn gap={SPACING.xs}>
      <TabGroup
        tabs={[
          { value: "project", label: t("assetPicker.projectTab") },
          { value: "personal", label: t("assetPicker.personalTab") }
        ]}
        value={value}
        onChange={(next) => {
          if (isSource(next)) onChange(next);
        }}
        aria-label={t("assetPicker.sourceTabs")}
        size="small"
      />
      {value === "personal" && (
        <Caption color="secondary">{t("assetPicker.personalHint")}</Caption>
      )}
    </FlexColumn>
  );
};

export default AssetPickSourceTabs;
