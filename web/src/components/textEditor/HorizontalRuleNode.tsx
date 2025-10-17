/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import {
  DecoratorNode,
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread
} from "lexical";

export type SerializedHorizontalRuleNode = Spread<
  {
    type: "horizontal-rule";
    version: 1;
  },
  SerializedLexicalNode
>;

const hrStyles = css`
  border: none;
  border-top: 2px solid rgba(255, 255, 255, 0.2);
  margin: 1em 0;
  cursor: pointer;
  transition: border-color 0.2s ease;

  &:hover {
    border-top-color: rgba(255, 255, 255, 0.4);
  }
`;

function HorizontalRuleComponent() {
  return <hr css={hrStyles} />;
}

export class HorizontalRuleNode extends DecoratorNode<JSX.Element> {
  static getType(): string {
    return "horizontal-rule";
  }

  static clone(node: HorizontalRuleNode): HorizontalRuleNode {
    return new HorizontalRuleNode(node.__key);
  }

  static importJSON(
    serializedNode: SerializedHorizontalRuleNode
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

  decorate(): JSX.Element {
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
