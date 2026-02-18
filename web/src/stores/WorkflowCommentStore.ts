/**
 * WorkflowCommentStore manages comments and annotations for workflows.
 *
 * Comments are stored per workflow and include:
 * - Text content
 * - Author info (username, timestamp)
 * - Optional position (for canvas annotations)
 * - Resolved status
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Represents a workflow comment.
 */
export interface WorkflowComment {
  /** Unique identifier for the comment */
  id: string;
  /** ID of the workflow this comment belongs to */
  workflowId: string;
  /** Comment text content */
  content: string;
  /** Username of the comment author */
  author: string;
  /** ISO timestamp when the comment was created */
  createdAt: string;
  /** ISO timestamp when the comment was last edited */
  updatedAt: string;
  /** Whether the comment has been resolved */
  isResolved: boolean;
  /** Optional canvas position for annotation pins {x, y} */
  position?: { x: number; y: number };
  /** Optional ID of a node this comment is associated with */
  nodeId?: string;
}

/**
 * State structure for the WorkflowCommentStore.
 */
interface WorkflowCommentState {
  /** Map of workflow ID to array of comments */
  comments: Record<string, WorkflowComment[]>;
  /** Currently selected comment ID */
  selectedCommentId: string | null;
}

/**
 * Actions for managing workflow comments.
 */
interface WorkflowCommentActions {
  /** Add a new comment to a workflow */
  addComment: (comment: Omit<WorkflowComment, "id" | "createdAt" | "updatedAt"> & { author?: string }) => string;
  /** Update an existing comment */
  updateComment: (commentId: string, updates: Partial<Omit<WorkflowComment, "id" | "workflowId" | "createdAt">>) => void;
  /** Delete a comment */
  deleteComment: (commentId: string) => void;
  /** Toggle resolved status of a comment */
  toggleCommentResolved: (commentId: string) => void;
  /** Select a comment */
  selectComment: (commentId: string | null) => void;
  /** Get all comments for a workflow */
  getWorkflowComments: (workflowId: string) => WorkflowComment[];
  /** Get a specific comment by ID */
  getComment: (commentId: string) => WorkflowComment | undefined;
  /** Clear all comments for a workflow */
  clearWorkflowComments: (workflowId: string) => void;
}

/**
 * Generates a unique ID for a comment.
 */
const generateCommentId = (): string => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `comment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Creates an ISO timestamp string.
 */
const now = (): string => new Date().toISOString();

/**
 * Default username for comments when no user is logged in.
 */
const DEFAULT_AUTHOR = "Anonymous";

type WorkflowCommentStore = WorkflowCommentState & WorkflowCommentActions;

export const useWorkflowCommentStore = create<WorkflowCommentStore>()(
  persist(
    (set, get) => ({
      comments: {},
      selectedCommentId: null,

      addComment: (commentData) => {
        const commentId = generateCommentId();
        const timestamp = now();
        const workflowId = commentData.workflowId;

        const newComment: WorkflowComment = {
          id: commentId,
          workflowId,
          content: commentData.content,
          author: commentData.author || DEFAULT_AUTHOR,
          createdAt: timestamp,
          updatedAt: timestamp,
          isResolved: commentData.isResolved ?? false,
          position: commentData.position,
          nodeId: commentData.nodeId
        };

        set((state) => ({
          comments: {
            ...state.comments,
            [workflowId]: [...(state.comments[workflowId] || []), newComment]
          }
        }));

        return commentId;
      },

      updateComment: (commentId, updates) => {
        set((state) => {
          const workflowComments = { ...state.comments };
          let found = false;

          for (const workflowId in workflowComments) {
            const commentIndex = workflowComments[workflowId].findIndex(
              (c) => c.id === commentId
            );

            if (commentIndex !== -1) {
              const updatedComments = [...workflowComments[workflowId]];
              updatedComments[commentIndex] = {
                ...updatedComments[commentIndex],
                ...updates,
                updatedAt: now()
              };
              workflowComments[workflowId] = updatedComments;
              found = true;
              break;
            }
          }

          if (!found) {
            return state;
          }

          return { comments: workflowComments };
        });
      },

      deleteComment: (commentId) => {
        set((state) => {
          const workflowComments = { ...state.comments };

          for (const workflowId in workflowComments) {
            const filteredComments = workflowComments[workflowId].filter(
              (c) => c.id !== commentId
            );

            if (filteredComments.length !== workflowComments[workflowId].length) {
              workflowComments[workflowId] = filteredComments;
              break;
            }
          }

          return { comments: workflowComments };
        });
      },

      toggleCommentResolved: (commentId) => {
        set((state) => {
          const workflowComments = { ...state.comments };

          for (const workflowId in workflowComments) {
            const commentIndex = workflowComments[workflowId].findIndex(
              (c) => c.id === commentId
            );

            if (commentIndex !== -1) {
              const updatedComments = [...workflowComments[workflowId]];
              updatedComments[commentIndex] = {
                ...updatedComments[commentIndex],
                isResolved: !updatedComments[commentIndex].isResolved,
                updatedAt: now()
              };
              workflowComments[workflowId] = updatedComments;
              break;
            }
          }

          return { comments: workflowComments };
        });
      },

      selectComment: (commentId) => {
        set({ selectedCommentId: commentId });
      },

      getWorkflowComments: (workflowId) => {
        return get().comments[workflowId] || [];
      },

      getComment: (commentId) => {
        const comments = get().comments;
        for (const workflowId in comments) {
          const comment = comments[workflowId].find((c) => c.id === commentId);
          if (comment) {
            return comment;
          }
        }
        return undefined;
      },

      clearWorkflowComments: (workflowId) => {
        set((state) => {
          const workflowComments = { ...state.comments };
          delete workflowComments[workflowId];
          return { comments: workflowComments };
        });
      }
    }),
    {
      name: "workflow-comments-storage",
      partialize: (state) => ({
        comments: state.comments,
        selectedCommentId: null
      })
    }
  )
);
