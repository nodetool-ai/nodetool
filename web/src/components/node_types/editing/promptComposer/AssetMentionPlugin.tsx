/** @jsxImportSource @emotion/react */
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState
} from "react";
import { createPortal } from "react-dom";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { BORDER_RADIUS } from "../../../ui_primitives";
import { $createTextNode } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
  useBasicTypeaheadTriggerMatch
} from "@lexical/react/LexicalTypeaheadMenuPlugin";

import { useAssetStore } from "../../../../stores/AssetStore";
import { useRecentAssetsStore } from "../../../../stores/RecentAssetsStore";
import type { Asset } from "../../../../stores/ApiTypes";
import { $createAssetMentionNode } from "./AssetMentionNode";
import { $insertAssetMention } from "./promptEditorState";
import { assetToUri } from "./promptTokens";
import { MentionAssetTile } from "./MentionAssetTile";

type MentionTab = "recent" | "saved";

class AssetTypeaheadOption extends MenuOption {
  asset: Asset;
  constructor(asset: Asset) {
    super(asset.id);
    this.asset = asset;
  }
}

const menuStyles = (theme: Theme) =>
  css({
    width: 380,
    maxHeight: 320,
    display: "flex",
    flexDirection: "column",
    background: theme.vars.palette.background.paper,
    border: `1px solid ${theme.vars.palette.divider}`,
    borderRadius: BORDER_RADIUS.lg,
    boxShadow: theme.shadows[6],
    zIndex: 2000,
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

/**
 * `@`-triggered picker that inserts an asset-mention chip (encoded as
 * `asset://<id>.<ext>`). Two buckets: **Recent** (assets used in this prompt
 * session) and **Saved** (the asset library, searched by what's typed after
 * `@`). Tiles are large and scannable, and their names rename in place,
 * syncing back to the asset library via `AssetStore.update`.
 */
const AssetMentionPlugin: React.FC = () => {
  const theme = useTheme();
  const [editor] = useLexicalComposerContext();
  const search = useAssetStore((state) => state.search);
  const updateAsset = useAssetStore((state) => state.update);
  const recentAssets = useRecentAssetsStore((state) => state.recentAssets);
  const addRecentAsset = useRecentAssetsStore((state) => state.addRecentAsset);
  const renameRecentAsset = useRecentAssetsStore(
    (state) => state.renameRecentAsset
  );

  const [queryString, setQueryString] = useState<string | null>(null);
  const [savedAssets, setSavedAssets] = useState<Asset[]>([]);
  const [activeTab, setActiveTab] = useState<MentionTab>(
    recentAssets.length > 0 ? "recent" : "saved"
  );

  const triggerFn = useBasicTypeaheadTriggerMatch("@", {
    minLength: 0,
    maxLength: 64
  });

  useEffect(() => {
    if (queryString === null) {
      setSavedAssets([]);
      return;
    }
    let active = true;
    const handle = setTimeout(() => {
      search({ query: queryString, page_size: 24 })
        .then((result) => {
          if (active) {
            setSavedAssets(result.assets ?? []);
          }
        })
        .catch(() => {
          if (active) {
            setSavedAssets([]);
          }
        });
    }, 150);
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [queryString, search]);

  const filteredRecent = useMemo(() => {
    const q = (queryString ?? "").trim().toLowerCase();
    if (!q) {
      return recentAssets;
    }
    return recentAssets.filter((a) =>
      (a.name || a.id).toLowerCase().includes(q)
    );
  }, [recentAssets, queryString]);

  const displayedAssets = activeTab === "recent" ? filteredRecent : savedAssets;

  const options = useMemo(
    () => displayedAssets.map((asset) => new AssetTypeaheadOption(asset)),
    [displayedAssets]
  );

  const onSelectOption = useCallback(
    (
      selectedOption: AssetTypeaheadOption,
      nodeToReplace: ReturnType<typeof $createTextNode> | null,
      closeMenu: () => void
    ) => {
      editor.update(() => {
        const { asset } = selectedOption;
        const node = $createAssetMentionNode(
          assetToUri(asset),
          asset.name || asset.id,
          asset.thumb_url || asset.get_url || undefined
        );
        $insertAssetMention(node, nodeToReplace);
        closeMenu();
      });
      addRecentAsset(selectedOption.asset);
    },
    [editor, addRecentAsset]
  );

  const handleRename = useCallback(
    async (id: string, name: string) => {
      // Reject collisions within the currently visible scope so two assets in
      // the same bucket can't share a name.
      const collision = displayedAssets.some(
        (a) => a.id !== id && (a.name || a.id) === name
      );
      if (collision) {
        throw new Error("Name already in use");
      }
      await updateAsset({ id, name });
      renameRecentAsset(id, name);
      setSavedAssets((prev) =>
        prev.map((a) => (a.id === id ? { ...a, name } : a))
      );
    },
    [displayedAssets, updateAsset, renameRecentAsset]
  );

  return (
    <LexicalTypeaheadMenuPlugin<AssetTypeaheadOption>
      options={options}
      triggerFn={triggerFn}
      onQueryChange={setQueryString}
      onSelectOption={onSelectOption}
      menuRenderFn={(
        anchorElementRef,
        { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex }
      ) => {
        if (anchorElementRef.current === null) {
          return null;
        }
        const emptyMessage =
          activeTab === "recent"
            ? queryString
              ? "No recent assets match."
              : "No assets used yet. Generate or drag one in."
            : queryString
              ? "No assets match."
              : "Type to search your saved assets.";
        return createPortal(
          <div css={menuStyles(theme)} className="asset-mention-menu nowheel">
            <div className="mention-tabs" role="tablist">
              {(["recent", "saved"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab}
                  className={`mention-tab${activeTab === tab ? " active" : ""}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setActiveTab(tab);
                    setHighlightedIndex(0);
                  }}
                >
                  {tab === "recent" ? "Recent" : "Saved"}
                </button>
              ))}
            </div>
            <div className="mention-grid" role="listbox">
              {options.length === 0 ? (
                <div className="mention-empty">{emptyMessage}</div>
              ) : (
                options.map((option, index) => (
                  <MentionAssetTile
                    key={option.key}
                    asset={option.asset}
                    selected={index === selectedIndex}
                    onSelect={() => {
                      setHighlightedIndex(index);
                      selectOptionAndCleanUp(option);
                    }}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    onRename={handleRename}
                  />
                ))
              )}
            </div>
          </div>,
          anchorElementRef.current
        );
      }}
    />
  );
};

export default AssetMentionPlugin;
