import React, { memo, useCallback, useMemo } from "react";
import UnfoldLessIcon from "@mui/icons-material/UnfoldLess";
import UnfoldMoreIcon from "@mui/icons-material/UnfoldMore";
import useAssets from "../../serverState/useAssets";
import { useAssetGridStore } from "../../stores/AssetGridStore";
import { Box, Chip, EditorButton, FlexRow, SPACING } from "../ui_primitives";
import { ASSET_GROUP_KEYS, AssetGroupKey } from "./assetGridUtils";
import { AssetGroupIcon } from "./assetGroupIcons";
import { assetTypeLabel } from "./assetTypeLabels";

const ChipLabel: React.FC<{ label: string; count: number }> = ({
  label,
  count
}) => (
  <>
    {label}
    <Box component="span" sx={{ ml: SPACING.xs, color: "text.secondary" }}>
      {count}
    </Box>
  </>
);

/**
 * One chip per file type in the folder, with its count, so a large folder can
 * be narrowed to one type in a click. Also folds every type group at once.
 * Hidden when the folder holds a single type and no type is filtered in.
 */
const AssetTypeFilterBar: React.FC = () => {
  const { typeCounts } = useAssets();
  const typeFilter = useAssetGridStore((state) => state.typeFilter);
  const setTypeFilter = useAssetGridStore((state) => state.setTypeFilter);
  const collapsedAssetGroups = useAssetGridStore(
    (state) => state.collapsedAssetGroups
  );
  const setCollapsedAssetGroups = useAssetGridStore(
    (state) => state.setCollapsedAssetGroups
  );

  // The picked type stays listed at zero so the filter can still be cleared.
  const groups = useMemo(
    () =>
      ASSET_GROUP_KEYS.filter(
        (key) => typeCounts[key] > 0 || key === typeFilter
      ),
    [typeCounts, typeFilter]
  );
  const total = useMemo(
    () => ASSET_GROUP_KEYS.reduce((sum, key) => sum + typeCounts[key], 0),
    [typeCounts]
  );

  const anyExpanded = groups.some(
    (key) => !collapsedAssetGroups.includes(key)
  );
  const toggleAll = useCallback(() => {
    const others = collapsedAssetGroups.filter(
      (key) => !(groups as string[]).includes(key)
    );
    setCollapsedAssetGroups(anyExpanded ? [...others, ...groups] : others);
  }, [anyExpanded, collapsedAssetGroups, groups, setCollapsedAssetGroups]);

  const pick = useCallback(
    (key: AssetGroupKey) => setTypeFilter(typeFilter === key ? "all" : key),
    [setTypeFilter, typeFilter]
  );

  if (groups.length <= 1 && typeFilter === "all") {
    return null;
  }

  return (
    <FlexRow
      className="asset-type-filter"
      role="toolbar"
      aria-label="Filter by file type"
      align="center"
      gap={SPACING.xs}
      wrap
      sx={{ px: SPACING.md, pt: SPACING.sm, flexShrink: 0 }}
    >
      <Chip
        compact
        label={<ChipLabel label="All types" count={total} />}
        active={typeFilter === "all"}
        onClick={() => setTypeFilter("all")}
      />
      {groups.map((key) => (
        <Chip
          key={key}
          compact
          icon={<AssetGroupIcon group={key} />}
          label={
            <ChipLabel label={assetTypeLabel(key)} count={typeCounts[key]} />
          }
          active={typeFilter === key}
          onClick={() => pick(key)}
        />
      ))}
      {typeFilter === "all" && groups.length > 1 && (
        <EditorButton
          variant="text"
          color="inherit"
          density="compact"
          startIcon={anyExpanded ? <UnfoldLessIcon /> : <UnfoldMoreIcon />}
          onClick={toggleAll}
          sx={{ ml: "auto" }}
        >
          {anyExpanded ? "Collapse all" : "Expand all"}
        </EditorButton>
      )}
    </FlexRow>
  );
};

export default memo(AssetTypeFilterBar);
