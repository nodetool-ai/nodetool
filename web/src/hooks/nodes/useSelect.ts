import { create } from "zustand";

interface SelectStore {
  activeSelect: string | null;
  searchQuery: string;
  open: (selectId: string) => void;
  close: () => void;
  setSearchQuery: (query: string) => void;
}

const useSelect = create<SelectStore>((set) => ({
  activeSelect: null,
  searchQuery: "",
  open: (selectId: string) => set({ activeSelect: selectId }),
  close: () => set({ activeSelect: null, searchQuery: "" }),
  setSearchQuery: (query: string) => set({ searchQuery: query })
}));

export default useSelect;
