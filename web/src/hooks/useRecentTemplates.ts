import { useCallback } from "react";
import useRecentTemplatesStore, {
  RecentTemplate,
} from "../stores/RecentTemplatesStore";

export interface UseRecentTemplatesReturn {
  recentTemplates: RecentTemplate[];
  pinnedTemplateIds: string[];
  addTemplate: (template: Omit<RecentTemplate, "lastUsed" | "useCount">) => void;
  removeTemplate: (templateId: string) => void;
  pinTemplate: (templateId: string) => void;
  unpinTemplate: (templateId: string) => void;
  clearRecentTemplates: () => void;
  getSortedTemplates: () => RecentTemplate[];
  getTemplatesByCategory: (category: string) => RecentTemplate[];
  getPopularTemplates: (limit?: number) => RecentTemplate[];
  getPinnedTemplates: () => RecentTemplate[];
  isPinned: (templateId: string) => boolean;
}

export const useRecentTemplates = (): UseRecentTemplatesReturn => {
  const recentTemplates = useRecentTemplatesStore((state) => state.recentTemplates);
  const pinnedTemplates = useRecentTemplatesStore((state) => state.pinnedTemplates);
  const addTemplate = useRecentTemplatesStore((state) => state.addTemplate);
  const removeTemplate = useRecentTemplatesStore((state) => state.removeTemplate);
  const pinTemplate = useRecentTemplatesStore((state) => state.pinTemplate);
  const unpinTemplate = useRecentTemplatesStore((state) => state.unpinTemplate);
  const clearRecentTemplates = useRecentTemplatesStore((state) => state.clearRecentTemplates);
  const getSortedTemplates = useRecentTemplatesStore((state) => state.getSortedTemplates);
  const getTemplatesByCategory = useRecentTemplatesStore((state) => state.getTemplatesByCategory);

  const getPopularTemplates = useCallback(
    (limit: number = 5) => {
      return [...recentTemplates]
        .sort((a, b) => b.useCount - a.useCount)
        .slice(0, limit);
    },
    [recentTemplates]
  );

  const getPinnedTemplates = useCallback(() => {
    return recentTemplates.filter((t) => pinnedTemplates.includes(t.id));
  }, [recentTemplates, pinnedTemplates]);

  const isPinned = useCallback(
    (templateId: string) => {
      return pinnedTemplates.includes(templateId);
    },
    [pinnedTemplates]
  );

  return {
    recentTemplates,
    pinnedTemplateIds: pinnedTemplates,
    addTemplate,
    removeTemplate,
    pinTemplate,
    unpinTemplate,
    clearRecentTemplates,
    getSortedTemplates,
    getTemplatesByCategory,
    getPopularTemplates,
    getPinnedTemplates,
    isPinned,
  };
};

export default useRecentTemplates;
