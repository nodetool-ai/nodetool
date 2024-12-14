import { create } from "zustand";

interface SelectStore {
  activeSelect: string | null;
  open: (selectId: string) => void;
  close: () => void;
}

const useSelect = create<SelectStore>((set) => ({
  activeSelect: null,
  open: (selectId: string) => set({ activeSelect: selectId }),
  close: () => set({ activeSelect: null })
}));

export default useSelect;
