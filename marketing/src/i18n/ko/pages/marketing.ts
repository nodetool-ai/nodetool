import type { LocalizedPageContent } from "@/i18n/content";

/** Translates /marketing (app/marketing/page.tsx, data/marketingPage.ts). */
export const marketing: LocalizedPageContent = {
  route: "/marketing",
  name: "광고 마케팅",
  title: "AI 광고 제작 | 오픈소스 AI 광고 소프트웨어 · NodeTool",
  description:
    "NodeTool은 오픈소스 AI 광고 소프트웨어입니다. 에이전트에게 제품 사진과 브리프를 주면 광고 스토리보드를 짜고, 내 프로바이더 키로 스틸과 클립을 렌더링해 직접 편집할 수 있는 타임라인으로 컷을 만듭니다.",
  hero: {
    kicker: "광고와 마케팅",
    h1: "AI로 광고를 만드세요.",
    lead: "NodeTool은 오픈소스 AI 광고 소프트웨어입니다. 에이전트에게 제품 사진과 브리프를 주면 광고 스토리보드를 짜고, 내 프로바이더 키로 스틸과 클립을 렌더링해 직접 편집할 수 있는 타임라인으로 컷을 만듭니다.",
    note: "열어서 편집할 수 있는 예제 광고 {adCount}개 · 내 키로 Flux, Veo, Kling, Seedance 사용",
    secondary: { label: "광고 템플릿 라이브러리 둘러보기", href: "/ad-library" },
  },
  sections: [
    {
      kind: "catalog",
      id: "ads",
      title: "광고 템플릿 {adCount}개 중 일부입니다. 모두 편집 가능한 NodeTool 타임라인에서 렌더링했습니다.",
      intro: "브랜드, 카피, 수치는 모두 가상입니다.",
      source: "adLibrary",
      slugs: ["kinetic-offer-wall", "benefit-led-dashboard-punch-in", "binary-choice-participation-card", "result-seen-through-the-product"],
      link: { label: "모든 템플릿 보기", href: "/ad-library" },
    },
    {
      kind: "steps",
      id: "campaign",
      title: "브리프 하나, 마케팅 소재 한 세트, 수정 한 번.",
      intro: "연출형 캠페인 키트 가이드를 실제로 실행한 사례입니다. 컵은 가상의 데모 제품이므로, 게시하기 전에 생성된 제품의 형태와 재질을 실제 브랜드 레퍼런스와 비교하세요.",
      steps: [
        { title: "히어로, 16:9", body: "GPT Image 2.5가 브리프로 히어로를 렌더링했습니다. 물 위의 코발트색 플랫폼, 호박색 일출, 왼쪽의 카피를 넣을 깨끗한 공간입니다." },
        { title: "소셜 1:1과 스토리 9:16", body: "짝이 되는 편집 모델이 포맷마다 히어로의 구도를 다시 잡았고, 컵, 세트, 색 보정을 유지하라는 지시를 받았습니다. 정사각형은 왼쪽 위의 카피 공간을 유지하고, 스토리는 위쪽 3분의 1을 비워 둡니다." },
        { title: "수정", body: "\"물보라를 절반쯤 줄이고 왼쪽의 깨끗한 짙은 파란색 카피 공간을 넓혀 주세요.\" 편집 모델은 제품, 세트, 팔레트, 카메라를 유지하라는 지시를 받았기 때문에 물보라와 카피 공간만 달라졌습니다." },
      ],
      links: [{ label: "단계별로 따라 하기", href: "/recipes/directed-campaign-kit" }],
    },
    {
      kind: "cards",
      id: "more",
      title: "광고 팀을 위한 더 많은 자료",
      cards: [
        { title: "광고 템플릿 라이브러리", body: "비트, 타이밍, 카피 분량, 렌더링된 예시가 있는 세로형 짧은 광고 템플릿입니다.", link: { label: "열기", href: "/ad-library" } },
        { title: "예제 스토리보드", body: "완성된 광고 영상과 그것을 만든 모든 샷.", link: { label: "열기", href: "/storyboards" } },
        { title: "단계별 가이드", body: "캠페인 키트, UGC 영상, 제품 광고 영상, 제품 카탈로그 이미지를 단계별로.", link: { label: "열기", href: "/recipes" } },
        { title: "사진 한 장으로 제품 영상", body: "브리프와 제품 사진이 16:9 제품 영상이 되고, 다음 제품에도 다시 실행할 수 있습니다.", link: { label: "열기", href: "/use-cases/product-video" } },
      ],
    },
  ],
  faq: {
    heading: "AI 광고 크리에이티브: 자주 묻는 질문",
    items: [
      {
        question: "AI가 제품 사진을 동영상 광고로 바꿀 수 있나요?",
        answer:
          "네. NodeTool에서 제품 사진으로 제품을 엔티티로 저장하고 브리프를 쓰면 에이전트가 광고의 스토리보드를 짭니다. 샷마다 고른 이미지 모델과 동영상 모델로 스틸을 먼저, 그다음 클립을 렌더링하고, \"타임라인 만들기\"가 이를 트림하고 내보낼 수 있는 컷으로 조립합니다. 게시하기 전에 생성된 제품을 실제 제품과 비교하세요.",
      },
      {
        question: "광고 하나로 9:16, 4:5, 1:1 버전을 만들려면 어떻게 하나요?",
        answer:
          "타임라인 메뉴의 \"포맷 맞추기\"(Adapt format)는 같은 원본 미디어로 목표 포맷(9:16, 1:1, 4:5)마다 새 시퀀스를 만들고 원본 컷은 그대로 둡니다. 중앙 크롭이나 추적한 피사체를 따라가는 리프레임을 고르고 안전 여백을 설정할 수 있습니다.",
      },
      {
        question: "광고 하나를 카탈로그의 다른 제품에도 재사용할 수 있나요?",
        answer:
          "네. Per-SKU Ad Factory 템플릿은 Recast Storyboard 노드로 승인된 스토리보드를 다른 제품에 복사합니다. 프롬프트가 바뀌지 않은 프레임은 모두 유지하므로 제품이 나오는 샷만 다시 렌더링됩니다.",
      },
      {
        question: "NodeTool에서 AI 광고 크리에이티브는 비용이 얼마나 드나요?",
        answer: "NodeTool은 무료 오픈소스입니다. 렌더링은 내 프로바이더 키로 프로바이더 가격에 실행되고, 렌더링 대화상자가 확정 전에 예상 비용을 보여 줍니다.",
      },
      {
        question: "NodeTool은 광고주를 위해 무엇을 하지 않나요?",
        answer:
          "스톡 AI 진행자 라이브러리가 없고, 광고 성과를 예측하지 않으며, 광고 플랫폼에 게시하지도 않습니다. NodeTool은 크리에이티브, 즉 스틸, 클립, 편집 가능한 타임라인을 만듭니다. 내보내서 업로드하는 것은 직접 해야 합니다.",
      },
    ],
  },
  closing: {
    title: "다음 제품에 이 키트를 돌려 보세요.",
    body: "macOS, Windows, Linux용 무료 오픈소스 스튜디오를 내려받아 연출형 캠페인 키트를 여세요.",
  },
};
