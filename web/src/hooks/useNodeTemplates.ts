import { useNodeTemplatesStore, type NodeTemplate, type CreateTemplateData } from "../stores/NodeTemplatesStore";

interface UseNodeTemplatesReturn {
  // Template CRUD
  createTemplate: (data: CreateTemplateData) => NodeTemplate;
  updateTemplate: (id: string, data: Partial<Omit<NodeTemplate, "id" | "createdAt">>) => void;
  deleteTemplate: (id: string) => void;
  duplicateTemplate: (id: string) => NodeTemplate;

  // Template queries
  getTemplate: (id: string) => NodeTemplate | undefined;
  getTemplatesByCategory: (category: string) => NodeTemplate[];
  getAllTemplates: () => NodeTemplate[];
  getTemplateCategories: () => string[];
  searchTemplates: (query: string) => NodeTemplate[];

  // Usage tracking
  incrementUsage: (id: string) => void;

  // Import/Export
  importTemplates: (templates: NodeTemplate[]) => void;
  exportTemplates: () => string;
  clearAllTemplates: () => void;
}

export const useNodeTemplates = (): UseNodeTemplatesReturn => {
  const {
    createTemplate: createTemplateFromStore,
    updateTemplate,
    deleteTemplate,
    duplicateTemplate,
    getTemplate,
    getTemplatesByCategory,
    getAllTemplates,
    getTemplateCategories,
    searchTemplates,
    incrementUsage,
    importTemplates,
    exportTemplates,
    clearAllTemplates
  } = useNodeTemplatesStore((state) => ({
    createTemplate: state.createTemplate,
    updateTemplate: state.updateTemplate,
    deleteTemplate: state.deleteTemplate,
    duplicateTemplate: state.duplicateTemplate,
    getTemplate: state.getTemplate,
    getTemplatesByCategory: state.getTemplatesByCategory,
    getAllTemplates: state.getAllTemplates,
    getTemplateCategories: state.getTemplateCategories,
    searchTemplates: state.searchTemplates,
    incrementUsage: state.incrementUsage,
    importTemplates: state.importTemplates,
    exportTemplates: state.exportTemplates,
    clearAllTemplates: state.clearAllTemplates
  }));

  return {
    createTemplate: createTemplateFromStore,
    updateTemplate,
    deleteTemplate,
    duplicateTemplate,
    getTemplate,
    getTemplatesByCategory,
    getAllTemplates,
    getTemplateCategories,
    searchTemplates,
    incrementUsage,
    importTemplates,
    exportTemplates,
    clearAllTemplates
  };
};

export default useNodeTemplates;
