import type { LocalizedPageContent } from "@/i18n/content";

/** Translates /ad-library (app/ad-library/page.tsx, components/adLibrary). */
export const adLibrary: LocalizedPageContent = {
  route: "/ad-library",
  name: "광고 템플릿 라이브러리",
  title: "동영상 광고 템플릿 | 편집 가능한 소셜 미디어용 짧은 광고 · NodeTool",
  description:
    "소셜 미디어용 짧은 광고를 위한 편집 가능한 동영상 광고 템플릿입니다. 템플릿마다 비트별 길이, 구도, 카피 글자 수, 소재가 정해져 있고, NodeTool에서 미니 앱으로 제공되어 내 이미지, 로고, 카피로 세로형 광고를 만듭니다.",
  hero: {
    kicker: "동영상 광고 템플릿",
    h1: "아이디어가 분명해야 만들 가치가 있는 광고가 됩니다.",
    lead: "소셜 미디어용 짧은 광고를 위한 편집 가능한 동영상 광고 템플릿 {adCount}개입니다. 템플릿마다 비트별 길이, 구도, 카피 글자 수 제한, 소재가 정해져 있고, NodeTool에서 미니 앱으로 제공되어 내 이미지, 로고, 카피로 세로형 광고를 만듭니다.",
    note: "템플릿 {adCount}개 · 8~15초 · 9:16, 4:5, 1:1",
    secondary: { label: "템플릿 둘러보기", href: "#concepts" },
  },
  sections: [
    {
      kind: "catalog",
      id: "concepts",
      title: "템플릿을 고르세요.",
      intro: "템플릿마다 비트 길이에 맞춰 렌더링된 NodeTool 타임라인이 재생됩니다. 브랜드, 카피, 수치는 모두 가상입니다.",
      source: "adLibrary",
    },
    {
      kind: "text",
      id: "more",
      title: "모든 단계를 보여 주는 완성 프로젝트를 보고 싶다면?",
      body: ["단계별 가이드나 샷별로 보는 예제 AI 스토리보드를 살펴보세요."],
      links: [
        { label: "단계별 가이드", href: "/recipes" },
        { label: "예제 스토리보드", href: "/storyboards" },
      ],
    },
  ],
  closing: {
    title: "내 소재로 세로형 광고를 만들어 보세요.",
    body: "무료 오픈소스 Studio를 내려받아 광고 템플릿을 열고, 내 이미지, 로고, 카피로 바꿔 보세요.",
  },
};
