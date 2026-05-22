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

import { assetMediaKind, parseAssetUri } from "./promptTokens";

export type SerializedAssetMentionNode = Spread<
  {
    type: "asset-mention";
    version: 1;
    uri: string;
    label: string;
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

const AssetMentionChip: React.FC<{ uri: string; label: string }> = ({
  uri,
  label
}) => {
  const theme = useTheme();
  const { ext } = parseAssetUri(uri);
  const kind = assetMediaKind(ext);
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

  static getType(): string {
    return "asset-mention";
  }

  static clone(node: AssetMentionNode): AssetMentionNode {
    return new AssetMentionNode(node.__uri, node.__label, node.__key);
  }

  constructor(uri: string, label: string, key?: NodeKey) {
    super(key);
    this.__uri = uri;
    this.__label = label;
  }

  static importJSON(serialized: SerializedAssetMentionNode): AssetMentionNode {
    return $createAssetMentionNode(serialized.uri, serialized.label);
  }

  exportJSON(): SerializedAssetMentionNode {
    return {
      type: "asset-mention",
      version: 1,
      uri: this.__uri,
      label: this.__label
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
    return <AssetMentionChip uri={this.__uri} label={this.__label} />;
  }
}

export const $createAssetMentionNode = (
  uri: string,
  label: string
): AssetMentionNode => new AssetMentionNode(uri, label || uri);

export const $isAssetMentionNode = (
  node: LexicalNode | null | undefined
): node is AssetMentionNode => node instanceof AssetMentionNode;
