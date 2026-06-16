/**
 * Drop assets from the asset browser / search straight into the composer.
 *
 * Each dropped asset becomes an asset-mention chip at the drop caret, encoded
 * as `asset://<id>.<ext>`. Single-asset drags carry the whole asset (instant
 * thumbnail); multi-select drags carry ids, which we resolve via the store.
 */
import { useEffect } from "react";
import {
  $createRangeSelection,
  $setSelection,
  COMMAND_PRIORITY_HIGH,
  COMMAND_PRIORITY_LOW,
  DRAGOVER_COMMAND,
  DROP_COMMAND,
  type LexicalEditor
} from "lexical";
import { mergeRegister } from "@lexical/utils";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";

import { useAssetStore } from "../../../../stores/AssetStore";
import { useRecentAssetsStore } from "../../../../stores/RecentAssetsStore";
import type { Asset } from "../../../../stores/ApiTypes";
import { $createAssetMentionNode } from "./AssetMentionNode";
import { $insertAssetMention } from "./promptEditorState";
import { assetToUri } from "./promptTokens";
import { hasAssetDrag, readAssetDrag } from "./assetDrag";

/** Best-effort caret position from drop coordinates, across browsers. */
const rangeFromPoint = (x: number, y: number): Range | null => {
  if (typeof document.caretRangeFromPoint === "function") {
    return document.caretRangeFromPoint(x, y);
  }
  const pos = (
    document as Document & {
      caretPositionFromPoint?: (
        x: number,
        y: number
      ) => { offsetNode: Node; offset: number } | null;
    }
  ).caretPositionFromPoint?.(x, y);
  if (pos) {
    const range = document.createRange();
    range.setStart(pos.offsetNode, pos.offset);
    range.collapse(true);
    return range;
  }
  return null;
};

const insertAssets = (
  editor: LexicalEditor,
  assets: Asset[],
  range: Range | null
): void => {
  if (assets.length === 0) {
    return;
  }
  editor.update(() => {
    if (range) {
      const selection = $createRangeSelection();
      selection.applyDOMRange(range);
      $setSelection(selection);
    }
    for (const asset of assets) {
      $insertAssetMention(
        $createAssetMentionNode(
          assetToUri(asset),
          asset.name || asset.id,
          asset.thumb_url || asset.get_url || undefined
        )
      );
    }
  });
  // Assets dragged into a prompt count as "used this session" — surface them
  // first in the `@`-mention picker.
  const { addRecentAsset } = useRecentAssetsStore.getState();
  for (const asset of assets) {
    addRecentAsset(asset);
  }
};

const AssetDropPlugin: React.FC = () => {
  const [editor] = useLexicalComposerContext();
  const getAsset = useAssetStore((state) => state.get);

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        DRAGOVER_COMMAND,
        (event) => {
          if (!hasAssetDrag(event.dataTransfer)) {
            return false;
          }
          event.preventDefault();
          if (event.dataTransfer) {
            event.dataTransfer.dropEffect = "copy";
          }
          return true;
        },
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        DROP_COMMAND,
        (event) => {
          const drag = readAssetDrag(event.dataTransfer);
          if (!drag) {
            return false;
          }
          event.preventDefault();
          event.stopPropagation();
          const range = rangeFromPoint(event.clientX, event.clientY);
          if (drag.assets.length > 0) {
            insertAssets(editor, drag.assets, range);
          }
          if (drag.pendingIds.length > 0) {
            Promise.all(
              drag.pendingIds.map((id) => getAsset(id).catch(() => null))
            ).then((resolved) => {
              insertAssets(
                editor,
                resolved.filter((a): a is Asset => a !== null),
                range
              );
            });
          }
          return true;
        },
        COMMAND_PRIORITY_HIGH
      )
    );
  }, [editor, getAsset]);

  return null;
};

export default AssetDropPlugin;
