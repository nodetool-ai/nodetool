/**
 * The `keywords` meta of translated pages. Without it they inherit the root
 * layout's English list. Google ignores the tag, but Baidu and Naver still
 * read it, so the words are the queries readers type in each language.
 */
export const LOCALE_KEYWORDS: Record<string, readonly string[]> = {
  zh: [
    "开源 AI 工作室",
    "AI 视频制作",
    "AI 短片",
    "AI 智能体",
    "节点工作流",
    "ComfyUI 替代",
    "本地大模型",
    "DeepSeek",
    "通义千问",
    "智谱 GLM",
    "AI 视频编辑器",
    "故事板",
  ],
  ja: [
    "オープンソース AIスタジオ",
    "AI動画制作",
    "AI動画編集",
    "AIエージェント",
    "ノードベース ワークフロー",
    "ComfyUI 代替",
    "ローカルLLM",
    "画像生成AI",
    "動画生成AI",
    "絵コンテ",
  ],
  ko: [
    "오픈소스 AI 스튜디오",
    "AI 영상 제작",
    "AI 동영상 편집기",
    "AI 에이전트",
    "노드 기반 워크플로",
    "ComfyUI 대안",
    "로컬 LLM",
    "이미지 생성 AI",
    "동영상 생성 AI",
    "스토리보드",
  ],
};
