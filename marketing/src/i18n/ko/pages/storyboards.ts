import type { LocalizedPageContent } from "@/i18n/content";

/** Translates /storyboards (app/storyboards/page.tsx, data/storyboards.ts). */
export const storyboards: LocalizedPageContent = {
  route: "/storyboards",
  name: "스토리보드",
  title: "AI 스토리보드 생성기 | 완성된 영화를 먼저, 그다음 모든 샷 · NodeTool",
  description:
    "NodeTool은 오픈소스 AI 스토리보드 생성기입니다. 브리프를 장면과 샷으로 나누고, 샷마다 스틸과 클립을 렌더링해 편집 가능한 타임라인으로 조립합니다. 여기 있는 모든 영화에는 그 뒤에 있는 스토리보드가 함께 있습니다.",
  hero: {
    kicker: "AI 스토리보드 생성기",
    h1: "완성된 영화를 먼저, 그다음 모든 샷.",
    lead: "NodeTool은 오픈소스 AI 스토리보드 생성기입니다. 브리프를 장면과 샷으로 나누고, 샷마다 스틸 이미지와 클립을 렌더링해 직접 편집할 수 있는 타임라인으로 조립합니다. 여기에는 영화 {storyboardCount}편이 있고, 모두 샷별 카메라, 길이, 연출 노트가 담긴 스토리보드가 함께 있습니다. NodeTool에서 어느 영화든 열어 샷을 직접 고칠 수 있습니다.",
    note: "영화 {storyboardCount}편 · 10~15초 · 16:9, 9:16, 21:9",
    secondary: { label: "영화 둘러보기", href: "#films" },
  },
  sections: [
    {
      kind: "steps",
      id: "editor",
      title: "스토리보드 편집기가 하는 일.",
      intro: "내장 에이전트가 모든 단계를 대신 실행하거나 보드에서 함께 작업할 수 있습니다. 렌더링은 내 프로바이더 키로 실행됩니다.",
      steps: [
        { title: "브리프 쓰기", body: "영화를 한두 문장으로 쓰고 스타일과 엔티티를 더한 다음 \"연출\"을 누르세요. 시나리오 모델이 장면과 샷을 씁니다." },
        { title: "샷 렌더링", body: "보드 전체 또는 샷 하나의 스틸과 클립을 고른 모델로 렌더링합니다. 확정하기 전에 예상 가격이 표시됩니다." },
        { title: "모든 테이크 보관", body: "렌더링할 때마다 테이크가 하나씩 추가됩니다. 현재 테이크를 고르고, 프롬프트로 스틸을 편집하고, 바꿀 영역을 칠하고, 업스케일하거나 구도를 다시 잡으세요." },
        { title: "타임라인 편집", body: "\"타임라인 만들기\"는 현재의 스틸과 클립을 타임라인으로 바꿔 줍니다. 거기서 트림, 분할, 내보내기를 할 수 있습니다." },
      ],
      links: [
        { label: "AI 동영상 편집기", href: "/ai-video-editor" },
        { label: "스토리보드 편집기 가이드", href: "https://docs.nodetool.ai/storyboard-editor" },
      ],
    },
    {
      kind: "text",
      id: "cost",
      title: "스틸을 승인한 다음 클립 비용을 내세요.",
      body: [
        "동영상에 비용을 쓰기 전에 스틸 이미지로 등장인물과 카메라를 시험해 보세요. Kie.ai에서 {stillModel} 스틸 한 장은 {stillPrice}, 5초짜리 {clipModel} 클립은 {clipPrice}입니다. 승인한 샷만 클립이 됩니다.",
      ],
    },
    {
      kind: "catalog",
      id: "films",
      title: "영화 {storyboardCount}편과 그 스토리보드",
      intro: "아무 영화나 열면 완성된 영화를 먼저 보여 주고, 이어서 샷마다 카메라와 연출 노트를 보여 줍니다.",
      source: "storyboards",
    },
  ],
  faq: {
    heading: "AI 스토리보드 생성기: 자주 묻는 질문",
    items: [
      {
        question: "NodeTool 스토리보드 생성기는 무료인가요?",
        answer:
          "NodeTool은 오픈소스(AGPL-3.0)이고 macOS, Windows, Linux용으로 무료로 내려받을 수 있습니다. 렌더링은 내 프로바이더 키로 실행되므로, 스틸과 클립마다 모델 프로바이더에 직접 비용을 냅니다. 렌더링 대화상자가 확정 전에 예상 가격을 보여 줍니다.",
      },
      {
        question: "스토리보드의 여러 샷에서 등장인물을 일관되게 유지하려면 어떻게 하나요?",
        answer:
          "등장인물을 엔티티로 저장하고, 등장하는 샷마다 연결하세요. 엔티티는 캐릭터, 장소, 스타일, 소품이 될 수 있고, 레퍼런스 이미지를 받는 스틸 모델이 이를 사용합니다. 고른 스틸 모델이 레퍼런스 이미지를 받지 못하면 편집기가 모델 선택기 아래에 경고를 표시합니다.",
      },
      {
        question: "AI 스토리보드를 동영상으로 만들 수 있나요?",
        answer:
          "네. 샷마다 스틸 하나와 클립 하나가 있습니다. \"타임라인 만들기\"는 현재의 스틸과 클립으로 타임라인을 만들고, 거기서 영화를 트림, 분할, 내보낼 수 있습니다. 스틸이나 클립이 없는 샷은 건너뜁니다.",
      },
      {
        question: "스토리보드는 어떤 화면 비율을 쓸 수 있나요?",
        answer:
          "보드는 16:9, 9:16, 1:1, 4:3, 21:9 중 하나입니다. 샷마다 프롬프트, 카메라 설정, 모션, 길이가 따로 있어서 다른 샷을 다시 렌더링하지 않고 샷 하나만 바꿀 수 있습니다.",
      },
      {
        question: "스토리보드를 내보낼 수 있나요?",
        answer:
          "보드 메뉴의 \"ZIP 다운로드\"는 보드를 Markdown으로, 스틸과 클립과 함께 저장합니다. \"워크플로로 보내기\"는 같은 스틸과 클립을 노드 워크플로에 전달합니다.",
      },
    ],
  },
  closing: {
    title: "한 문장으로 스토리보드를 시작하세요.",
    body: "무료 오픈소스 Studio를 내려받아 예제 영화를 열고 샷을 직접 고쳐 보세요.",
  },
};
