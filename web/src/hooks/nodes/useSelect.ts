import { create } from "zustand";

/**
 * Store for managing node selection state in the editor.
 */
interface SelectStore {
  /** The ID of the currently active select component */
  activeSelect: string | null;
  /** Current search query for filtering select options */
  searchQuery: string;
  /** Opens a select component with the given ID */
  open: (selectId: string) => void;
  /** Closes the currently open select component */
  close: () => void;
  /** Sets the search query for filtering options */
  setSearchQuery: (query: string) => void;
}

/**
 * Zustand store for managing node selection state.
 * 
 * Tracks which select dropdown is currently active and manages
 * search filtering within select components.
 * 
 * @example
 * ```typescript
 * const { open, close, activeSelect, setSearchQuery } = useSelect();
 * 
 * // Open a select component
 * open("model-select");
 * 
 * // Close it
 * close();
 * 
 * // Filter options
 * setSearchQuery("gpt");
 * ```
 */
const useSelect = create<SelectStore>((set) => ({
  activeSelect: null,
  searchQuery: "",
  open: (selectId: string) => set({ activeSelect: selectId }),
  close: () => set({ activeSelect: null, searchQuery: "" }),
  setSearchQuery: (query: string) => set({ searchQuery: query })
}));

export default useSelect;
