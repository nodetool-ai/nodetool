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
import type { Entity } from "@nodetool-ai/protocol";
import { $createAssetMentionNode } from "./AssetMentionNode";
import { $createEntityMentionNode } from "./EntityMentionNode";
import { $insertAssetMention } from "./promptEditorState";
import { assetToUri, entityToUri } from "./promptTokens";
import { AssetMentionMenu } from "./AssetMentionMenu";
import { useAssetMentionSearch } from "./useAssetMentionSearch";

class AssetTypeaheadOption extends MenuOption {
  asset: Asset;
  constructor(asset: Asset) {
    super(asset.id);
    this.asset = asset;
  }
}

class EntityTypeaheadOption extends MenuOption {
  entity: Entity;
  constructor(entity: Entity) {
    super(`entity:${entity.id}`);
    this.entity = entity;
  }
}

type MentionTypeaheadOption = AssetTypeaheadOption | EntityTypeaheadOption;

/**
 * `@`-triggered picker that inserts a mention chip: a library entity (encoded
 * as `entity://<id>`, expanded to its descriptor + reference image at
 * generation time) or an asset (encoded as `asset://<id>.<ext>`). The buckets,
 * search, and tile grid live in `useAssetMentionSearch` + `AssetMentionMenu`,
 * shared with the media chat composer; this plugin wires them to Lexical's
 * typeahead. Entities come first in the combined selection order.
 */
const AssetMentionPlugin: React.FC = () => {
  const [editor] = useLexicalComposerContext();
  const addRecentAsset = useRecentAssetsStore((state) => state.addRecentAsset);

  const [queryString, setQueryString] = useState<string | null>(null);
  const {
    activeTab,
    setActiveTab,
    entities,
    displayedAssets,
    hasMoreSaved,
    loadMoreSaved,
    handleRename
  } = useAssetMentionSearch(queryString);

  const triggerFn = useBasicTypeaheadTriggerMatch("@", {
    minLength: 0,
    maxLength: 64
  });

  const options = useMemo<MentionTypeaheadOption[]>(
    () => [
      ...entities.map((entity) => new EntityTypeaheadOption(entity)),
      ...displayedAssets.map((asset) => new AssetTypeaheadOption(asset))
    ],
    [entities, displayedAssets]
  );

  const onSelectOption = useCallback(
    (
      selectedOption: MentionTypeaheadOption,
      nodeToReplace: ReturnType<typeof $createTextNode> | null,
      closeMenu: () => void
    ) => {
      editor.update(() => {
        const node =
          selectedOption instanceof EntityTypeaheadOption
            ? $createEntityMentionNode(
                entityToUri(selectedOption.entity),
                selectedOption.entity.name || selectedOption.entity.id,
                selectedOption.entity.reference_images?.[0]?.uri
              )
            : $createAssetMentionNode(
                assetToUri(selectedOption.asset),
                selectedOption.asset.name || selectedOption.asset.id,
                selectedOption.asset.thumb_url ||
                  selectedOption.asset.get_url ||
                  undefined
              );
        $insertAssetMention(node, nodeToReplace);
        closeMenu();
      });
      if (selectedOption instanceof AssetTypeaheadOption) {
        addRecentAsset(selectedOption.asset);
      }
    },
    [editor, addRecentAsset]
  );

  return (
    <LexicalTypeaheadMenuPlugin<MentionTypeaheadOption>
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
            entities={entities}
            assets={displayedAssets}
            selectedIndex={selectedIndex ?? 0}
            onSelect={(index) => {
              setHighlightedIndex(index);
              selectOptionAndCleanUp(options[index]);
            }}
            onHighlight={setHighlightedIndex}
            onRename={handleRename}
            queryString={queryString}
            hasMore={hasMoreSaved}
            onLoadMore={loadMoreSaved}
          />,
          anchorElementRef.current
        );
      }}
    />
  );
};

export default AssetMentionPlugin;
