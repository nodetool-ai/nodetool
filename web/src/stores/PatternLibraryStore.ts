import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

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
  previewImage?: string;
}

interface PatternLibraryState {
  patterns: WorkflowPattern[];
  selectedCategory: string;
  searchTerm: string;
  isLoading: boolean;
  error: string | null;

  actions: {
    setSelectedCategory: (category: string) => void;
    setSearchTerm: (term: string) => void;
    getFilteredPatterns: () => WorkflowPattern[];
    getPatternById: (id: string) => WorkflowPattern | undefined;
    getCategories: () => string[];
  };
}

const SAMPLE_PATTERNS: WorkflowPattern[] = [
  {
    id: "text-to-image",
    name: "Text to Image Pipeline",
    description: "Generate images from text prompts using AI models",
    category: "Generative AI",
    tags: ["image", "generation", "stable diffusion", "text-to-image"],
    nodes: [
      {
        id: "text-input",
        type: "nodetool.input.TextInput",
        position: { x: 100, y: 200 },
        data: { value: "A beautiful sunset over mountains" }
      },
      {
        id: "model-select",
        type: "nodetool.model.ModelSelector",
        position: { x: 100, y: 100 },
        data: { model: "stabilityai/stable-diffusion-xl-base-1.0" }
      },
      {
        id: "image-generator",
        type: "nodetool.image.ImageGenerator",
        position: { x: 350, y: 150 },
        data: { width: 1024, height: 1024, steps: 50 }
      },
      {
        id: "image-output",
        type: "nodetool.output.ImageOutput",
        position: { x: 600, y: 150 },
        data: {}
      }
    ],
    edges: [
      { id: "e1", source: "text-input", target: "image-generator", sourceHandle: "output", targetHandle: "prompt" },
      { id: "e2", source: "model-select", target: "image-generator", sourceHandle: "output", targetHandle: "model" },
      { id: "e3", source: "image-generator", target: "image-output", sourceHandle: "image", targetHandle: "input" }
    ]
  },
  {
    id: "rag-workflow",
    name: "RAG Workflow",
    description: "Retrieval-Augmented Generation for question answering",
    category: "NLP",
    tags: ["rag", "retrieval", "qa", "llm", "vector database"],
    nodes: [
      {
        id: "user-query",
        type: "nodetool.input.TextInput",
        position: { x: 50, y: 200 },
        data: { value: "" }
      },
      {
        id: "embed-query",
        type: "nodetool.text.TextEmbedder",
        position: { x: 250, y: 200 },
        data: { model: "BAAI/bge-small-en-v1.5" }
      },
      {
        id: "vector-store",
        type: "nodetool.vector.VectorStore",
        position: { x: 450, y: 200 },
        data: { collection: "docs" }
      },
      {
        id: "llm",
        type: "nodetool.llm.LLMGenerator",
        position: { x: 650, y: 200 },
        data: { model: "meta-llama/Llama-3.1-8B-Instruct", temperature: 0.7 }
      },
      {
        id: "text-output",
        type: "nodetool.output.TextOutput",
        position: { x: 850, y: 200 },
        data: {}
      }
    ],
    edges: [
      { id: "e1", source: "user-query", target: "embed-query" },
      { id: "e2", source: "embed-query", target: "vector-store" },
      { id: "e3", source: "vector-store", target: "llm", sourceHandle: "context", targetHandle: "context" },
      { id: "e4", source: "user-query", target: "llm", sourceHandle: "output", targetHandle: "prompt" },
      { id: "e5", source: "llm", target: "text-output" }
    ]
  },
  {
    id: "image-analysis",
    name: "Multi-Modal Analysis",
    description: "Analyze images with vision models and extract insights",
    category: "Computer Vision",
    tags: ["vision", "analysis", "multi-modal", "clip"],
    nodes: [
      {
        id: "image-input",
        type: "nodetool.input.ImageInput",
        position: { x: 100, y: 200 },
        data: {}
      },
      {
        id: "clip-vision",
        type: "nodetool.vision.CLIPVision",
        position: { x: 300, y: 100 },
        data: { model: "openai/clip-vit-large-patch14" }
      },
      {
        id: "ocr",
        type: "nodetool.vision.OCR",
        position: { x: 300, y: 300 },
        data: {}
      },
      {
        id: "llm-analyze",
        type: "nodetool.llm.LLMGenerator",
        position: { x: 550, y: 200 },
        data: { model: "anthropic/claude-3.5-sonnet" }
      },
      {
        id: "text-output",
        type: "nodetool.output.TextOutput",
        position: { x: 750, y: 200 },
        data: {}
      }
    ],
    edges: [
      { id: "e1", source: "image-input", target: "clip-vision" },
      { id: "e2", source: "image-input", target: "ocr" },
      { id: "e3", source: "clip-vision", target: "llm-analyze", sourceHandle: "embedding", targetHandle: "context" },
      { id: "e4", source: "ocr", target: "llm-analyze", sourceHandle: "text", targetHandle: "prompt" },
      { id: "e5", source: "llm-analyze", target: "text-output" }
    ]
  },
  {
    id: "audio-transcription",
    name: "Audio Transcription",
    description: "Transcribe and summarize audio files",
    category: "Audio",
    tags: ["audio", "transcription", "whisper", "speech-to-text"],
    nodes: [
      {
        id: "audio-input",
        type: "nodetool.input.AudioInput",
        position: { x: 100, y: 200 },
        data: {}
      },
      {
        id: "transcriber",
        type: "nodetool.audio.AudioTranscriber",
        position: { x: 300, y: 200 },
        data: { model: "openai/whisper-large-v3" }
      },
      {
        id: "llm-summarize",
        type: "nodetool.llm.LLMGenerator",
        position: { x: 500, y: 200 },
        data: { model: "meta-llama/Llama-3.1-8B-Instruct" }
      },
      {
        id: "text-output",
        type: "nodetool.output.TextOutput",
        position: { x: 700, y: 200 },
        data: {}
      }
    ],
    edges: [
      { id: "e1", source: "audio-input", target: "transcriber" },
      { id: "e2", source: "transcriber", target: "llm-summarize", sourceHandle: "transcript", targetHandle: "prompt" },
      { id: "e3", source: "llm-summarize", target: "text-output" }
    ]
  },
  {
    id: "batch-processing",
    name: "Batch Processing Pipeline",
    description: "Process multiple files through a transformation pipeline",
    category: "Data Processing",
    tags: ["batch", "files", "processing", "automation"],
    nodes: [
      {
        id: "file-input",
        type: "nodetool.input.FileInput",
        position: { x: 100, y: 200 },
        data: { accept: "*.txt" }
      },
      {
        id: "text-cleaner",
        type: "nodetool.text.TextCleaner",
        position: { x: 300, y: 200 },
        data: { removeHtml: true, normalizeWhitespace: true }
      },
      {
        id: "text-output",
        type: "nodetool.output.FileOutput",
        position: { x: 500, y: 200 },
        data: { format: "txt" }
      }
    ],
    edges: [
      { id: "e1", source: "file-input", target: "text-cleaner" },
      { id: "e2", source: "text-cleaner", target: "text-output" }
    ]
  }
];

export const usePatternLibraryStore = create<PatternLibraryState>()(
  immer((set, get) => ({
    patterns: SAMPLE_PATTERNS,
    selectedCategory: "All",
    searchTerm: "",
    isLoading: false,
    error: null,

    actions: {
      setSelectedCategory: (category: string) => {
        set((state) => {
          state.selectedCategory = category;
        });
      },

      setSearchTerm: (term: string) => {
        set((state) => {
          state.searchTerm = term;
        });
      },

      getFilteredPatterns: () => {
        const { patterns, selectedCategory, searchTerm } = get();
        return patterns.filter((pattern) => {
          const matchesCategory = selectedCategory === "All" || pattern.category === selectedCategory;
          const matchesSearch = searchTerm === "" ||
            pattern.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            pattern.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
            pattern.tags.some((tag) => tag.toLowerCase().includes(searchTerm.toLowerCase()));
          return matchesCategory && matchesSearch;
        });
      },

      getPatternById: (id: string) => {
        return get().patterns.find((p) => p.id === id);
      },

      getCategories: () => {
        const categories = new Set(get().patterns.map((p) => p.category));
        return ["All", ...Array.from(categories).sort()];
      }
    }
  }))
);
