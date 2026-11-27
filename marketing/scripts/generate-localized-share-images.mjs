// Writes public/preview-{zh,ja,ko}.png: the site share card (public/preview.png)
// with its headline, subline and footer redrawn in Chinese, Japanese and
// Korean. Translated pages name these in src/lib/defaultOgImage.ts.
//
//   node scripts/generate-localized-share-images.mjs
//
// Needs Playwright's Chromium, or a Chrome binary in CHROMIUM_PATH. The Noto
// CJK fonts are installed from npm into a temporary directory, so the cards
// look the same on any machine. Re-run
// after preview.png or an overview h1 (src/data/languagePages.ts) changes.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");

const CARDS = {
  zh: {
    font: "noto-sans-sc",
    family: "Noto Sans SC",
    lang: "zh-Hans",
    title: "真正由你掌控的开源 AI 工作室",
    subtitle: "智能体负责搭建和修改，你来检查和编辑。",
    footer: "开源 · 使用你自己的密钥 · nodetool.ai",
  },
  ja: {
    font: "noto-sans-jp",
    family: "Noto Sans JP",
    lang: "ja",
    title: "自分の手で操れる、オープンソースのAIスタジオ",
    subtitle: "エージェントが組み立てて修正し、あなたが確認・編集します。",
    footer: "オープンソース · 自分のキーで動く · nodetool.ai",
  },
  ko: {
    font: "noto-sans-kr",
    family: "Noto Sans KR",
    lang: "ko",
    title: "직접 통제하는 오픈소스 AI 스튜디오",
    subtitle: "에이전트가 만들고 고칩니다. 확인과 편집은 직접 합니다.",
    footer: "오픈소스 · 내 API 키 사용 · nodetool.ai",
  },
};

const fontDir = mkdtempSync(path.join(os.tmpdir(), "share-fonts-"));
execFileSync(
  "npm",
  ["install", "--prefix", fontDir, "--no-save", "--no-audit", "--no-fund",
    ...Object.values(CARDS).map((card) => `@fontsource/${card.font}`)],
  { stdio: "inherit" }
);

function fontCss(font) {
  const dir = path.join(fontDir, "node_modules", "@fontsource", font);
  return [400, 700]
    .map((weight) => readFileSync(path.join(dir, `${weight}.css`), "utf8"))
    .join("\n")
    .replaceAll("url(./files/", `url(${pathToFileURL(path.join(dir, "files"))}/`);
}

// The left column covers the English text of preview.png and keeps its
// wordmark and window frame.
function cardHtml(card) {
  const background = pathToFileURL(path.join(publicDir, "preview.png"));
  return `<!doctype html><html lang="${card.lang}"><head><meta charset="utf-8"><style>${fontCss(card.font)}
body{margin:0;width:1200px;height:630px;position:relative;background:url(${background});font-family:'${card.family}',sans-serif;word-break:auto-phrase;line-break:strict}
.col{position:absolute;left:0;top:140px;width:568px;height:490px;box-sizing:border-box;padding:0 40px 48px 56px;background:#050510;display:flex;flex-direction:column}
h1{margin:36px 0 0;font-size:50px;line-height:1.22;font-weight:700;color:#fff;text-wrap:balance}
.bar{width:72px;height:5px;border-radius:999px;background:#60a5fa;margin-top:30px}
p{margin:22px 0 0;font-size:24px;line-height:1.5;color:#cbd5e1}
.foot{margin-top:auto;font-size:21px;color:#94a3b8}
</style></head><body><div class="col"><h1>${card.title}</h1><div class="bar"></div><p>${card.subtitle}</p><div class="foot">${card.footer}</div></div></body></html>`;
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
for (const [locale, card] of Object.entries(CARDS)) {
  const htmlPath = path.join(fontDir, `card-${locale}.html`);
  writeFileSync(htmlPath, cardHtml(card));
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.goto(pathToFileURL(htmlPath).href);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(publicDir, `preview-${locale}.png`) });
  await page.close();
  console.log(`wrote public/preview-${locale}.png`);
}
await browser.close();
