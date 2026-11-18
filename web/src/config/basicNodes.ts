import type { QuickActionNodeType } from "./quickActionNodeTypes";

/**
 * The fundamental operations a creator reaches for first. The node menu shows
 * them as its first tile row, and a search whose words name one of them lists
 * it above the specialized nodes.
 */
export interface BasicNode {
  key: string;
  label: string;
  nodeType: QuickActionNodeType;
  /** Lower-case words a search for this operation uses. */
  keywords: readonly string[];
}

export const BASIC_NODES: readonly BasicNode[] = [
  {
    key: "basic-text",
    label: "Text",
    nodeType: "nodetool.constant.String",
    keywords: ["text", "string", "write", "note", "words", "create"]
  },
  {
    key: "basic-generate-text",
    label: "Generate text",
    nodeType: "nodetool.agents.Agent",
    keywords: ["generate", "text", "write", "llm", "chat"]
  },
  {
    key: "basic-generate-image",
    label: "Generate image",
    nodeType: "nodetool.image.TextToImage",
    keywords: ["generate", "image", "picture", "photo", "create"]
  },
  {
    key: "basic-edit-image",
    label: "Edit image",
    nodeType: "nodetool.image.ImageToImage",
    keywords: ["edit", "image", "picture", "photo", "change"]
  },
  {
    key: "basic-generate-video",
    label: "Generate video",
    nodeType: "nodetool.video.TextToVideo",
    keywords: ["generate", "video", "clip", "movie", "create"]
  },
  {
    key: "basic-edit-video",
    label: "Edit video",
    nodeType: "nodetool.video.VideoToVideo",
    keywords: ["edit", "video", "clip", "movie", "change"]
  }
];

const BASIC_NODE_BY_TYPE = new Map<string, BasicNode>(
  BASIC_NODES.map((basic) => [basic.nodeType, basic])
);

export const getBasicNode = (nodeType: string): BasicNode | undefined =>
  BASIC_NODE_BY_TYPE.get(nodeType);

/** A query word shorter than this matches too much to pin anything. */
const MIN_QUERY_WORD_LENGTH = 2;
/**
 * A query word may extend a keyword this long: "editing" matches "edit" and
 * "images" matches "image". Shorter keywords match only their own prefixes.
 */
const MIN_STEM_LENGTH = 4;

const wordMatches = (word: string, keyword: string): boolean =>
  keyword.startsWith(word) ||
  (keyword.length >= MIN_STEM_LENGTH && word.startsWith(keyword));

/**
 * The basic operations every word of `query` names, in `BASIC_NODES` order.
 * "text" returns Text and Generate text, "edit video" returns Edit video, and
 * "upscale" returns nothing.
 */
export const matchBasicNodes = (query: string): BasicNode[] => {
  const words = query
    .toLowerCase()
    .split(/[\s,._\-/]+/)
    .filter(Boolean);
  if (
    words.length === 0 ||
    words.some((word) => word.length < MIN_QUERY_WORD_LENGTH)
  ) {
    return [];
  }
  return BASIC_NODES.filter((basic) =>
    words.every((word) =>
      basic.keywords.some((keyword) => wordMatches(word, keyword))
    )
  );
};
