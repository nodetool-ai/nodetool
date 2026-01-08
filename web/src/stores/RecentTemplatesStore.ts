import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface RecentTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  lastUsed: number;
  useCount: number;
  thumbnail?: string;
  tags: string[];
}

export interface RecentTemplatesState {
  recentTemplates: RecentTemplate[];
  pinnedTemplates: string[];
  maxRecentTemplates: number;
  addTemplate: (template: Omit<RecentTemplate, "lastUsed" | "useCount">) => void;
  removeTemplate: (templateId: string) => void;
  pinTemplate: (templateId: string) => void;
  unpinTemplate: (templateId: string) => void;
  clearRecentTemplates: () => void;
  getSortedTemplates: () => RecentTemplate[];
  getTemplatesByCategory: (category: string) => RecentTemplate[];
}

const MAX_RECENT_TEMPLATES = 20;

export const useRecentTemplatesStore = create<RecentTemplatesState>()(
  persist(
    (set, get) => ({
      recentTemplates: [],
      pinnedTemplates: [],
      maxRecentTemplates: MAX_RECENT_TEMPLATES,

      addTemplate: (template) =>
        set((state) => {
          const existingIndex = state.recentTemplates.findIndex(
            (t) => t.id === template.id
          );

          let updatedTemplates: RecentTemplate[];

          if (existingIndex >= 0) {
            updatedTemplates = [...state.recentTemplates];
            updatedTemplates[existingIndex] = {
              ...updatedTemplates[existingIndex],
              lastUsed: Date.now(),
              useCount: updatedTemplates[existingIndex].useCount + 1,
            };
          } else {
            const newTemplate: RecentTemplate = {
              ...template,
              lastUsed: Date.now(),
              useCount: 1,
            };
            updatedTemplates = [newTemplate, ...state.recentTemplates];
          }

          updatedTemplates.sort((a, b) => {
            const aPinned = state.pinnedTemplates.includes(a.id);
            const bPinned = state.pinnedTemplates.includes(b.id);
            if (aPinned && !bPinned) return -1;
            if (!aPinned && bPinned) return 1;
            return b.useCount - a.useCount;
          });

          updatedTemplates = updatedTemplates.slice(0, state.maxRecentTemplates);

          return { recentTemplates: updatedTemplates };
        }),

      removeTemplate: (templateId) =>
        set((state) => ({
          recentTemplates: state.recentTemplates.filter(
            (t) => t.id !== templateId
          ),
          pinnedTemplates: state.pinnedTemplates.filter(
            (id) => id !== templateId
          ),
        })),

      pinTemplate: (templateId) =>
        set((state) => {
          if (state.pinnedTemplates.includes(templateId)) {
            return state;
          }
          return {
            pinnedTemplates: [...state.pinnedTemplates, templateId],
          };
        }),

      unpinTemplate: (templateId) =>
        set((state) => ({
          pinnedTemplates: state.pinnedTemplates.filter((id) => id !== templateId),
        })),

      clearRecentTemplates: () =>
        set({ recentTemplates: [], pinnedTemplates: [] }),

      getSortedTemplates: () => {
        const state = get();
        return [...state.recentTemplates].sort((a, b) => {
          const aPinned = state.pinnedTemplates.includes(a.id);
          const bPinned = state.pinnedTemplates.includes(b.id);
          if (aPinned && !bPinned) return -1;
          if (!aPinned && bPinned) return 1;
          return b.lastUsed - a.lastUsed;
        });
      },

      getTemplatesByCategory: (category) => {
        const state = get();
        return state.recentTemplates.filter((t) => t.category === category);
      },
    }),
    {
      name: "recent-templates-storage",
      partialize: (state) => ({
        recentTemplates: state.recentTemplates,
        pinnedTemplates: state.pinnedTemplates,
      }),
    }
  )
);

export default useRecentTemplatesStore;
