import { create } from "zustand";
import { SearchToolNode } from "../utils/findSearchToolNodes";

/**
 * Drives the pre-run search-provider setup dialog. Opened when a run is blocked
 * because a node uses a web-search tool but no search provider is configured;
 * the dialog lets the user pick a provider and add its API key inline instead
 * of digging through Settings.
 */
interface SearchProviderCalloutState {
  open: boolean;
  /** Nodes that triggered the prompt, for context in the dialog. */
  nodes: SearchToolNode[];
  show: (nodes: SearchToolNode[]) => void;
  dismiss: () => void;
}

export const useSearchProviderCalloutStore = create<SearchProviderCalloutState>(
  (set) => ({
    open: false,
    nodes: [],
    show: (nodes) => set({ open: true, nodes }),
    dismiss: () => set({ open: false, nodes: [] })
  })
);

export default useSearchProviderCalloutStore;
