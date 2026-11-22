import type { LocalizedPageContent } from "@/i18n/content";
import { LOCAL_RUNTIMES, OPEN_SOURCE_LINE } from "../shared";

/** Translates /node-based-workflows (app/node-based-workflows/page.tsx). */
export const nodeBasedWorkflows: LocalizedPageContent = {
  route: "/node-based-workflows",
  name: "노드 워크플로",
  title: "노드 워크플로 | 검사하고, 실행하고, 다시 실행하는 AI 워크플로 · NodeTool",
  description:
    "NodeTool은 오픈소스 노드 기반 AI 워크플로 캔버스입니다. 이미지, 동영상, 오디오, 텍스트 모델을 하나의 그래프로 연결하고, 각 단계가 실행되는 모습을 보고, 같은 그래프를 새 입력으로 다시 실행하세요.",
  hero: {
    kicker: "노드 워크플로",
    h1: "검사하고, 실행하고, 다시 실행하는 노드 워크플로.",
    lead: "NodeTool은 오픈소스 노드 기반 AI 워크플로 캔버스입니다. 이미지, 동영상, 오디오, 텍스트 모델을 하나의 그래프로 연결하고, 각 단계가 실행되는 모습을 보고, 같은 그래프를 새 입력으로 다시 실행하세요.",
    note: OPEN_SOURCE_LINE,
    secondary: { label: "워크플로 템플릿 둘러보기", href: "/templates" },
    media: {
      kind: "reel",
      base: "/hero-nodes",
      alt: "NodeTool 워크플로를 연결하는 모습. 타입이 맞지 않는 연결은 거부되고, 다섯 샷이 For Each, Text To Image, Image To Video, Collect, Concatenate Video를 거쳐 하나의 컷이 된 다음 이미지 모델이 교체됩니다.",
      caption: "하나의 워크플로로 연결부터 완성된 컷까지. 샷은 NodeTool에 포함된 Under the Bed 예제에서 가져왔습니다.",
    },
  },
  sections: [
    {
      kind: "cards",
      id: "fail-early",
      title: "유료 실행 전에 끊어진 연결을 찾아냅니다.",
      intro: "Kie.ai에서 5초짜리 {clipModel} 클립 다섯 개는 {fiveClipPrice}입니다. 그만한 비용이 드는 워크플로는 아홉 번째 단계가 아니라 첫 호출 전에 실패해야 합니다. 아래 설계가 NodeTool이 오류를 일찍, 그리고 분명하게 알리도록 합니다.",
      cards: [
        { title: "타입이 있는 포트", body: "모든 입력과 출력에는 텍스트, 이미지, 동영상, 오디오, 리스트 같은 타입이 선언되어 있습니다. 편집기는 연결을 받아들이기 전에 타입을 확인하므로 동영상이 텍스트 프롬프트에 연결되는 일이 없습니다." },
        { title: "결제 전 검증", body: "nodetool validate는 그래프를 실행하지 않고 읽기만 합니다. 알 수 없는 노드, 빠진 필수 필드, 타입이 맞지 않는 연결, 존재하지 않는 모델 ID를 알려 줍니다. 에이전트는 validate_workflow 도구로 같은 검사를 받습니다." },
        { title: "모든 단계가 화면에", body: "노드마다 대기 중인지, 실행 중인지, 끝났는지 표시하고 자신의 출력을 보관합니다. 실행이 실패하면 어느 단계에서 무엇이 나왔는지 볼 수 있습니다." },
        { title: "그래프는 그대로, 모델만 교체", body: "Text To Image, Image To Video, Text To Speech는 선택한 모델을 제공하는 프로바이더로 라우팅됩니다. 필드 하나에서 Seedream을 FLUX나 Imagen으로 바꿔도 연결은 그대로입니다." },
        { title: "일괄 처리와 흐름 제어", body: "For Each는 항목마다 다음 단계를 실행하고 Collect는 결과를 모읍니다. If, Switch, Fallback으로 분기하고, Subgraph는 노드 묶음을 하나로 접습니다." },
        { title: "캔버스 밖에서도 실행", body: "만든 그래프가 곧 호출하는 그래프입니다. nodetool run으로 실행하거나, 실행 엔드포인트에 POST해 JSON을 받거나, MCP 서버로 Cursor나 Claude Code에 넘기세요." },
      ],
      note: "Kie.ai 정가, 데이터는 genspend.io 기준.",
    },
    {
      kind: "steps",
      id: "walkthrough",
      title: "영상 속 워크플로를 노드별로.",
      intro: "노드 일곱 개가 샷 프롬프트 다섯 개를 편집된 동영상 하나로 바꿉니다. 여섯 번째 프롬프트를 추가하면 같은 그래프가 여섯 샷을 만듭니다. 영화 트레일러 생성기 템플릿도 같은 구조를 씁니다.",
      steps: [
        { title: "String List Input", meta: "nodetool.input.StringListInput", body: "샷 프롬프트 다섯 개를 담습니다." },
        { title: "For Each", meta: "nodetool.control.ForEach", body: "프롬프트를 하나씩 순번과 함께 내보냅니다." },
        { title: "Text To Image", meta: "nodetool.image.TextToImage", body: "고른 이미지 모델로 프롬프트마다 스틸 이미지를 만듭니다." },
        { title: "Image To Video", meta: "nodetool.video.ImageToVideo", body: "고른 동영상 모델로 스틸 이미지마다 움직임을 줍니다." },
        { title: "Collect", meta: "nodetool.control.Collect", body: "클립 다섯 개가 모두 끝날 때까지 기다렸다가 하나의 리스트로 넘깁니다." },
        { title: "Concatenate Video", meta: "nodetool.video.Concat", body: "리스트를 하나의 동영상으로 이어 붙입니다." },
        { title: "Output", meta: "nodetool.output.Output", body: "편집된 영상을 캔버스, CLI, API 호출자에게 돌려줍니다." },
      ],
    },
    {
      kind: "cards",
      id: "nodes",
      title: "수백 개의 노드, 하나의 캔버스.",
      intro: "모델, 미디어, 데이터, 파일을 다루는 노드가 기본으로 들어 있고, Replicate, FAL, Kie.ai에 있는 수천 개 모델용으로 생성된 노드도 있습니다. 일부 예시입니다.",
      cards: [
        { title: "이미지", body: "Text To Image, Image To Image, Upscale Image, Remove Background, Segment Image, Apply Mask, Compare Images, Image To 3D" },
        { title: "동영상", body: "Text To Video, Image To Video, Concatenate Video, Extract Video Frame, Extract Audio, Trim, Overlay" },
        { title: "오디오", body: "Text To Speech, Speech to Text, Text To Music, Overlay Audio, Concatenate Audio, Transcribe" },
        { title: "텍스트와 에이전트", body: "Agent, Summarizer, Extractor, Classifier, Structured Output Generator, Enhance Prompt, Web Search" },
        { title: "로직, 데이터, 코드", body: "For Each, Collect, If, Switch, Fallback, Subgraph, Code, Hybrid Search, Webhook Trigger" },
        {
          title: "에이전트가 연결하게 하기",
          body: "원하는 워크플로를 한 문장으로 설명하세요. 내장 에이전트가 노드를 고르고, 같은 캔버스에서 연결하고 실행합니다. 에이전트가 놓은 노드는 모두 편집할 수 있습니다.",
          link: { label: "에이전트 작동 방식", href: "/agents" },
        },
      ],
    },
  ],
  faq: {
    heading: "자주 묻는 질문",
    items: [
      {
        question: "노드 워크플로란 무엇인가요?",
        answer:
          "노드 워크플로는 그래프로 그린 과정입니다. 노드마다 이미지 생성이나 클립 이어 붙이기 같은 한 가지 일을 하고, 연결선이 한 노드의 출력을 다음 노드의 입력으로 넘깁니다. 그래프는 저장되므로 같은 과정을 새 입력으로 다시 실행할 수 있습니다.",
      },
      {
        question: "노드 워크플로는 자동화 단계 목록과 무엇이 다른가요?",
        answer:
          "단계 목록은 위에서 아래로 실행됩니다. 노드 그래프는 하나의 출력을 여러 갈래로 나누고, 리스트의 항목마다 한 단계를 실행하고, 결과를 다시 합칠 수 있으며, 이 모든 것을 하나의 캔버스에서 볼 수 있습니다. NodeTool은 각 연결의 양쪽 타입이 맞는지도 확인합니다.",
      },
      {
        question: "NodeTool에서 노드 워크플로를 만들려면 코딩이 필요한가요?",
        answer:
          "아니요. 메뉴에서 노드를 추가하고 연결선을 끌어 연결하거나, 내장 에이전트에게 만들어 달라고 하세요. 코드가 필요하면 Code 노드가 샌드박스 안에서 JavaScript를 실행하고, 워크플로를 TypeScript 파일로 작성할 수도 있습니다.",
      },
      {
        question: "노드에서 어떤 AI 모델을 쓸 수 있나요?",
        answer: `fal, Replicate, Kie.ai, Together AI, OpenAI, Google, ElevenLabs 같은 프로바이더의 호스팅 모델을 내 키와 정가로 사용할 수 있고, ${LOCAL_RUNTIMES}를 통한 로컬 모델은 키 없이 쓸 수 있습니다.`,
      },
    ],
  },
  readMore: {
    heading: "더 읽어 보기",
    links: [
      { label: "지원되는 모든 모델", href: "/models" },
      { label: "코딩 에이전트용 MCP 서버", href: "/mcp" },
      { label: "ComfyUI와 비교", href: "/alternatives/comfyui" },
      { label: "워크플로 템플릿", href: "/templates" },
      { label: "노드 레퍼런스", href: "https://docs.nodetool.ai/nodes/" },
      { label: "첫 워크플로", href: "https://docs.nodetool.ai/first-workflow" },
    ],
  },
  closing: {
    title: "첫 워크플로를 연결해 보세요.",
    body: "NodeTool Studio는 무료 오픈소스입니다. 템플릿이나 빈 캔버스에서 시작해 내 키나 로컬 모델로 실행하세요.",
  },
};
