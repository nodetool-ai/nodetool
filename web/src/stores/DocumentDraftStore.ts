import { create } from "zustand";

interface CodeDraft {
  code: string;
  dirty: boolean;
  writtenCode: string | null;
}

interface DocumentDraftState {
  dirtyTabs: Record<string, boolean>;
  savingTabs: Record<string, boolean>;
  setSaving: (tabId: string, saving: boolean) => void;
  codeDrafts: Record<string, CodeDraft>;
  discardDraft: (tabId: string) => void;
  setDirty: (tabId: string, dirty: boolean) => void;
  setCodeDraft: (sequenceId: string, draft: CodeDraft) => void;
}

/** Drafts outlive responsive editor hosts and workspace mode changes. */
export const useDocumentDraftStore = create<DocumentDraftState>((set) => ({
  dirtyTabs: {},
  savingTabs: {},
  setSaving: (tabId, saving) =>
    set((state) => ({ savingTabs: { ...state.savingTabs, [tabId]: saving } })),
  codeDrafts: {},
  discardDraft: (tabId) =>
    set((state) => {
      const dirtyTabs = { ...state.dirtyTabs };
      const codeDrafts = { ...state.codeDrafts };
      const savingTabs = { ...state.savingTabs };
      delete dirtyTabs[tabId];
      delete savingTabs[tabId];
      if (tabId.startsWith("timeline:")) {
        delete codeDrafts[tabId.slice("timeline:".length)];
      }
      return { dirtyTabs, savingTabs, codeDrafts };
    }),
  setDirty: (tabId, dirty) =>
    set((state) => ({
      dirtyTabs: { ...state.dirtyTabs, [tabId]: dirty }
    })),
  setCodeDraft: (sequenceId, draft) =>
    set((state) => ({
      codeDrafts: { ...state.codeDrafts, [sequenceId]: draft },
      dirtyTabs: { ...state.dirtyTabs, [`timeline:${sequenceId}`]: draft.dirty }
    }))
}));
