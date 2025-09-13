/** @jsxImportSource @emotion/react */

import { create } from "zustand";

type SessionStateStore = {
  clipboardData: string | null;
  setClipboardData: (data: string | null) => void;
  isClipboardValid: boolean;
  setIsClipboardValid: (isValid: boolean) => void;
};

const useSessionStateStore = create<SessionStateStore>((set) => ({
  clipboardData: null,
  isClipboardValid: false,
  setClipboardData: (data) => set({ clipboardData: data }),
  setIsClipboardValid: (isValid) => set({ isClipboardValid: isValid })
}));

export default useSessionStateStore;
