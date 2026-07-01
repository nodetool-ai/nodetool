/** @jsxImportSource @emotion/react */
import React from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import { BORDER_RADIUS, Z_INDEX } from "../../../ui_primitives";
import type { Asset } from "../../../../stores/ApiTypes";
import { MentionAssetTile } from "./MentionAssetTile";
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
    }
  });

export interface AssetMentionMenuProps {
  activeTab: MentionTab;
  /** Switch buckets. Callers should reset the highlighted index to 0. */
  onTabChange: (tab: MentionTab) => void;
  assets: Asset[];
  selectedIndex: number;
  /** Commit the asset at `index` (keyboard Enter or click). */
  onSelect: (index: number) => void;
  /** Move the highlight to `index` (hover / keyboard nav). */
  onHighlight: (index: number) => void;
  onRename: (id: string, name: string) => Promise<void>;
  /** Text typed after `@`, or `null` when the mention was just opened. */
  queryString: string | null;
  className?: string;
}

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
  assets,
  selectedIndex,
  onSelect,
  onHighlight,
  onRename,
  queryString,
  className
}) => {
  const theme = useTheme();
  const emptyMessage =
    activeTab === "recent"
      ? queryString
        ? "No recent assets match."
        : "No assets used yet. Generate or drag one in."
      : queryString
        ? "No assets match."
        : "Type to search your saved assets.";

  return (
    <div
      css={assetMentionMenuStyles(theme)}
      className={`asset-mention-menu nowheel${className ? ` ${className}` : ""}`}
    >
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
      <div className="mention-grid" role="listbox">
        {assets.length === 0 ? (
          <div className="mention-empty">{emptyMessage}</div>
        ) : (
          assets.map((asset, index) => (
            <MentionAssetTile
              key={asset.id}
              asset={asset}
              selected={index === selectedIndex}
              onSelect={() => onSelect(index)}
              onMouseEnter={() => onHighlight(index)}
              onRename={onRename}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default AssetMentionMenu;
