import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createAutoLinkNode,
  $isAutoLinkNode,
  $isLinkNode
} from "@lexical/link";
import {
  $createTextNode,
  TextNode
} from "lexical";

const URL_REGEX =
  /((https?:\/\/(www\.)?)|(www\.))[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)/;

const EMAIL_REGEX =
  /(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))/;

const MATCHERS = [
  (text: string) => {
    const match = URL_REGEX.exec(text);
    if (match === null) {
      return null;
    }
    const fullMatch = match[0];
    return {
      index: match.index,
      length: fullMatch.length,
      text: fullMatch,
      url: fullMatch.startsWith("http") ? fullMatch : `https://${fullMatch}`
    };
  },
  (text: string) => {
    const match = EMAIL_REGEX.exec(text);
    if (match === null) {
      return null;
    }
    const fullMatch = match[0];
    return {
      index: match.index,
      length: fullMatch.length,
      text: fullMatch,
      url: `mailto:${fullMatch}`
    };
  }
];

function findMatch(text: string) {
  for (const matcher of MATCHERS) {
    const match = matcher(text);
    if (match) {
      return match;
    }
  }
  return null;
}

function getTextContent(node: TextNode): string {
  return node.getTextContent();
}

export function AutoLinkPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerNodeTransform(TextNode, (textNode: TextNode) => {
      const parent = textNode.getParent();
      if ($isAutoLinkNode(parent)) {
        // Already a link, skip
        return;
      }
      if ($isLinkNode(parent)) {
        // Already a link, skip
        return;
      }

      const text = getTextContent(textNode);
      const match = findMatch(text);
      if (match === null) {
        return;
      }

      let targetNode;
      if (match.index === 0) {
        [targetNode] = textNode.splitText(match.index + match.length);
      } else {
        [, targetNode] = textNode.splitText(
          match.index,
          match.index + match.length
        );
      }

      const linkNode = $createAutoLinkNode(match.url);
      const linkTextNode = $createTextNode(match.text);
      linkTextNode.setFormat(targetNode.getFormat());
      linkTextNode.setDetail(targetNode.getDetail());
      linkNode.append(linkTextNode);
      targetNode.replace(linkNode);
    });
  }, [editor]);

  return null;
}
