import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { nanoid } from 'nanoid';

export interface PatternNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface PatternEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface WorkflowPattern {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  nodes: PatternNode[];
  edges: PatternEdge[];
  createdAt: number;
  updatedAt: number;
  usageCount: number;
}

interface PatternStoreState {
  patterns: WorkflowPattern[];
  selectedPatternId: string | null;
  searchQuery: string;
  selectedCategory: string | null;
}

interface PatternStoreActions {
  addPattern: (pattern: Omit<WorkflowPattern, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>) => string;
  updatePattern: (id: string, updates: Partial<WorkflowPattern>) => void;
  deletePattern: (id: string) => void;
  duplicatePattern: (id: string) => string;
  selectPattern: (id: string | null) => void;
  setSearchQuery: (query: string) => void;
  setSelectedCategory: (category: string | null) => void;
  incrementUsage: (id: string) => void;
  getPatternById: (id: string) => WorkflowPattern | undefined;
  getPatternsByCategory: (category: string) => WorkflowPattern[];
  searchPatterns: (query: string) => WorkflowPattern[];
  getCategories: () => string[];
}

type PatternStore = PatternStoreState & PatternStoreActions;

const DEFAULT_PATTERNS: WorkflowPattern[] = [
  {
    id: 'pattern-1',
    name: 'Image Processing Pipeline',
    description: 'Load image, resize, apply filter, save output',
    category: 'Media',
    tags: ['image', 'processing', 'resize', 'filter'],
    nodes: [
      { id: 'n1', type: 'nodetool.input.ImageInput', position: { x: 100, y: 100 }, data: {} },
      { id: 'n2', type: 'nodetool.image.Resize', position: { x: 300, y: 100 }, data: { width: 512, height: 512 } },
      { id: 'n3', type: 'nodetool.image.Grayscale', position: { x: 500, y: 100 }, data: {} },
      { id: 'n4', type: 'nodetool.output.ImageOutput', position: { x: 700, y: 100 }, data: {} },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
      { id: 'e3', source: 'n3', target: 'n4' },
    ],
    createdAt: Date.now() - 86400000,
    updatedAt: Date.now() - 86400000,
    usageCount: 5,
  },
  {
    id: 'pattern-2',
    name: 'Text Summarization',
    description: 'Load text, summarize with LLM, output summary',
    category: 'Text',
    tags: ['text', 'llm', 'summarization', 'chat'],
    nodes: [
      { id: 'n1', type: 'nodetool.input.TextInput', position: { x: 100, y: 100 }, data: {} },
      { id: 'n2', type: 'nodetool.llm.BaseLLM', position: { x: 300, y: 100 }, data: { model: 'llama3' } },
      { id: 'n3', type: 'nodetool.output.TextOutput', position: { x: 500, y: 100 }, data: {} },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
    ],
    createdAt: Date.now() - 172800000,
    updatedAt: Date.now() - 172800000,
    usageCount: 12,
  },
  {
    id: 'pattern-3',
    name: 'Audio Recording to Transcription',
    description: 'Record audio, transcribe with Whisper, display text',
    category: 'Audio',
    tags: ['audio', 'transcription', 'whisper', 'recording'],
    nodes: [
      { id: 'n1', type: 'nodetool.input.AudioInput', position: { x: 100, y: 100 }, data: {} },
      { id: 'n2', type: 'nodetool.audio.Transcribe', position: { x: 300, y: 100 }, data: { model: 'whisper' } },
      { id: 'n3', type: 'nodetool.output.TextOutput', position: { x: 500, y: 100 }, data: {} },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
    ],
    createdAt: Date.now() - 259200000,
    updatedAt: Date.now() - 259200000,
    usageCount: 8,
  },
];

export const usePatternStore = create<PatternStore>()(
  persist(
    (set, get) => ({
      patterns: DEFAULT_PATTERNS,
      selectedPatternId: null,
      searchQuery: '',
      selectedCategory: null,

      addPattern: (patternData) => {
        const id = `pattern-${nanoid(8)}`;
        const now = Date.now();
        const newPattern: WorkflowPattern = {
          ...patternData,
          id,
          createdAt: now,
          updatedAt: now,
          usageCount: 0,
        };
        set((state) => ({
          patterns: [...state.patterns, newPattern],
        }));
        return id;
      },

      updatePattern: (id, updates) => {
        set((state) => ({
          patterns: state.patterns.map((p) =>
            p.id === id
              ? { ...p, ...updates, updatedAt: Date.now() }
              : p
          ),
        }));
      },

      deletePattern: (id) => {
        set((state) => ({
          patterns: state.patterns.filter((p) => p.id !== id),
          selectedPatternId: state.selectedPatternId === id ? null : state.selectedPatternId,
        }));
      },

      duplicatePattern: (id) => {
        const pattern = get().patterns.find((p) => p.id === id);
        if (!pattern) return '';
        const newId = get().addPattern({
          ...pattern,
          name: `${pattern.name} (Copy)`,
          nodes: pattern.nodes.map((n) => ({ ...n, id: `${n.id}-copy` })),
          edges: pattern.edges.map((e) => ({
            ...e,
            id: `${e.id}-copy`,
            source: `${e.source}-copy`,
            target: `${e.target}-copy`,
          })),
        });
        return newId;
      },

      selectPattern: (id) => {
        set({ selectedPatternId: id });
      },

      setSearchQuery: (query) => {
        set({ searchQuery: query });
      },

      setSelectedCategory: (category) => {
        set({ selectedCategory: category });
      },

      incrementUsage: (id) => {
        set((state) => ({
          patterns: state.patterns.map((p) =>
            p.id === id ? { ...p, usageCount: p.usageCount + 1 } : p
          ),
        }));
      },

      getPatternById: (id) => {
        return get().patterns.find((p) => p.id === id);
      },

      getPatternsByCategory: (category) => {
        return get().patterns.filter((p) => p.category === category);
      },

      searchPatterns: (query) => {
        const lowerQuery = query.toLowerCase();
        return get().patterns.filter(
          (p) =>
            p.name.toLowerCase().includes(lowerQuery) ||
            p.description.toLowerCase().includes(lowerQuery) ||
            p.tags.some((tag) => tag.toLowerCase().includes(lowerQuery)) ||
            p.category.toLowerCase().includes(lowerQuery)
        );
      },

      getCategories: () => {
        const categories = new Set(get().patterns.map((p) => p.category));
        return Array.from(categories).sort();
      },
    }),
    {
      name: 'nodetool-patterns',
      storage: createJSONStorage(() => localStorage),
    }
  )
);

export const getPatternCategories = (patterns: WorkflowPattern[]): string[] => {
  const categories = new Set(patterns.map((p) => p.category));
  return Array.from(categories).sort();
};
