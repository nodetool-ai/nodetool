/**
 * NodeTemplatesStore manages the state and behavior of the node templates dialog.
 * Node templates are pre-built node patterns that users can quickly insert into their workflows.
 */

import { create } from "zustand";

/**
 * Represents a single node configuration within a template
 */
export interface TemplateNode {
  /** The type of node to create (e.g., "nodetool.text.GenerateText") */
  type: string;
  /** Position offset from the insertion point (in pixels) */
  position: { x: number; y: number };
  /** Optional: Custom name for the node */
  label?: string;
  /** Optional: Default property values for the node */
  properties?: Record<string, unknown>;
}

/**
 * Represents a connection between two nodes in a template
 */
export interface TemplateConnection {
  /** The ID of the source node (index in the nodes array, stringified) */
  source: string;
  /** The ID of the target node (index in the nodes array, stringified) */
  target: string;
  /** The output handle ID on the source node */
  sourceHandle: string;
  /** The input handle ID on the target node */
  targetHandle: string;
}

/**
 * Represents a reusable node template
 */
export interface NodeTemplate {
  /** Unique identifier for the template */
  id: string;
  /** Display name for the template */
  name: string;
  /** Brief description of what the template does */
  description: string;
  /** Category for grouping templates (e.g., "Text", "Image", "Audio", "Logic") */
  category: TemplateCategory;
  /** The nodes that make up this template */
  nodes: TemplateNode[];
  /** Connections between the nodes */
  connections: TemplateConnection[];
  /** Optional: Icon name for visual representation */
  iconName?: string;
}

/**
 * Categories for organizing node templates
 */
export type TemplateCategory =
  | "Text"
  | "Image"
  | "Audio"
  | "Video"
  | "Logic"
  | "Data"
  | "All";

/**
 * Built-in node templates provided by the application
 */
export const BUILT_IN_TEMPLATES: NodeTemplate[] = [
  {
    id: "text-to-text",
    name: "Text to Text",
    description: "Generate text from text using an LLM",
    category: "Text",
    nodes: [
      {
        type: "nodetool.text.Constant",
        position: { x: 0, y: 0 },
        properties: { value: "Hello, world!" }
      },
      {
        type: "nodetool.text.GenerateText",
        position: { x: 300, y: 0 },
        label: "Generate Text"
      }
    ],
    connections: [
      {
        source: "0",
        target: "1",
        sourceHandle: "output",
        targetHandle: "text"
      }
    ]
  },
  {
    id: "text-to-image",
    name: "Text to Image",
    description: "Generate an image from a text prompt",
    category: "Image",
    nodes: [
      {
        type: "nodetool.text.Constant",
        position: { x: 0, y: 0 },
        properties: { value: "A serene landscape" }
      },
      {
        type: "nodetool.image.GenerateImage",
        position: { x: 300, y: 0 },
        label: "Generate Image"
      }
    ],
    connections: [
      {
        source: "0",
        target: "1",
        sourceHandle: "output",
        targetHandle: "prompt"
      }
    ]
  },
  {
    id: "text-to-audio",
    name: "Text to Audio",
    description: "Generate audio from text using TTS",
    category: "Audio",
    nodes: [
      {
        type: "nodetool.text.Constant",
        position: { x: 0, y: 0 },
        properties: { value: "Hello, this is a test." }
      },
      {
        type: "nodetool.audio.TextToSpeech",
        position: { x: 300, y: 0 },
        label: "Text to Speech"
      }
    ],
    connections: [
      {
        source: "0",
        target: "1",
        sourceHandle: "output",
        targetHandle: "text"
      }
    ]
  },
  {
    id: "image-to-image",
    name: "Image to Image",
    description: "Transform an image with a text prompt",
    category: "Image",
    nodes: [
      {
        type: "nodetool.image.LoadImage",
        position: { x: 0, y: 0 },
        label: "Load Image"
      },
      {
        type: "nodetool.text.Constant",
        position: { x: 0, y: 150 },
        properties: { value: "Make it brighter" }
      },
      {
        type: "nodetool.image.EditImage",
        position: { x: 300, y: 75 },
        label: "Edit Image"
      }
    ],
    connections: [
      {
        source: "0",
        target: "2",
        sourceHandle: "image",
        targetHandle: "image"
      },
      {
        source: "1",
        target: "2",
        sourceHandle: "output",
        targetHandle: "prompt"
      }
    ]
  },
  {
    id: "conditional-branch",
    name: "Conditional Branch",
    description: "Route data based on a condition",
    category: "Logic",
    nodes: [
      {
        type: "nodetool.text.Constant",
        position: { x: 0, y: 0 },
        properties: { value: "42" }
      },
      {
        type: "nodetool.text.Constant",
        position: { x: 0, y: 100 },
        properties: { value: "10" }
      },
      {
        type: "nodetool.control.Compare",
        position: { x: 300, y: 50 },
        label: "Compare"
      }
    ],
    connections: [
      {
        source: "0",
        target: "2",
        sourceHandle: "output",
        targetHandle: "a"
      },
      {
        source: "1",
        target: "2",
        sourceHandle: "output",
        targetHandle: "b"
      }
    ]
  },
  {
    id: "batch-text",
    name: "Batch Text Processing",
    description: "Process multiple text inputs with an LLM",
    category: "Text",
    nodes: [
      {
        type: "nodetool.text.Constant",
        position: { x: 0, y: 0 },
        properties: {
          value: "Item 1\nItem 2\nItem 3"
        }
      },
      {
        type: "nodetool.text.SplitText",
        position: { x: 300, y: 0 },
        label: "Split Text"
      },
      {
        type: "nodetool.text.GenerateText",
        position: { x: 600, y: 0 },
        label: "Process Each"
      }
    ],
    connections: [
      {
        source: "0",
        target: "1",
        sourceHandle: "output",
        targetHandle: "text"
      },
      {
        source: "1",
        target: "2",
        sourceHandle: "lines",
        targetHandle: "text"
      }
    ]
  }
];

