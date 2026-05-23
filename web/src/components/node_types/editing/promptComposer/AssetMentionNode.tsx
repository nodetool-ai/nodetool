/** @jsxImportSource @emotion/react */
import React from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import ImageIcon from "@mui/icons-material/Image";
import AudiotrackIcon from "@mui/icons-material/Audiotrack";
import MovieIcon from "@mui/icons-material/Movie";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import {
  DecoratorNode,
  type DOMExportOutput,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread
} from "lexical";

import { useAssetById } from "../../../../serverState/useAssetById";
import { assetMediaKind, parseAssetUri } from "./promptTokens";

export type SerializedAssetMentionNode = Spread<
  {
    type: "asset-mention";
    version: 1;
    uri: string;
    label: string;
    thumb?: string;
  },
  SerializedLexicalNode
>;

const chipStyles = (theme: Theme) =>
  css({
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25em",
    verticalAlign: "baseline",
    margin: "0 1px",
    padding: "0 0.4em",
    borderRadius: "var(--rounded-sm, 4px)",
    backgroundColor: theme.vars.palette.primary.main,
    color: theme.vars.palette.primary.contrastText,
    fontFamily: theme.fontFamily2,
    fontSize: theme.fontSizeSmaller,
    lineHeight: 1.6,
    whiteSpace: "nowrap",
    userSelect: "none",
    "& svg": { fontSize: "1em" }
  });

const previewStyles = (theme: Theme) =>
  css({
    display: "inline-flex",
    verticalAlign: "middle",
    margin: "0 2px",
    borderRadius: "var(--rounded-sm, 4px)",
    overflow: "hidden",
    border: `1px solid ${theme.vars.palette.primary.main}`,
    userSelect: "none",
    "& img": {
      display: "block",
      height: "2.6em",
      maxWidth: 160,
      objectFit: "cover"
    }
  });

const AssetMentionChip: React.FC<{
  uri: string;
  label: string;
  thumb?: string;
}> = ({ uri, label, thumb }) => {
  const theme = useTheme();
  const { assetId, ext } = parseAssetUri(uri);
  const kind = assetMediaKind(ext);
  const wantsPreview = kind === "image" || kind === "video";
  // Resolve the preview from the store only when we weren't handed one (e.g.
  // after reloading a saved prompt, where the chip starts from the URN alone).
  const { data: resolved } = useAssetById(
    wantsPreview && !thumb ? assetId : undefined
  );
  const previewUrl =
    thumb || resolved?.thumb_url || resolved?.get_url || undefined;

  if (wantsPreview && previewUrl) {
    return (
      <span
        css={previewStyles(theme)}
        className="asset-mention-chip asset-mention-preview nodrag"
        contentEditable={false}
        title={label}
      >
        <img src={previewUrl} alt={label} />
      </span>
    );
  }

  const Icon =
    kind === "image"
      ? ImageIcon
      : kind === "audio"
        ? AudiotrackIcon
        : kind === "video"
          ? MovieIcon
          : InsertDriveFileIcon;
  return (
    <span
      css={chipStyles(theme)}
      className="asset-mention-chip nodrag"
      contentEditable={false}
      title={uri}
    >
      <Icon />
      {label}
    </span>
  );
};

export class AssetMentionNode extends DecoratorNode<React.JSX.Element> {
  __uri: string;
  __label: string;
  /** Display-only preview URL; never part of the on-disk prompt string. */
  __thumb?: string;

  static getType(): string {
    return "asset-mention";
  }

  static clone(node: AssetMentionNode): AssetMentionNode {
    return new AssetMentionNode(
      node.__uri,
      node.__label,
      node.__thumb,
      node.__key
    );
  }

  constructor(uri: string, label: string, thumb?: string, key?: NodeKey) {
    super(key);
    this.__uri = uri;
    this.__label = label;
    this.__thumb = thumb;
  }

  static importJSON(serialized: SerializedAssetMentionNode): AssetMentionNode {
    return $createAssetMentionNode(
      serialized.uri,
      serialized.label,
      serialized.thumb
    );
  }

  exportJSON(): SerializedAssetMentionNode {
    return {
      type: "asset-mention",
      version: 1,
      uri: this.__uri,
      label: this.__label,
      ...(this.__thumb != null && { thumb: this.__thumb })
    };
  }

  createDOM(): HTMLElement {
    const span = document.createElement("span");
    span.style.display = "inline-block";
    return span;
  }

  updateDOM(): false {
    return false;
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement("span");
    element.textContent = this.__uri;
    return { element };
  }

  isInline(): true {
    return true;
  }

  /** On-disk encoding — the asset URN that the runtime dereferences. */
  getTextContent(): string {
    return this.__uri;
  }

  getUri(): string {
    return this.__uri;
  }

  decorate(): React.JSX.Element {
    return (
      <AssetMentionChip
        uri={this.__uri}
        label={this.__label}
        thumb={this.__thumb}
      />
    );
  }
}

export const $createAssetMentionNode = (
  uri: string,
  label: string,
  thumb?: string
): AssetMentionNode => new AssetMentionNode(uri, label || uri, thumb);

export const $isAssetMentionNode = (
  node: LexicalNode | null | undefined
): node is AssetMentionNode => node instanceof AssetMentionNode;
