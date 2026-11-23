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
  /**
   * Lower-case words a search for this operation uses, with Chinese words
   * for an interface in Chinese, where a search has no spaces between words.
   */
  keywords: readonly string[];
}

export const BASIC_NODES: readonly BasicNode[] = [
  {
    key: "basic-text",
    label: "Text",
    nodeType: "nodetool.constant.String",
    keywords: ["text", "string", "write", "note", "words", "create", "文本", "文字", "字符串", "笔记", "创建"]
  },
  {
    key: "basic-generate-text",
    label: "Generate text",
    nodeType: "nodetool.agents.Agent",
    keywords: ["generate", "text", "write", "llm", "chat", "生成", "文本", "文字", "写作", "大模型", "聊天", "对话"]
  },
  {
    key: "basic-generate-image",
    label: "Generate image",
    nodeType: "nodetool.image.TextToImage",
    keywords: ["generate", "image", "picture", "photo", "create", "生成", "图片", "图像", "照片", "绘图", "画图", "创建", "文生图"]
  },
  {
    key: "basic-edit-image",
    label: "Edit image",
    nodeType: "nodetool.image.ImageToImage",
    keywords: ["edit", "image", "picture", "photo", "change", "编辑", "图片", "图像", "照片", "修改", "修图", "改图", "图生图"]
  },
  {
    key: "basic-generate-video",
    label: "Generate video",
    nodeType: "nodetool.video.TextToVideo",
    keywords: ["generate", "video", "clip", "movie", "create", "生成", "视频", "短片", "影片", "创建", "文生视频"]
  },
  {
    key: "basic-edit-video",
    label: "Edit video",
    nodeType: "nodetool.video.VideoToVideo",
    keywords: ["edit", "video", "clip", "movie", "change", "编辑", "视频", "短片", "影片", "修改", "剪辑"]
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

/** Han characters, which a Chinese search writes without spaces. */
const HAN = /\p{Script=Han}/u;

/**
 * Whether a run of Han characters is a sequence of `keywords`, the last of
 * which may be cut short: "生成图片" is 生成 + 图片 and "生成图" ends on a
 * prefix of 图片.
 */
const coveredByKeywords = (word: string, keywords: readonly string[]): boolean => {
  const reachable = new Array<boolean>(word.length + 1).fill(false);
  reachable[0] = true;
  for (let start = 0; start < word.length; start++) {
    if (!reachable[start]) {
      continue;
    }
    const rest = word.slice(start);
    for (const keyword of keywords) {
      if (rest.startsWith(keyword)) {
        reachable[start + keyword.length] = true;
      } else if (keyword.startsWith(rest)) {
        reachable[word.length] = true;
      }
    }
  }
  return reachable[word.length];
};

/**
 * The basic operations every word of `query` names, in `BASIC_NODES` order.
 * "text" returns Text and Generate text, "edit video" returns Edit video, and
 * "upscale" returns nothing. "生成图片" returns Generate image.
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
      HAN.test(word)
        ? coveredByKeywords(word, basic.keywords)
        : basic.keywords.some((keyword) => wordMatches(word, keyword))
    )
  );
};
