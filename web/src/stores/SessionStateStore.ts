/** @jsxImportSource @emotion/react */

import { create } from "zustand";
import { Node } from "@xyflow/react";
import { NodeData } from "./NodeData";

type SessionStateStore = {
  clipboardData: string | null;
  setClipboardData: (data: string | null) => void;
  isClipboardValid: boolean;
  setIsClipboardValid: (isValid: boolean) => void;
  leftPanelWidth: number;
  setLeftPanelWidth: (width: number) => void;
  rightPanelWidth: number;
  setRightPanelWidth: (width: number) => void;
};

const useSessionStateStore = create<SessionStateStore>((set) => ({
  // CLIPBOARD
  clipboardData: null,
  isClipboardValid: false,
  setClipboardData: (data) => set({ clipboardData: data }),
  setIsClipboardValid: (isValid) => set({ isClipboardValid: isValid }),
  // PANEL WIDTHS
  leftPanelWidth: 300,
  setLeftPanelWidth: (width: number) =>
    set({ leftPanelWidth: Math.max(width, 250) }),
  rightPanelWidth: 300,
  setRightPanelWidth: (width: number) =>
    set({ rightPanelWidth: Math.max(width, 140) })
}));

export default useSessionStateStore;
