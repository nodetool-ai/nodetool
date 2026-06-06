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
import { $createTextNode } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
  useBasicTypeaheadTriggerMatch
} from "@lexical/react/LexicalTypeaheadMenuPlugin";

import { useAssetStore } from "../../../../stores/AssetStore";
import type { Asset } from "../../../../stores/ApiTypes";
import { $createAssetMentionNode } from "./AssetMentionNode";
import { $insertAssetMention } from "./promptEditorState";
import { assetToUri } from "./promptTokens";

class AssetTypeaheadOption extends MenuOption {
  asset: Asset;
  constructor(asset: Asset) {
    super(asset.id);
    this.asset = asset;
  }
}

const menuStyles = (theme: Theme) =>
  css({
    minWidth: 220,
    maxWidth: 320,
    maxHeight: 260,
    overflowY: "auto",
    background: theme.vars.palette.background.paper,
    border: `1px solid ${theme.vars.palette.divider}`,
    borderRadius: "var(--rounded-sm, 4px)",
    boxShadow: theme.shadows[6],
    padding: theme.spacing(0.5),
    zIndex: 2000,
    ".asset-option": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(1),
      padding: `${theme.spacing(0.5)} ${theme.spacing(1)}`,
      borderRadius: "var(--rounded-sm, 4px)",
      cursor: "pointer",
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeSmall,
      color: theme.vars.palette.text.primary,
      "&.selected": {
        background: theme.vars.palette.action.selected
      }
    },
    ".asset-thumb": {
      width: 28,
      height: 28,
      flex: "0 0 auto",
      objectFit: "cover",
      borderRadius: 3,
      background: theme.vars.palette.grey[800]
    },
    ".asset-meta": {
      minWidth: 0,
      display: "flex",
      flexDirection: "column"
    },
    ".asset-name": {
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },
    ".asset-type": {
      color: theme.vars.palette.text.secondary,
      fontSize: theme.fontSizeSmaller
    },
    ".asset-empty": {
      padding: theme.spacing(1),
      color: theme.vars.palette.text.secondary,
      fontSize: theme.fontSizeSmall
    }
  });

const AssetOptionRow: React.FC<{
  option: AssetTypeaheadOption;
  selected: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
}> = ({ option, selected, onClick, onMouseEnter }) => {
  const { asset } = option;
  return (
    <div
      className={`asset-option${selected ? " selected" : ""}`}
      role="option"
      aria-selected={selected}
      tabIndex={0}
      ref={option.setRefElement}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          onClick();
        }
      }}
      onMouseEnter={onMouseEnter}
    >
      {asset.thumb_url ? (
        <img className="asset-thumb" src={asset.thumb_url} alt="" />
      ) : (
        <span className="asset-thumb" />
      )}
      <span className="asset-meta">
        <span className="asset-name">{asset.name || asset.id}</span>
        <span className="asset-type">{asset.content_type}</span>
      </span>
    </div>
  );
};

/**
 * `@`-triggered typeahead that searches assets and inserts an asset-mention
 * chip (encoded as `asset://<id>.<ext>`).
 */
const AssetMentionPlugin: React.FC = () => {
  const theme = useTheme();
  const [editor] = useLexicalComposerContext();
  const search = useAssetStore((state) => state.search);
  const [queryString, setQueryString] = useState<string | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);

  const triggerFn = useBasicTypeaheadTriggerMatch("@", {
    minLength: 0,
    maxLength: 64
  });

  useEffect(() => {
    if (queryString === null) {
      setAssets([]);
      return;
    }
    let active = true;
    const handle = setTimeout(() => {
      search({ query: queryString, page_size: 8 })
        .then((result) => {
          if (active) {
            setAssets(result.assets ?? []);
          }
        })
        .catch(() => {
          if (active) {
            setAssets([]);
          }
        });
    }, 150);
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [queryString, search]);

  const options = useMemo(
    () => assets.map((asset) => new AssetTypeaheadOption(asset)),
    [assets]
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
    },
    [editor]
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
          <div css={menuStyles(theme)} className="asset-mention-menu nowheel">
            {options.length === 0 ? (
              <div className="asset-empty">
                {queryString ? "No matching assets" : "Type to search assets"}
              </div>
            ) : (
              options.map((option, index) => (
                <AssetOptionRow
                  key={option.key}
                  option={option}
                  selected={index === selectedIndex}
                  onClick={() => {
                    setHighlightedIndex(index);
                    selectOptionAndCleanUp(option);
                  }}
                  onMouseEnter={() => setHighlightedIndex(index)}
                />
              ))
            )}
          </div>,
          anchorElementRef.current
        );
      }}
    />
  );
};

export default AssetMentionPlugin;
