import { create } from "zustand";
import { persist } from "zustand/middleware";
import { v4 as uuidv4 } from "uuid";

export interface Comment {
  id: string;
  nodeId?: string;
  content: string;
  author: string;
  createdAt: string;
  updatedAt: string;
}

export interface CommentStore {
  comments: Comment[];
  selectedCommentId: string | null;
  addComment: (nodeId: string | undefined, content: string) => Comment;
  updateComment: (id: string, content: string) => void;
  deleteComment: (id: string) => void;
  selectComment: (id: string | null) => void;
  getCommentsForNode: (nodeId: string) => Comment[];
  clearComments: () => void;
}

const useCommentStore = create<CommentStore>()(
  persist(
    (set, get) => ({
      comments: [],
      selectedCommentId: null,

      addComment: (nodeId: string | undefined, content: string): Comment => {
        const comment: Comment = {
          id: uuidv4(),
          nodeId,
          content,
          author: "User",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        set((state) => ({
          comments: [...state.comments, comment],
          selectedCommentId: comment.id
        }));

        return comment;
      },

      updateComment: (id: string, content: string): void => {
        set((state) => ({
          comments: state.comments.map((comment) =>
            comment.id === id
              ? { ...comment, content, updatedAt: new Date().toISOString() }
              : comment
          )
        }));
      },

      deleteComment: (id: string): void => {
        set((state) => ({
          comments: state.comments.filter((comment) => comment.id !== id),
          selectedCommentId:
            state.selectedCommentId === id ? null : state.selectedCommentId
        }));
      },

      selectComment: (id: string | null): void => {
        set({ selectedCommentId: id });
      },

      getCommentsForNode: (nodeId: string): Comment[] => {
        return get().comments.filter((comment) => comment.nodeId === nodeId);
      },

      clearComments: (): void => {
        set({ comments: [], selectedCommentId: null });
      }
    }),
    {
      name: "nodetool-comments"
    }
  )
);

export { useCommentStore as default };
export { useCommentStore };
