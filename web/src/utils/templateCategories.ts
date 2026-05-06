import { Workflow } from "../stores/ApiTypes";

export interface TemplateCategory {
  id: string;
  label: string;
  tags: string[];
}

// Media-first curation. Order here is the order shown in the gallery.
// Each category aggregates the listed raw tags from workflow metadata.
export const TOP_CATEGORIES: TemplateCategory[] = [
  { id: "image", label: "Image", tags: ["image", "design"] },
  { id: "video", label: "Video", tags: ["video", "youtube"] },
  { id: "audio", label: "Audio", tags: ["audio"] },
  { id: "multimodal", label: "Multimodal", tags: ["multimodal"] },
  {
    id: "agents",
    label: "Agents",
    tags: ["agent", "agents", "ai", "claude", "huggingface"]
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
    ]
  }
];

const TOP_TAG_SET = new Set(TOP_CATEGORIES.flatMap((c) => c.tags));

// Tags promoted to a category — never shown in the More overflow.
const HIDDEN_TAGS = new Set(["start", "getting-started", "example"]);

export const GETTING_STARTED_TAGS = ["getting-started", "start"];

export const isGettingStarted = (workflow: Workflow): boolean => {
  const tags = workflow.tags || [];
  return tags.some((t) => GETTING_STARTED_TAGS.includes(t));
};

export const matchesCategory = (
  workflow: Workflow,
  category: TemplateCategory
): boolean => {
  const tags = workflow.tags || [];
  const tagSet = new Set(tags);
  return category.tags.some((t) => tagSet.has(t));
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

export const overflowTagsWithCounts = (
  groupedTags: Record<string, Workflow[]>
): Array<{ tag: string; count: number }> => {
  const out: Array<{ tag: string; count: number }> = [];
  for (const [tag, list] of Object.entries(groupedTags)) {
    if (TOP_TAG_SET.has(tag) || HIDDEN_TAGS.has(tag)) {
      continue;
    }
    if (list.length < 2) {
      continue;
    }
    out.push({ tag, count: list.length });
  }
  out.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  return out;
};

export const categoryCounts = (
  workflows: Workflow[]
): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const cat of TOP_CATEGORIES) {
    counts[cat.id] = workflows.filter((w) => matchesCategory(w, cat)).length;
  }
  return counts;
};
