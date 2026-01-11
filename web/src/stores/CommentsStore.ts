import { create } from "zustand";
import { Node } from "@xyflow/react";
import { NodeData } from "./NodeData";

export interface CommentItem {
  id: string;
  node: Node<NodeData>;
  preview: string;
  color: string;
  position: { x: number; y: number };
}

interface CommentsState {
  searchTerm: string;

  setSearchTerm: (term: string) => void;
  filterComments: (comments: CommentItem[], term: string) => CommentItem[];
  extractCommentPreview: (commentData: any) => string;
  extractCommentColor: (properties: any) => string;
  buildCommentList: (nodes: Node<NodeData>[]) => CommentItem[];
}

export const useCommentsStore = create<CommentsState>((set, get) => ({
  searchTerm: "",

  setSearchTerm: (searchTerm: string) => {
    set({ searchTerm });
  },

  filterComments: (comments: CommentItem[], term: string): CommentItem[] => {
    if (!term.trim()) {
      return comments;
    }
    const lowerTerm = term.toLowerCase();
    return comments.filter((comment) =>
      comment.preview.toLowerCase().includes(lowerTerm)
    );
  },

  extractCommentPreview: (commentData: any): string => {
    if (!commentData) {
      return "";
    }

    if (typeof commentData === "string") {
      return commentData.slice(0, 200);
    }

    if (typeof commentData === "object" && commentData.root) {
      const root = commentData.root;
      if (root.children && Array.isArray(root.children)) {
        const extractText = (children: any[]): string => {
          return children
            .map((child) => {
              if (typeof child.text === "string") {
                return child.text;
              }
              if (child.children) {
                return extractText(child.children);
              }
              return "";
            })
            .join(" ");
        };
        return extractText(root.children).slice(0, 200);
      }
    }

    return JSON.stringify(commentData).slice(0, 200);
  },

  extractCommentColor: (properties: any): string => {
    return properties?.comment_color || "#ffffff";
  },

  buildCommentList: (nodes: Node<NodeData>[]): CommentItem[] => {
    const { extractCommentPreview, extractCommentColor } = get();

    return nodes
      .filter((node) => node.type === "comment")
      .map((node) => ({
        id: node.id,
        node,
        preview: extractCommentPreview(node.data.properties?.comment),
        color: extractCommentColor(node.data.properties),
        position: node.position
      }));
  }
}));
