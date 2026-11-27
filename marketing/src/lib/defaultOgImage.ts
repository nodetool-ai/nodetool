/**
 * Site-wide share card for routes without their own `opengraph-image`. A
 * route's `openGraph` replaces the root layout's, so each one names it.
 * `public/preview.png` is the root `opengraph-image` saved as a static file;
 * re-save it from `/opengraph-image` when that card changes.
 */
export const DEFAULT_OG_IMAGES = [
  {
    url: "/preview.png",
    width: 1200,
    height: 630,
    alt: "NodeTool | Open-source agent-first creative workspace",
  },
];

/**
 * The same card with the headline in the reader's language, for translated
 * pages. WeChat, LINE, KakaoTalk and X show this text in link previews.
 * `scripts/generate-localized-share-images.mjs` draws each one over
 * `public/preview.png`; re-run it when that card or the overview h1 changes.
 */
const LOCALIZED_OG_IMAGES: Record<string, { url: string; alt: string }> = {
  zh: { url: "/preview-zh.png", alt: "NodeTool | 真正由你掌控的开源 AI 工作室" },
  ja: { url: "/preview-ja.png", alt: "NodeTool | 自分の手で操れる、オープンソースのAIスタジオ" },
  ko: { url: "/preview-ko.png", alt: "NodeTool | 직접 통제하는 오픈소스 AI 스튜디오" },
};

/** The share card for a locale (`zh`, `ja`, `ko`), else the English one. */
export function shareImages(locale: string): typeof DEFAULT_OG_IMAGES {
  const card = LOCALIZED_OG_IMAGES[locale];
  return card ? [{ ...DEFAULT_OG_IMAGES[0], ...card }] : DEFAULT_OG_IMAGES;
}
