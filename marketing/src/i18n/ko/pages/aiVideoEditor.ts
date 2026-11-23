import type { LocalizedPageContent } from "@/i18n/content";

/** Translates /ai-video-editor (app/ai-video-editor/page.tsx, data/videoEditorPage.ts). */
export const aiVideoEditor: LocalizedPageContent = {
  route: "/ai-video-editor",
  name: "AI 동영상 편집기",
  title: "오픈소스 AI 동영상 편집기 | 에이전트가 편집하고, 이어서 내가 편집 · NodeTool",
  description:
    "에이전트가 스토리보드를 짜고, 고른 동영상 모델로 샷을 생성하고, 멀티 트랙 타임라인으로 조립합니다. 같은 타임라인을 열어 테이크를 바꾸고, 컷을 다듬고, 샷 하나만 다시 생성하세요.",
  hero: {
    kicker: "오픈소스 AI 동영상 편집기",
    h1: "에이전트가 편집하고, 이어서 내가 편집합니다.",
    lead: "에이전트가 스토리보드를 짜고, 고른 동영상 모델로 샷을 생성하고, 멀티 트랙 타임라인으로 조립합니다. 같은 타임라인을 열어 테이크를 바꾸고, 컷을 다듬고, 나머지를 다시 렌더링하지 않고 샷 하나만 다시 생성하세요.",
    secondary: { label: "NodeTool로 만든 영화 보기", href: "/storyboards" },
    media: {
      kind: "reel",
      base: "/hero-flow",
      alt: "NodeTool: 한 문장이 비트 시트, 등장인물, 스틸과 클립으로 된 스토리보드, 완성된 편집본이 되기까지",
    },
  },
  sections: [
    {
      kind: "steps",
      id: "brief-to-cut",
      title: "브리프에서 최종 컷까지.",
      intro: "각 단계는 열어 볼 수 있는 문서를 남깁니다. 에이전트가 모든 단계를 실행할 수도 있고, 어느 단계에서든 내가 이어받을 수도 있습니다.",
      steps: [
        { title: "샷 계획", body: "스토리보드에는 장면과 샷이 있고, 샷마다 카메라, 프롬프트, 길이가 있습니다. 에이전트가 브리프나 대본으로 스토리보드를 쓸 수 있고, 보드에서 어떤 샷이든 직접 편집할 수 있습니다." },
        { title: "등장인물 일관성 유지", body: "등장인물, 장소, 스타일, 제품을 엔티티로 저장하세요. 엔티티마다 레퍼런스 이미지와 설명이 있고, 여러 샷에서 재사용됩니다." },
        { title: "스틸 먼저, 클립은 그다음", body: "동영상 비용을 내기 전에 저렴한 스틸 이미지로 구도와 캐스팅을 확정하고, 승인한 테이크만 이미지 투 비디오 모델로 움직입니다. 테이크를 비교하고 언제든 이전 버전으로 돌아갈 수 있습니다." },
        { title: "대본에 목소리 입히기", body: "대본의 대사를 생성합니다. 대사 하나를 고치면 다른 대사는 건드리지 않고 그 대사의 음성 녹음만 다시 생성합니다." },
        { title: "타임라인 편집", body: "\"타임라인 만들기\"는 보드와 목소리가 입혀진 대본을 멀티 트랙 시퀀스로 바꿉니다. 그다음은 평범한 편집입니다. 트림, 전환, 타이틀, 자막, 음악, 키프레임을 다룹니다." },
        { title: "크기 조정과 내보내기", body: "9:16, 1:1, 4:5 버전을 만든 다음, 완성된 미디어를 내보내거나 나중에 다시 열 수 있는 NodeTool 프로젝트로 저장하세요." },
      ],
    },
    {
      kind: "text",
      id: "timeline",
      title: "진짜 멀티 트랙 타임라인.",
      body: ["생성된 클립은 항상 그것을 만든 워크플로에 연결되어 있습니다. 설정 하나를 바꾸면 그 클립만 다시 생성하도록 표시되고, 이전 버전은 그대로 남습니다."],
      bullets: [
        "비디오, 오디오, 오버레이, 자막, MIDI 트랙.",
        "이미지, 동영상, 오디오, 텍스트, 도형, 3D 모델, 그룹, 조정 클립.",
        "트림, 분할, 리플과 롤 편집, 세 가지 드롭 모드, 스냅, 마커, J/K/L 셔틀. NodeTool, Premiere Pro, Final Cut Pro용 키보드 레이아웃.",
        "크로스페이드, 와이프, 푸시, 줌, 휩, 글리치, 아이리스, 라이트 리크를 포함한 12가지 전환.",
        "텍스트와 캡션 스타일, 자막 트랙, 모션 프리셋, 키프레임, 속도, 타임 리매핑.",
        "색 보정, 블러, 글로우, 크로마키, 커브, LUT, 그레인 같은 클립 이펙트와 오디오 게인, EQ, 컴프레션.",
      ],
      links: [{ label: "동영상 편집기 가이드 읽기", href: "https://docs.nodetool.ai/video-editor" }],
    },
    {
      kind: "cards",
      id: "mcp-tools",
      title: "Claude Code나 Codex에게 동영상 편집을 맡기세요.",
      intro: "내장 에이전트와 외부 에이전트는 같은 도구를 씁니다. NodeTool MCP 서버로 내 에이전트를 연결하세요.",
      cards: [
        { title: "스토리보드 작성", meta: "create_storyboard, edit_storyboard", body: "보드를 쓰고 고칩니다. 장면, 샷, 카메라, 스타일, 캐스팅이 대상입니다." },
        { title: "샷 렌더링", meta: "render_storyboard_stills, render_storyboard_clips", body: "아직 렌더링이 필요한 샷, 또는 오래된 샷만 지정한 모델로 렌더링합니다." },
        { title: "목소리 입히기", meta: "voice_script_lines", body: "초안이거나 오래된 모든 대사에 목소리를 입힙니다. 대사마다 다른 목소리를 쓸 수 있습니다." },
        { title: "타임라인 조립", meta: "assemble_storyboard_timeline", body: "렌더링된 클립을 저장된 타임라인으로 바꿉니다." },
        { title: "타임라인 편집", meta: "edit_timeline", body: "클립, 트랙, 텍스트, 이펙트, 타이밍을 한 번의 검증된 편집으로 바꿉니다." },
        { title: "미리 보고 렌더링", meta: "preview_timeline_frame, render_timeline", body: "합성된 컷의 프레임을 렌더링해 에이전트가 결과를 보게 하고, 완성된 시퀀스를 MP4, WebM, ProRes MOV, PNG 시퀀스로 렌더링합니다." },
      ],
    },
    {
      kind: "table",
      id: "export",
      title: "내보내기",
      head: ["방식", "설명"],
      rows: [
        ["화면 비율", "시퀀스를 9:16, 1:1, 4:5로 맞춥니다. 내보내기 전에 각 버전의 구도를 확인하세요."],
        ["미디어 파일: 브라우저 내보내기", "MP4(H.264), WebM(알파 선택 가능한 VP9), PNG 시퀀스를 브라우저에서 WebCodecs로 인코딩합니다. MP4는 H.264 인코딩이 가능한 브라우저가 필요합니다."],
        ["미디어 파일: 서버 렌더링", "MP4, WebM, MOV(ProRes), PNG 시퀀스를 편집기에서 또는 render_timeline으로 렌더링합니다."],
        ["Premiere Pro 프로젝트 전달(작업 중)", "미디어와 함께 FCP7 XML을 내보내 Premiere Pro에서 편집을 이어 갑니다. 지원은 부분적이며 네이티브 .prproj 내보내기가 아닙니다. 일부 속성은 옮겨지지만 타이틀, 이펙트, 전환은 다시 만들어야 할 수 있습니다. 내보내기 보고서를 확인하고 가져온 편집본을 점검하세요."],
        ["NodeTool 프로젝트 파일", "타임라인을 프로젝트 zip으로, 또는 프로젝트 전체를 .nodetool-project 파일 하나로 내보냅니다."],
      ],
      note: "아직 안 되는 것: 내보내기 화면에서 Final Cut Pro와 DaVinci Resolve로의 전달은 지원하지 않습니다. 가이드형 비디오와 스토리보드 흐름은 카메라를 보고 말하는 장면을 만들지 않습니다. 립싱크 대사에는 에이전트, 캐릭터 엔티티, 원본 얼굴 영상, 립싱크를 지원하는 모델이 필요합니다. Adapt format의 Smart Reframe에는 모든 시각 클립에 대해 피사체 트랙이나 직접 지정한 구도가 필요합니다. WebGPU가 없으면 미리보기는 크로마키, 비네트, 샤픈을 건너뜁니다. 생성은 내 프로바이더 계정으로 실행되므로 렌더링 비용은 프로바이더 가격입니다. NodeTool은 렌더링 버튼에 예상 비용을 표시합니다. NodeTool은 생성한 샷으로 만드는 단편, 광고, 트레일러, 설명 영상에 맞춰져 있습니다. 장편 편집과 마무리에는 전용 편집기를 쓰세요.",
    },
    {
      kind: "catalog",
      id: "films",
      kicker: "예제 스토리보드",
      title: "NodeTool로 만든 영화",
      intro: "각 페이지는 완성된 영화를 먼저 보여 준 다음, 샷마다 카메라와 연출 노트를 보여 줍니다.",
      source: "storyboards",
      slugs: ["duel-in-the-wheat", "the-long-hallway", "mars-greenhouse"],
      link: { label: "모든 스토리보드", href: "/storyboards" },
    },
  ],
  faq: {
    heading: "AI 동영상 편집에 대한 질문",
    items: [
      {
        question: "프로젝트를 계속 편집할 수 있게 해 주는 AI 동영상 편집기가 있나요?",
        answer:
          "네. NodeTool에서 에이전트가 만든 스토리보드, 대본, 타임라인은 내가 열어서 편집하는 문서와 같습니다. 테이크를 바꾸고, 클립을 다듬고, 대사를 고치고, 샷 하나만 다시 생성해도 나머지 편집은 그대로입니다.",
      },
      {
        question: "AI 동영상 생성과 완전한 편집 타임라인을 함께 갖춘 데스크톱 앱은 무엇인가요?",
        answer:
          "macOS, Windows, Linux에서 NodeTool Studio가 그렇습니다. 하나의 프로젝트 안에 스토리보드, 내 키로 쓰는 fal.ai, Replicate, Kie.ai 같은 프로바이더의 동영상 생성, 생성된 클립이 샷 순서대로 놓여 트림, 오디오, 내보내기를 할 수 있는 멀티 트랙 타임라인이 들어 있습니다. 무료 오픈소스이며 AGPL-3.0입니다.",
      },
      {
        question: "AI 에이전트가 스토리보드에서 최종 컷까지 갈 수 있나요?",
        answer:
          "네. NodeTool에서 에이전트는 브리프로 스토리보드를 쓰고, 샷마다 렌더링하고, 클립을 타임라인에 조립하고, 컷을 렌더링합니다. 모든 단계가 열어서 바꿀 수 있는 문서를 남기므로 어느 단계에서든 직접 이어받을 수 있습니다.",
      },
      {
        question: "Claude Code로 동영상 타임라인을 편집할 수 있나요?",
        answer:
          "네. npx -y --package=@nodetool-ai/cli-mcp nodetool-mcp install을 실행해 NodeTool을 MCP 서버로 추가하세요. 그러면 Claude Code가 스토리보드를 만들고, 샷을 렌더링하고, 대본에 목소리를 입히고, edit_timeline으로 타임라인을 편집하고, preview_timeline_frame으로 프레임을 확인하고, render_timeline으로 컷을 렌더링할 수 있습니다. 이 타임라인은 다른 타임라인과 똑같이 Studio에서 열립니다.",
      },
      {
        question: "어떤 동영상 모델을 지원하나요?",
        answer:
          "Veo, Kling, Seedance, Sora, Hailuo, Wan 등을 내 키로 fal.ai, Replicate, Kie.ai 같은 프로바이더를 통해 사용합니다. 보드별로 또는 샷별로 모델을 고를 수 있고, 도구를 바꾸지 않고 모델을 바꿀 수 있습니다.",
      },
      {
        question: "여러 샷에서 같은 등장인물을 유지하려면 어떻게 하나요?",
        answer:
          "레퍼런스 이미지와 설명이 있는 캐릭터 엔티티를 만든 다음 스토리보드에서 캐스팅하세요. 그 캐릭터가 나오는 모든 샷에 같은 설명이 들어가고, 레퍼런스 이미지를 받는 모델에는 이미지도 전달됩니다.",
      },
      {
        question: "전체 동영상을 다시 생성하지 않고 샷 하나만 바꿀 수 있나요?",
        answer:
          "네. 샷마다 따로 렌더링되고 자신의 테이크를 보관합니다. 샷 하나를 다시 생성하거나 수정하고 원하는 테이크를 고르면 타임라인이 그것을 사용합니다. 워크플로 설정을 바꾸면 영향받는 클립만 표시됩니다.",
      },
      {
        question: "Premiere Pro나 DaVinci Resolve를 대체할 수 있나요?",
        answer:
          "아니요. NodeTool은 생성, 조립, 그리고 단편에 알맞은 멀티 트랙 편집을 다룹니다. 장편 편집, 색 보정, 마무리에는 전용 편집기를 쓰세요. Premiere Pro XML 전달은 부분적이어서 지원되지 않는 요소는 다시 만들어야 할 수 있습니다.",
      },
    ],
  },
  closing: {
    title: "이미 쓰고 있는 동영상 모델을 연결하세요.",
    body: "Studio는 무료 오픈소스입니다. 이미 결제하고 있는 동영상 모델을 연결하면 모든 프로젝트를 계속 편집할 수 있습니다.",
  },
};
