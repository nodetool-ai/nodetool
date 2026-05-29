import React from "react";
import {
  DecoratorNode,
  type DOMExportOutput,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread
} from "lexical";

import { VariableChip } from "./VariableChip";

export type SerializedVariableNode = Spread<
  {
    type: "prompt-variable";
    version: 1;
    expr: string;
  },
  SerializedLexicalNode
>;

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
