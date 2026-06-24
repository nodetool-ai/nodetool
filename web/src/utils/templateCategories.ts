import { Workflow } from "../stores/ApiTypes";

interface TemplateCategory {
  id: string;
  label: string;
  tags: string[];
  /** Accent used to tint thumbnails and pills for this category. */
  color: string;
}

// Media-first curation. Order here is the order shown in the gallery, and the
// priority order for resolving a single category from a workflow's tags.
// Each category aggregates the listed raw tags from workflow metadata.
export const TOP_CATEGORIES: TemplateCategory[] = [
  { id: "image", label: "Image", tags: ["image", "design"], color: "#8b8ce8" },
  { id: "video", label: "Video", tags: ["video", "youtube"], color: "#E879F9" },
  { id: "audio", label: "Audio", tags: ["audio"], color: "#FFB86C" },
  {
    id: "multimodal",
    label: "Multimodal",
    tags: ["multimodal"],
    color: "#22D3EE"
  },
  {
    id: "agents",
    label: "Agents",
    tags: ["agent", "agents", "ai", "claude", "huggingface"],
    color: "#6690d4"
  },
  {
    id: "data-web",
    label: "Data & Web",
    tags: [
      "data",
      "web",
      "search",
      "serp",
      "google",
      "news",
      "reddit",
      "amazon",
      "trends",
      "analysis",
      "research",
      "rag"
    ],
    color: "#50FA7B"
  }
];

const GETTING_STARTED_TAGS = ["getting-started", "start"];

export const isGettingStarted = (workflow: Workflow): boolean => {
  const tags = workflow.tags || [];
  return tags.some((t) => GETTING_STARTED_TAGS.includes(t));
};

const matchesCategory = (
  workflow: Workflow,
  category: TemplateCategory
): boolean => {
  const tags = workflow.tags || [];
  const tagSet = new Set(tags);
  return category.tags.some((t) => tagSet.has(t));
};

/**
 * The single best-fit category for a workflow, by TOP_CATEGORIES priority
 * order. Used to tint template thumbnails by their dominant modality.
 */
export const getCategoryForWorkflow = (
  workflow: Workflow
): TemplateCategory | null => {
  return TOP_CATEGORIES.find((c) => matchesCategory(workflow, c)) ?? null;
};

export const workflowsForCategory = (
  workflows: Workflow[],
  categoryId: string
): Workflow[] => {
  const category = TOP_CATEGORIES.find((c) => c.id === categoryId);
  if (!category) {
    return [];
  }
  return workflows.filter((w) => matchesCategory(w, category));
};

