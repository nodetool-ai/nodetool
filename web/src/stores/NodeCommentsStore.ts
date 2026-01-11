import { create } from "zustand";

export interface NodeComment {
  nodeId: string;
  text: string;
  createdAt: number;
  updatedAt: number;
}

interface NodeCommentsState {
  comments: Record<string, NodeComment>;
  activeCommentNodeId: string | null;
  setActiveCommentNodeId: (nodeId: string | null) => void;
  getComment: (nodeId: string) => NodeComment | undefined;
  addComment: (nodeId: string, text: string) => void;
  updateComment: (nodeId: string, text: string) => void;
  deleteComment: (nodeId: string) => void;
  hasComment: (nodeId: string) => boolean;
  getAllComments: () => NodeComment[];
  clearComments: () => void;
}

const useNodeCommentsStore = create<NodeCommentsState>((set, get) => ({
  comments: {},
  activeCommentNodeId: null,

  setActiveCommentNodeId: (nodeId: string | null) => {
    set({ activeCommentNodeId: nodeId });
  },

  getComment: (nodeId: string) => {
    return get().comments[nodeId];
  },

  addComment: (nodeId: string, text: string) => {
    const now = Date.now();
    set((state) => ({
      comments: {
        ...state.comments,
        [nodeId]: {
          nodeId,
          text: text.trim(),
          createdAt: now,
          updatedAt: now,
        },
      },
    }));
  },

  updateComment: (nodeId: string, text: string) => {
    set((state) => {
      const existing = state.comments[nodeId];
      if (!existing) {
        return state;
      }
      return {
        comments: {
          ...state.comments,
          [nodeId]: {
            ...existing,
            text: text.trim(),
            updatedAt: Date.now(),
          },
        },
      };
    });
  },

  deleteComment: (nodeId: string) => {
    set((state) => {
      const { [nodeId]: _, ...rest } = state.comments;
      return { comments: rest };
    });
  },

  hasComment: (nodeId: string) => {
    return nodeId in get().comments;
  },

  getAllComments: () => {
    return Object.values(get().comments);
  },

  clearComments: () => {
    set({ comments: {} });
  },
}));

export default useNodeCommentsStore;
