/**
 * Korean strings of the shared frame: header, footer, buttons and the
 * installer picker. Nav labels are keyed by the English href, so the header
 * keeps one link list and only swaps the words.
 */
import type { LocaleChrome } from "@/i18n/content";
import type { DownloadPanelCopy } from "@/components/DownloadPanel";

export const KO_CHROME: LocaleChrome = {
  download: "Studio 무료 다운로드",
  tryBrowser: "브라우저에서 사용해 보기(알파)",
  englishVersion: "영어로 읽기",
  englishSuffix: " (영어)",
  updated: "업데이트",
};

/** Header and footer group titles, keyed by the English title. */
export const KO_NAV_GROUPS: Record<string, string> = {
  Product: "제품",
  Solutions: "솔루션",
  Resources: "리소스",
  Compare: "비교",
  Legal: "법적 고지",
};

/** Header and footer link labels, keyed by href. */
export const KO_NAV_LABELS: Record<string, string> = {
  "/studio": "Studio 데스크톱",
  "/cloud": "Cloud(알파)",
  "/agents": "에이전트",
  "/node-based-workflows": "노드 워크플로",
  "/node-based-ai": "노드 기반 AI",
  "/ai-video-editor": "AI 동영상 편집기",
  "/ai-image-editor": "AI 이미지 편집기",
  "/storyboards": "스토리보드",
  "/mcp": "MCP 서버",
  "/models": "지원 모델",
  "/download": "다운로드",
  "/developers": "개발자",
  "/marketing": "광고 마케팅",
  "/gamedev": "게임 개발",
  "/gamedev/ai-game-engines": "AI 게임 엔진 비교",
  "/solutions/local-first": "로컬 우선",
  "/solutions/researchers": "연구자",
  "/solutions": "모든 솔루션",
  "/templates": "템플릿",
  "/recipes": "단계별 가이드",
  "/presets": "프리셋",
  "/ad-library": "광고 템플릿 라이브러리",
  "/alternatives": "대안 비교",
  "/alternatives/comfyui": "ComfyUI와 비교",
  "/faq": "자주 묻는 질문",
  "/demo": "라이브 데모",
  "/pricing": "요금",
  "/blog": "블로그",
  "/tasks": "작업",
  "/providers": "프로바이더",
  "/showcase": "쇼케이스",
  "/ideas": "워크플로 아이디어",
  "/imprint": "사업자 정보",
  "/privacy": "개인정보 처리방침",
  "/terms": "이용약관",
  "https://docs.nodetool.ai": "문서",
};

/** AnnouncementBar. The English bar links /cloud, which has no translation. */
export const KO_ANNOUNCEMENT = {
  text: "NodeTool Cloud는 알파 단계입니다. 브라우저에서 영화를 연출하고 워크플로를 실행하세요. 내 키를 사용합니다.",
  short: "NodeTool Cloud는 알파 단계입니다.",
  href: "https://app.nodetool.ai",
  cta: "사용해 보기",
  dismiss: "공지 닫기",
};

/** HeroDemoPlayer controls. */
export const KO_PLAYER = {
  soundOn: "소리 켜기",
  soundOff: "소리 끄기",
  pause: "데모 일시정지",
  play: "데모 재생",
  fullscreenLabel: "데모 전체 화면으로 재생",
  fullscreen: "전체 화면",
};

export const KO_HEADER = {
  skip: "본문으로 건너뛰기",
  star: "GitHub에서 별표 누르기",
  starLabel: "GitHub에서 NodeTool에 별표 누르기",
  openMenu: "메뉴 열기",
  closeMenu: "메뉴 닫기",
  menu: "사이트 메뉴",
  home: "NodeTool 홈",
};

export const KO_FOOTER = {
  blurb: "현업 아티스트, 디자이너, 영상 편집자와 함께 만든 무료 오픈소스 소프트웨어입니다. 만들고 싶은 것을 설명하면 에이전트가 만드는 과정을 보여 주고, 프로젝트 파일은 그대로 저장됩니다.",
  builtInOpen: "공개적으로 개발합니다.",
  languages: "언어",
};

export const KO_DOWNLOAD_PANEL: DownloadPanelCopy = {
  downloadFor: "{platform}용 다운로드",
  notes: {
    "mac-arm": "M1 이상 칩, macOS 12 이상",
    "mac-intel": "Intel 칩 Mac, macOS 12 이상",
    windows: "64비트 Windows 10 또는 11",
    linux: "64비트 AppImage, 모든 릴리스에 Flatpak도 포함",
  },
  onMobile: "NodeTool Studio를 설치하려면 컴퓨터에서 이 페이지를 여세요. 아래에서 macOS, Windows, Linux 빌드 중 하나를 고르세요.",
  pickBuild: "내 컴퓨터에 맞는 빌드를 고르세요.",
  releasesBefore: "모든 빌드, 릴리스 노트, 체크섬은 ",
  releasesLink: "GitHub 릴리스 페이지",
  releasesAfter: "에 있습니다.",
};
