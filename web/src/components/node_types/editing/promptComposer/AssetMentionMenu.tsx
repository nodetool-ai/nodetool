/** @jsxImportSource @emotion/react */
import React, { useCallback, useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import { BORDER_RADIUS, SPACING, Z_INDEX } from "../../../ui_primitives";
import type { Asset } from "../../../../stores/ApiTypes";
import type { Entity } from "@nodetool-ai/protocol";
import { MentionAssetTile } from "./MentionAssetTile";
import { MentionEntityTile } from "./MentionEntityTile";
import type { MentionTab } from "./useAssetMentionSearch";

export const assetMentionMenuStyles = (theme: Theme) =>
  css({
    width: 380,
    maxHeight: 320,
    display: "flex",
    flexDirection: "column",
    background: theme.vars.palette.background.paper,
    border: `1px solid ${theme.vars.palette.divider}`,
    borderRadius: BORDER_RADIUS.lg,
    boxShadow: theme.shadows[6],
    zIndex: Z_INDEX.tooltip,
    overflow: "hidden",
    ".mention-tabs": {
      flex: "0 0 auto",
      display: "flex",
      gap: theme.spacing(0.5),
      padding: theme.spacing(0.5),
      borderBottom: `1px solid ${theme.vars.palette.divider}`
    },
    ".mention-tab": {
      flex: "0 0 auto",
      padding: `${theme.spacing(0.5)} ${theme.spacing(1.5)}`,
      border: "none",
      borderRadius: BORDER_RADIUS.sm,
      background: "transparent",
      color: theme.vars.palette.text.secondary,
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeSmall,
      cursor: "pointer",
      "&.active": {
        background: theme.vars.palette.action.selected,
        color: theme.vars.palette.text.primary
      }
    },
    ".mention-grid": {
      flex: "1 1 auto",
      overflowY: "auto",
      display: "flex",
      flexWrap: "wrap",
      gap: theme.spacing(0.5),
      padding: theme.spacing(1),
      alignContent: "flex-start"
    },
    ".mention-empty": {
      padding: theme.spacing(2),
      width: "100%",
      textAlign: "center",
      color: theme.vars.palette.text.secondary,
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeSmall
    },
    ".mention-entities": {
      flex: "0 0 auto",
      display: "flex",
      flexWrap: "wrap",
      alignItems: "center",
      gap: theme.spacing(0.5),
      padding: theme.spacing(SPACING.xs),
      maxHeight: 96,
      overflowY: "auto",
      borderBottom: `1px solid ${theme.vars.palette.divider}`
    },
    ".mention-entities-label": {
      flex: "0 0 100%",
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeSmaller,
      textTransform: "uppercase",
      letterSpacing: "0.06em",
      color: theme.vars.palette.text.secondary,
      padding: `0 ${theme.spacing(0.5)}`
    }
  });

export interface AssetMentionMenuProps {
  activeTab: MentionTab;
  /** Switch buckets. Callers should reset the highlighted index to 0. */
  onTabChange: (tab: MentionTab) => void;
  /**
   * Library entities matching the query, rendered as a row above the asset
   * grid. They occupy the head of the combined selection order: indices
   * `0..entities.length-1`, with assets following.
   */
  entities?: Entity[];
  assets: Asset[];
  /** Highlight index in the combined entities-then-assets order. */
  selectedIndex: number;
  /** Commit the item at `index` in combined order (keyboard Enter or click). */
  onSelect: (index: number) => void;
  /** Move the highlight to `index` in combined order (hover / keyboard nav). */
  onHighlight: (index: number) => void;
  onRename: (id: string, name: string) => Promise<void>;
  /** Text typed after `@`, or `null` when the mention was just opened. */
  queryString: string | null;
  /** Whether the Saved tab has more results below the fold. */
  hasMore?: boolean;
  /** Fetch the next page; called when the grid is scrolled near the bottom. */
  onLoadMore?: () => void;
  className?: string;
}

// Binding a tile's index into its handlers here rather than in the grid's map
// is what makes the tile's memo hold: an arrow-key move now repaints the two
// tiles whose `selected` flipped instead of the whole grid.
const EntityRow = React.memo(function EntityRow({
  entity,
  index,
  selected,
  onSelect,
  onHighlight
}: {
  entity: Entity;
  index: number;
  selected: boolean;
  onSelect: (index: number) => void;
  onHighlight: (index: number) => void;
}) {
  const handleSelect = useCallback(() => onSelect(index), [onSelect, index]);
  const handleHighlight = useCallback(
    () => onHighlight(index),
    [onHighlight, index]
  );
  return (
    <MentionEntityTile
      entity={entity}
      selected={selected}
      onSelect={handleSelect}
      onMouseEnter={handleHighlight}
    />
  );
});

const AssetRow = React.memo(function AssetRow({
  asset,
  index,
  selected,
  onSelect,
  onHighlight,
  onRename
}: {
  asset: Asset;
  index: number;
  selected: boolean;
  onSelect: (index: number) => void;
  onHighlight: (index: number) => void;
  onRename: (id: string, name: string) => Promise<void>;
}) {
  const handleSelect = useCallback(() => onSelect(index), [onSelect, index]);
  const handleHighlight = useCallback(
    () => onHighlight(index),
    [onHighlight, index]
  );
  return (
    <MentionAssetTile
      asset={asset}
      selected={selected}
      onSelect={handleSelect}
      onMouseEnter={handleHighlight}
      onRename={onRename}
    />
  );
});

/**
 * The `@`-mention picker body: Recent/Saved tabs over a grid of scannable asset
 * tiles. Purely presentational — the caller owns the trigger, the search
 * (`useAssetMentionSearch`), and how a selected asset is inserted. Shared by the
 * Lexical prompt composer and the media chat composer so both pickers look and
 * behave the same.
 */
export const AssetMentionMenu: React.FC<AssetMentionMenuProps> = ({
  activeTab,
  onTabChange,
  entities = [],
  assets,
  selectedIndex,
  onSelect,
  onHighlight,
  onRename,
  queryString,
  hasMore = false,
  onLoadMore,
  className
}) => {
  const theme = useTheme();
  const menuStyles = useMemo(() => assetMentionMenuStyles(theme), [theme]);
  const entityCount = entities.length;
  const emptyMessage =
    activeTab === "recent"
      ? queryString
        ? "No recent assets match."
        : "No assets used yet. Generate or drag one in."
      : queryString
        ? "No assets match."
        : "No saved assets yet.";

  const handleGridScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (!hasMore || !onLoadMore) {
      return;
    }
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 120) {
      onLoadMore();
    }
  };

  return (
    <div
      css={menuStyles}
      className={`asset-mention-menu nowheel${className ? ` ${className}` : ""}`}
    >
      {entityCount > 0 && (
        <div className="mention-entities" role="listbox" aria-label="Entities">
          <span className="mention-entities-label">Entities</span>
          {entities.map((entity, index) => (
            <EntityRow
              key={entity.id}
              entity={entity}
              index={index}
              selected={index === selectedIndex}
              onSelect={onSelect}
              onHighlight={onHighlight}
            />
          ))}
        </div>
      )}
      <div className="mention-tabs" role="tablist">
        {(["recent", "saved"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            className={`mention-tab${activeTab === tab ? " active" : ""}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onTabChange(tab)}
          >
            {tab === "recent" ? "Recent" : "Saved"}
          </button>
        ))}
      </div>
      <div
        className="mention-grid"
        role="listbox"
        onScroll={activeTab === "saved" ? handleGridScroll : undefined}
      >
        {assets.length === 0 ? (
          <div className="mention-empty">{emptyMessage}</div>
        ) : (
          assets.map((asset, index) => (
            <AssetRow
              key={asset.id}
              asset={asset}
              index={entityCount + index}
              selected={entityCount + index === selectedIndex}
              onSelect={onSelect}
              onHighlight={onHighlight}
              onRename={onRename}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default AssetMentionMenu;
