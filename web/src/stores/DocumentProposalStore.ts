/**
 * Staged agent proposal state for open documents (document editor PRD D2, R8,
 * R9). Holds pending assistant proposals per document asset and persists the
 * direct-apply preference across sessions.
 */
import { create } from "zustand";

export const DOCUMENT_DIRECT_APPLY_STORAGE_KEY =
  "nodetool_document_direct_apply";

export interface DocumentProposal {
  proposalId: string;
  assetId: string;
  threadId: string;
  turnId: string;
  baseContent: string;
  proposedContent: string;
  draftContent: string;
  receivedAt: number;
}

export interface DocumentProposalState {
  directApply: boolean;
  proposals: Record<string, DocumentProposal>;
  queuedProposals: Record<string, DocumentProposal>;
  setDirectApply: (value: boolean) => void;
  setProposal: (proposal: DocumentProposal) => void;
  updateDraft: (assetId: string, draftContent: string) => void;
  acceptQueuedProposal: (assetId: string) => void;
  dismissQueuedProposal: (assetId: string) => void;
  clearProposal: (assetId: string) => void;
}

function readDirectApply(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return window.localStorage.getItem(DOCUMENT_DIRECT_APPLY_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function writeDirectApply(value: boolean): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(DOCUMENT_DIRECT_APPLY_STORAGE_KEY, String(value));
  } catch {
    // Ignore storage quota or private browsing errors.
  }
}

export const useDocumentProposalStore = create<DocumentProposalState>((set) => ({
  directApply: readDirectApply(),
  proposals: {},
  queuedProposals: {},
  setDirectApply: (value) => {
    writeDirectApply(value);
    set({ directApply: value });
  },
  setProposal: (proposal) =>
    set((state) => {
      const existing = state.proposals[proposal.assetId];
      if (
        existing &&
        existing.draftContent !== existing.proposedContent &&
        existing.proposalId !== proposal.proposalId
      ) {
        return {
          queuedProposals: {
            ...state.queuedProposals,
            [proposal.assetId]: proposal
          }
        };
      }
      const nextQueued =
        proposal.assetId in state.queuedProposals
          ? { ...state.queuedProposals }
          : state.queuedProposals;
      if (proposal.assetId in state.queuedProposals) {
        delete nextQueued[proposal.assetId];
      }
      return {
        proposals: {
          ...state.proposals,
          [proposal.assetId]: proposal
        },
        queuedProposals: nextQueued
      };
    }),
  updateDraft: (assetId, draftContent) =>
    set((state) => {
      const existing = state.proposals[assetId];
      if (!existing) {
        return state;
      }
      return {
        proposals: {
          ...state.proposals,
          [assetId]: {
            ...existing,
            draftContent
          }
        }
      };
    }),
  acceptQueuedProposal: (assetId) =>
    set((state) => {
      const queued = state.queuedProposals[assetId];
      if (!queued) {
        return state;
      }
      const nextQueued = { ...state.queuedProposals };
      delete nextQueued[assetId];
      return {
        proposals: {
          ...state.proposals,
          [assetId]: queued
        },
        queuedProposals: nextQueued
      };
    }),
  dismissQueuedProposal: (assetId) =>
    set((state) => {
      if (!(assetId in state.queuedProposals)) {
        return state;
      }
      const nextQueued = { ...state.queuedProposals };
      delete nextQueued[assetId];
      return { queuedProposals: nextQueued };
    }),
  clearProposal: (assetId) =>
    set((state) => {
      const hasProposal = assetId in state.proposals;
      const hasQueued = assetId in state.queuedProposals;
      if (!hasProposal && !hasQueued) {
        return state;
      }
      const nextProposals = hasProposal
        ? { ...state.proposals }
        : state.proposals;
      if (hasProposal) {
        delete nextProposals[assetId];
      }
      const nextQueued = hasQueued
        ? { ...state.queuedProposals }
        : state.queuedProposals;
      if (hasQueued) {
        delete nextQueued[assetId];
      }
      return {
        proposals: nextProposals,
        queuedProposals: nextQueued
      };
    })
}));
