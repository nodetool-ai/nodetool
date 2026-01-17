/**
 * WorkflowDiffStore manages state for workflow version comparison.
 *
 * Responsibilities:
 * - Store diff state between two workflow versions
 * - Track which version is being compared (left/right)
 * - Provide computed diff data for the UI
 */

import { create } from "zustand";

export type DiffNodeStatus = "added" | "removed" | "modified" | "unchanged";

export interface DiffNode {
  id: string;
  type: string;
  status: DiffNodeStatus;
  label?: string;
  originalData?: Record<string, unknown>;
  modifiedData?: Record<string, unknown>;
}

export interface DiffEdge {
  id: string;
  source: string;
  target: string;
  status: DiffNodeStatus;
}

export interface WorkflowDiff {
  nodes: DiffNode[];
  edges: DiffEdge[];
  summary: {
    added: number;
    removed: number;
    modified: number;
    unchanged: number;
  };
}

interface WorkflowDiffState {
  isOpen: boolean;
  leftVersionId: string | null;
  rightVersionId: string | null;
  diff: WorkflowDiff | null;

  openDiff: (leftId: string, rightId: string) => void;
  closeDiff: () => void;
  setDiff: (diff: WorkflowDiff) => void;
  clearDiff: () => void;
}

export const useWorkflowDiffStore = create<WorkflowDiffState>((set) => ({
  isOpen: false,
  leftVersionId: null,
  rightVersionId: null,
  diff: null,

  openDiff: (leftId: string, rightId: string): void => {
    set({
      isOpen: true,
      leftVersionId: leftId,
      rightVersionId: rightId,
      diff: null
    });
  },

  closeDiff: (): void => {
    set({
      isOpen: false,
      leftVersionId: null,
      rightVersionId: null,
      diff: null
    });
  },

  setDiff: (diff: WorkflowDiff): void => {
    set({ diff });
  },

  clearDiff: (): void => {
    set({ diff: null });
  }
}));
