/** @jsxImportSource @emotion/react */
import React from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  DecoratorNode,
  type DOMExportOutput,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread
} from "lexical";

import { usePromptComposerContext } from "./promptComposerContext";

export type SerializedVariableNode = Spread<
  {
    type: "prompt-variable";
    version: 1;
    expr: string;
  },
  SerializedLexicalNode
>;

const chipStyles = (theme: Theme, known: boolean) =>
  css({
    display: "inline-flex",
    alignItems: "center",
    verticalAlign: "baseline",
    margin: "0 1px",
    padding: "0 0.4em",
    borderRadius: "var(--rounded-sm, 4px)",
    border: `1px solid ${
      known ? theme.vars.palette.success.main : theme.vars.palette.warning.main
    }`,
    backgroundColor: known
      ? `rgba(${theme.vars.palette.success.mainChannel} / 0.18)`
      : `rgba(${theme.vars.palette.warning.mainChannel} / 0.18)`,
    color: theme.vars.palette.text.primary,
    fontFamily: theme.fontFamily2,
    fontSize: theme.fontSizeSmaller,
    lineHeight: 1.6,
    whiteSpace: "nowrap",
    userSelect: "none"
  });

const VariableChip: React.FC<{ expr: string }> = ({ expr }) => {
  const theme = useTheme();
  const { knownVariables } = usePromptComposerContext();
  // The leading identifier (before any filter) is the dynamic-input name.
  const name = expr.split("|")[0].trim();
  const known = knownVariables.has(name);
  return (
    <span
      css={chipStyles(theme, known)}
      className="prompt-variable-chip nodrag"
      contentEditable={false}
      title={
        known
          ? `Variable "${name}"`
          : `"${name}" has no matching input — add it as a variable`
      }
    >
      {expr}
    </span>
  );
};

export class VariableNode extends DecoratorNode<React.JSX.Element> {
  __expr: string;

  static getType(): string {
    return "prompt-variable";
  }

  static clone(node: VariableNode): VariableNode {
    return new VariableNode(node.__expr, node.__key);
  }

  constructor(expr: string, key?: NodeKey) {
    super(key);
    this.__expr = expr;
  }

  static importJSON(serialized: SerializedVariableNode): VariableNode {
    return $createVariableNode(serialized.expr);
  }

  exportJSON(): SerializedVariableNode {
    return {
      type: "prompt-variable",
      version: 1,
      expr: this.__expr
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
    element.textContent = this.getTextContent();
    return { element };
  }

  isInline(): true {
    return true;
  }

  /** On-disk encoding — the `{{ expr }}` placeholder substituted at runtime. */
  getTextContent(): string {
    return `{{ ${this.__expr} }}`;
  }

  getExpr(): string {
    return this.__expr;
  }

  decorate(): React.JSX.Element {
    return <VariableChip expr={this.__expr} />;
  }
}

export const $createVariableNode = (expr: string): VariableNode =>
  new VariableNode(expr);

export const $isVariableNode = (
  node: LexicalNode | null | undefined
): node is VariableNode => node instanceof VariableNode;
