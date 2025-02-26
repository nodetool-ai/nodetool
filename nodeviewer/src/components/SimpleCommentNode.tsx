/**
 * SimpleCommentNode renders a comment node in the workflow without interactive functionality
 */
import React, { memo } from "react";
import { NodeProps, Node } from "@xyflow/react";
import { NodeData } from "../stores/NodeData";
import { hexToRgba } from "../utils/ColorUtils";

interface SimpleCommentNodeProps extends NodeProps<Node<NodeData>> {}

// Define a simple type for our comment nodes
interface CommentNode {
  object?: string;
  type?: string;
  text?: string;
  [key: string]: any;
}

const SimpleCommentNode: React.FC<SimpleCommentNodeProps> = ({
  data,
  selected,
}) => {
  // Create HTML from the comment data
  let htmlOutput = "";

  const processMark = (mark: any): string => {
    if (mark.bold) {
      if (mark.size === "+") {
        return `<strong style="font-size: 1.25rem;">${mark.text}</strong>`;
      }
      return `<strong>${mark.text}</strong>`;
    }
    if (mark.italic) {
      return `<em>${mark.text}</em>`;
    }
    if (mark.underline) {
      return `<u>${mark.text}</u>`;
    }
    if (mark.code) {
      return `<code>${mark.text}</code>`;
    }
    return mark.text;
  };

  // Recursive function to process nodes
  const processNode = (node: CommentNode): string => {
    if (!node) return "";

    // Handle different node types
    switch (node.object) {
      case "block":
        // Process block node
        let blockContent = "";

        // Process child nodes if they exist
        if (node.children && Array.isArray(node.children)) {
          blockContent = node.children
            .map((child) => processMark(child))
            .join("");
        } else if (node.text) {
          // Fallback for simplified nodes with direct text property
          blockContent = node.text;
        }

        // Return appropriate HTML based on block type
        switch (node.type) {
          case "paragraph":
            return `<p>${blockContent}</p>`;
          case "heading-one":
            return `<h1>${blockContent}</h1>`;
          case "heading-two":
            return `<h2>${blockContent}</h2>`;
          case "heading-three":
            return `<h3>${blockContent}</h3>`;
          case "bulleted-list":
            return `<ul>${blockContent}</ul>`;
          case "numbered-list":
            return `<ol>${blockContent}</ol>`;
          case "list-item":
            return `<li>${blockContent}</li>`;
          case "quote":
            return `<blockquote>${blockContent}</blockquote>`;
          default:
            return `<div>${blockContent}</div>`;
        }

      case "inline":
        // Process inline node
        let inlineContent = "";

        if (node.children && Array.isArray(node.children)) {
          inlineContent = node.children
            .map((child) => processNode(child))
            .join("");
        } else if (node.text) {
          inlineContent = node.text;
        }

        switch (node.type) {
          case "link":
            return `<a href="${node.data?.href || "#"}">${inlineContent}</a>`;
          default:
            return `<span>${inlineContent}</span>`;
        }

      default:
        return node.text || "";
    }
  };

  try {
    if (data.properties.comment && Array.isArray(data.properties.comment)) {
      // Process the nodes to HTML
      const nodes = data.properties.comment.map((node: CommentNode) => {
        // Ensure each node has the required properties
        return {
          ...node,
          object: node.object || "block",
          type: node.type || "paragraph",
        };
      });

      // Create HTML representation of the nodes
      htmlOutput = nodes.map(processNode).join("");

      if (!htmlOutput) {
        htmlOutput = "<p>No comment content</p>";
      }
    } else {
      htmlOutput = "<p>No comment content</p>";
    }
  } catch (error) {
    console.error("Error processing comment:", error);
    htmlOutput = "<p>Error displaying comment</p>";
  }

  const commentColor = data.properties.comment_color || "#f5f5f5";

  // Create a className based on the node state
  const className = `node-drag-handle comment-node ${
    data.collapsed ? "collapsed " : ""
  }${selected ? "selected" : ""}`.trim();

  return (
    <div
      className={className}
      style={{
        backgroundColor: hexToRgba(commentColor, 0.5),
      }}
    >
      <div
        className="comment-content"
        dangerouslySetInnerHTML={{ __html: htmlOutput }}
      />
    </div>
  );
};

export default memo(SimpleCommentNode);
