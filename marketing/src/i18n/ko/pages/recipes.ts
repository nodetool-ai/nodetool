import type { LocalizedPageContent } from "@/i18n/content";

/** Translates /recipes (app/recipes/page.tsx). */
export const recipes: LocalizedPageContent = {
  route: "/recipes",
  name: "단계별 가이드",
  title: "단계별 가이드 | 아이디어 하나에서 한 단계씩 완성까지 · NodeTool",
  description:
    "만들고 싶은 것을 고르고, 스토리보드나 대본 가이드를 따라 한 단계씩 진행하며 모든 부분을 점검하고, 편집기에서 계속 다듬으세요. 캠페인 키트, UGC 영상, 제품 광고 영상, 다국어 영상, 제품 카탈로그, 트레일러.",
  hero: {
    kicker: "단계별 가이드",
    h1: "아이디어 하나에서 시작해 한 단계씩.",
    lead: "만들고 싶은 것을 고르세요. 스토리보드나 대본 가이드를 따라가며 모든 부분을 점검하고, 편집기에서 계속 다듬으세요.",
    secondary: { label: "가이드 둘러보기", href: "#recipes" },
  },
  sections: [
    {
      kind: "catalog",
      id: "recipes",
      title: "모든 가이드는 실제로 실행해 본 프로젝트입니다.",
      intro: "아무 가이드나 열어 각 단계와 그 결과를 확인하세요(영어 페이지).",
      source: "recipes",
    },
    {
      kind: "text",
      id: "editable",
      title: "모든 부분을 계속 편집할 수 있습니다.",
      body: [
        "엔티티로 캐릭터와 제품의 일관성을 지키세요. 스토리보드에서 화면을 점검하고, 대본을 한 줄씩 다듬고, 마지막에 타임라인에서 모든 것을 하나로 합칩니다.",
      ],
      links: [
        { label: "샷별로 보는 예제 스토리보드 둘러보기", href: "/storyboards" },
        { label: "편집 가능한 동영상 광고 템플릿으로 시작하기", href: "/ad-library" },
      ],
    },
  ],
  readMore: {
    heading: "더 읽어 보기",
    links: [
      { label: "워크플로 템플릿", href: "/templates" },
      { label: "광고 템플릿 라이브러리", href: "/ad-library" },
    ],
  },
  closing: {
    title: "가이드를 가져와서, 읽어 보고, 실행하세요.",
    body: "무료 오픈소스 Studio를 내려받으세요. 모든 가이드는 파일 하나로 가져올 수 있고, 실행하고 싶을 때 프로바이더 키를 추가하면 됩니다.",
  },
};