/**
 * Store state for the node templates dialog
 */
export type NodeTemplatesStore = {
  /** Whether the templates dialog is currently open */
  isOpen: boolean;
  /** Opens the templates dialog */
  openDialog: () => void;
  /** Closes the templates dialog */
  closeDialog: () => void;
  /** Currently selected category filter */
  selectedCategory: TemplateCategory;
  /** Sets the category filter */
  setSelectedCategory: (category: TemplateCategory) => void;
  /** Current search term */
  searchTerm: string;
  /** Sets the search term */
  setSearchTerm: (term: string) => void;
  /** Index of the currently selected template (for keyboard navigation) */
  selectedIndex: number;
  /** Sets the selected template index */
  setSelectedIndex: (index: number) => void;
  /** Moves selection to the previous template */
  moveSelectionUp: () => void;
  /** Moves selection to the next template */
  moveSelectionDown: () => void;
  /** Gets the currently selected template */
  getSelectedTemplate: () => NodeTemplate | null;
  /** All available templates */
  templates: NodeTemplate[];
  /** Templates filtered by current search and category */
  filteredTemplates: NodeTemplate[];
  /** Updates the filtered templates based on search and category */
  updateFilteredTemplates: () => void;
  /** Position where the template should be inserted */
  insertPosition: { x: number; y: number };
  /** Sets the insert position */
  setInsertPosition: (position: { x: number; y: number }) => void;
};

/**
 * Creates the node templates store
 */
export const useNodeTemplatesStore = create<NodeTemplatesStore>((set, get) => {
  return {
    isOpen: false,
    selectedCategory: "All",
    searchTerm: "",
    selectedIndex: 0,
    templates: BUILT_IN_TEMPLATES,
    filteredTemplates: BUILT_IN_TEMPLATES,
    insertPosition: { x: 100, y: 100 },

    openDialog: () => {
      set({
        isOpen: true,
        selectedIndex: 0,
        searchTerm: "",
        selectedCategory: "All"
      });
      get().updateFilteredTemplates();
    },

    closeDialog: () => {
      set({
        isOpen: false,
        searchTerm: "",
        selectedCategory: "All",
        selectedIndex: 0
      });
    },

    setSelectedCategory: (category) => {
      set({ selectedCategory: category, selectedIndex: 0 });
      get().updateFilteredTemplates();
    },

    setSearchTerm: (term) => {
      set({ searchTerm: term, selectedIndex: 0 });
      get().updateFilteredTemplates();
    },

    setSelectedIndex: (index) => {
      set({ selectedIndex: index });
    },

    moveSelectionUp: () => {
      const { filteredTemplates, selectedIndex } = get();
      if (filteredTemplates.length === 0) {
        return;
      }
      const newIndex = selectedIndex <= 0 ? filteredTemplates.length - 1 : selectedIndex - 1;
      set({ selectedIndex: newIndex });
    },

    moveSelectionDown: () => {
      const { filteredTemplates, selectedIndex } = get();
      if (filteredTemplates.length === 0) {
        return;
      }
      const newIndex = selectedIndex >= filteredTemplates.length - 1 ? 0 : selectedIndex + 1;
      set({ selectedIndex: newIndex });
    },

    getSelectedTemplate: () => {
      const { filteredTemplates, selectedIndex } = get();
      if (selectedIndex < 0 || selectedIndex >= filteredTemplates.length) {
        return null;
      }
      return filteredTemplates[selectedIndex];
    },

    setInsertPosition: (position) => {
      set({ insertPosition: position });
    },

    updateFilteredTemplates: () => {
      const { templates, searchTerm, selectedCategory } = get();
      let filtered = templates;

      // Filter by category
      if (selectedCategory !== "All") {
        filtered = filtered.filter((t) => t.category === selectedCategory);
      }

      // Filter by search term
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        filtered = filtered.filter(
          (t) =>
            t.name.toLowerCase().includes(term) ||
            t.description.toLowerCase().includes(term) ||
            t.category.toLowerCase().includes(term)
        );
      }

      set({ filteredTemplates: filtered, selectedIndex: 0 });
    }
  };
});

export default useNodeTemplatesStore;
