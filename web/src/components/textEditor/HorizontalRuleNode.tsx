import React from "react";
import {
  DecoratorNode,
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  LexicalNode,
  SerializedLexicalNode,
  Spread
} from "lexical";

import { HorizontalRuleComponent } from "./HorizontalRuleComponent";

export type SerializedHorizontalRuleNode = Spread<
  {
    type: "horizontal-rule";
    version: 1;
  },
  SerializedLexicalNode
>;

export class HorizontalRuleNode extends DecoratorNode<React.JSX.Element> {
  static getType(): string {
    return "horizontal-rule";
  }

  static clone(node: HorizontalRuleNode): HorizontalRuleNode {
    return new HorizontalRuleNode(node.__key);
  }

  static importJSON(
    _serializedNode: SerializedHorizontalRuleNode
  ): HorizontalRuleNode {
    return $createHorizontalRuleNode();
  }

  static importDOM(): DOMConversionMap | null {
    return {
      hr: () => ({
        conversion: convertHorizontalRuleElement,
        priority: 0
      })
    };
  }

  exportJSON(): SerializedHorizontalRuleNode {
    return {
      type: "horizontal-rule",
      version: 1
    };
  }

  exportDOM(): DOMExportOutput {
    return { element: document.createElement("hr") };
  }

  createDOM(): HTMLElement {
    return document.createElement("hr");
  }

  getTextContent(): string {
    return "\n";
  }

  isInline(): false {
    return false;
  }

  updateDOM(): boolean {
    return false;
  }

  decorate(): React.JSX.Element {
    return <HorizontalRuleComponent />;
  }
}

export function $createHorizontalRuleNode(): HorizontalRuleNode {
  return new HorizontalRuleNode();
}

export function $isHorizontalRuleNode(
  node: LexicalNode | null | undefined
): node is HorizontalRuleNode {
  return node instanceof HorizontalRuleNode;
}

function convertHorizontalRuleElement(): DOMConversionOutput {
  return { node: $createHorizontalRuleNode() };
}
