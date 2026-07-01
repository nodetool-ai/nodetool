/** @jsxImportSource @emotion/react */
import React, { useCallback, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { $createTextNode } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
  useBasicTypeaheadTriggerMatch
} from "@lexical/react/LexicalTypeaheadMenuPlugin";

import { useRecentAssetsStore } from "../../../../stores/RecentAssetsStore";
import type { Asset } from "../../../../stores/ApiTypes";
import { $createAssetMentionNode } from "./AssetMentionNode";
import { $insertAssetMention } from "./promptEditorState";
import { assetToUri } from "./promptTokens";
import { AssetMentionMenu } from "./AssetMentionMenu";
import { useAssetMentionSearch } from "./useAssetMentionSearch";

class AssetTypeaheadOption extends MenuOption {
  asset: Asset;
  constructor(asset: Asset) {
    super(asset.id);
    this.asset = asset;
  }
}

/**
 * `@`-triggered picker that inserts an asset-mention chip (encoded as
 * `asset://<id>.<ext>`). The Recent/Saved buckets, search, and tile grid live
 * in `useAssetMentionSearch` + `AssetMentionMenu`, shared with the media chat
 * composer; this plugin wires them to Lexical's typeahead.
 */
const AssetMentionPlugin: React.FC = () => {
  const [editor] = useLexicalComposerContext();
  const addRecentAsset = useRecentAssetsStore((state) => state.addRecentAsset);

  const [queryString, setQueryString] = useState<string | null>(null);
  const { activeTab, setActiveTab, displayedAssets, handleRename } =
    useAssetMentionSearch(queryString);

  const triggerFn = useBasicTypeaheadTriggerMatch("@", {
    minLength: 0,
    maxLength: 64
  });

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
        return createPortal(
          <AssetMentionMenu
            activeTab={activeTab}
            onTabChange={(tab) => {
              setActiveTab(tab);
              setHighlightedIndex(0);
            }}
            assets={displayedAssets}
            selectedIndex={selectedIndex ?? 0}
            onSelect={(index) => {
              setHighlightedIndex(index);
              selectOptionAndCleanUp(options[index]);
            }}
            onHighlight={setHighlightedIndex}
            onRename={handleRename}
            queryString={queryString}
          />,
          anchorElementRef.current
        );
      }}
    />
  );
};

export default AssetMentionPlugin;
