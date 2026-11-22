import type { LocalizedPageContent } from "@/i18n/content";
import { KEY_PROVIDERS, LOCAL_RUNTIMES } from "../shared";

/** Translates /agents (app/agents/page.tsx, data/agentsPage.ts). */
export const agents: LocalizedPageContent = {
  route: "/agents",
  name: "에이전트",
  title: "NodeTool 에이전트 | 오픈소스 크리에이티브 하니스, 에이전트에게 창작 도구를",
  description:
    "AI 에이전트가 이미지, 동영상, 오디오, 워크플로를 만들고 편집할 수 있는 도구입니다. NodeTool 내장 에이전트를 쓰거나 MCP로 Claude Code, Codex, Cursor를 연결하세요. 작업을 검사하고 언제든 직접 이어받을 수 있습니다.",
  hero: {
    kicker: "오픈소스 크리에이티브 하니스",
    h1: "Claude Code에 크리에이티브 하니스를 주세요.",
    lead: "에이전트에게 이미지, 동영상, 오디오, 워크플로를 만들고 편집하는 도구를 주세요. NodeTool 내장 에이전트를 쓰거나 MCP로 Claude Code, Codex, Cursor를 연결하세요. 에이전트의 작업을 검사하고, 필요할 때 언제든 직접 이어받을 수 있습니다.",
    note: "AGPL-3.0 오픈소스 · 내 모델과 내 키 · MCP, CLI, API",
    secondary: { label: "내 에이전트 연결하기", href: "/mcp" },
    media: {
      kind: "reel",
      base: "/agent-redo",
      alt: "에이전트가 6샷 스토리보드를 렌더링합니다. 수정 메모 하나로 3번 샷이 밤 장면으로 바뀌고, 그 샷만 다시 렌더링되어 타임라인 컷에 새 테이크가 들어갑니다.",
    },
  },
  sections: [
    {
      kind: "steps",
      id: "loop",
      title: "만들고, 검증하고, 실행하고, 점검하고, 고칩니다.",
      intro: "아래 도구 이름은 NodeTool MCP 서버가 에이전트에게 제공하는 도구 그대로입니다.",
      steps: [
        { title: "만들기", meta: "create_workflow", body: "에이전트가 노드를 추가하고, 모델을 고르고, 그래프를 연결합니다. 워크플로를 저장하기 전에 선택한 프로바이더와 모델이 존재하는지 확인합니다." },
        { title: "검증", meta: "validate_workflow", body: "모델을 호출하기 전에 워크플로에 오류가 없는지 확인합니다." },
        { title: "실행", meta: "run_workflow", body: "로컬 모델이나 내 프로바이더 계정으로 워크플로를 실행합니다. 빠진 API 키는 시작하기 전에 알려 줍니다." },
        { title: "점검", meta: "get_job_logs", body: "모든 도구 호출, 출력, 오류가 로그에 남고, 실패한 노드도 함께 표시됩니다." },
        { title: "수정", meta: "create_workflow_version", body: "에이전트는 변경 사항을 새 버전으로 저장하므로 언제든 이전 버전으로 돌아갈 수 있습니다." },
      ],
    },
    {
      kind: "text",
      id: "validate",
      title: "validate_workflow가 알려 주는 것.",
      body: ["유료 모델 호출이 일어나기 전에, 검증은 다음 문제를 찾아냅니다."],
      bullets: [
        "알 수 없는 노드 타입",
        "비어 있는 필수 속성, 한 번도 선택하지 않은 모델",
        "선택한 프로바이더가 제공하지 않는 모델 ID",
        "타입이 맞지 않거나 어디로도 이어지지 않는 연결",
        "파싱되지 않거나, 정의되지 않은 이름을 읽거나, 출력을 설정하지 않은 코드 노드",
        "이 설치에서 찾을 수 없는 프로바이더 키",
      ],
      links: [{ label: "Claude Code, Codex, Cursor는 명령어 하나로 연결됩니다", href: "/mcp" }],
    },
    {
      kind: "cards",
      id: "surfaces",
      title: "나와 에이전트는 같은 편집기를 씁니다.",
      intro: "에이전트는 내가 Studio에서 여는 문서와 같은 문서를 편집합니다. 에이전트가 멈추면 작업은 이미 편집기 안에 있습니다.",
      cards: [
        { title: "워크플로", body: "노드를 연결하고, 모델을 고르고, 그래프를 검증하고, 실행합니다." },
        { title: "스토리보드", body: "브리프를 샷으로 나누고 샷마다 프레임을 렌더링합니다." },
        { title: "타임라인", body: "클립을 배치하고, 컷을 다듬고, 편집본을 렌더링합니다." },
        { title: "대본", body: "장면을 쓰고 대사에 목소리를 입힙니다." },
        { title: "스케치", body: "레이어가 있는 이미지를 만들고 한 번에 레이어 하나씩 편집합니다." },
        { title: "3D 장면", body: "오브젝트, 조명, 머티리얼을 배치하고 장면을 렌더링합니다." },
        { title: "게임", body: "엔티티를 배치하고, 동작을 작성하고, 아트를 생성하고, 레벨을 플레이 테스트합니다." },
        { title: "앱", body: "위젯을 배치하고, 워크플로에 연결하고, 앱이 실행되는지 확인합니다." },
      ],
    },
    {
      kind: "cards",
      id: "control",
      title: "모든 단계가 기록에 남습니다.",
      intro: "에이전트가 한 일을 읽고, 언제든 작업을 되찾아 올 수 있습니다.",
      cards: [
        { title: "전체 기록", body: "도구 호출마다 인자, 결과, 오류를 읽을 수 있습니다. 잘못된 단계를 찾아내세요." },
        { title: "언제든 직접 이어받기", body: "에이전트를 멈추고, 노드 하나를 직접 고친 다음 작업을 돌려주세요. 에이전트는 내가 남긴 그대로의 그래프를 읽습니다." },
        { title: "내 키", body: "빠진 API 키가 있으면 Studio가 추가하라고 안내합니다. 인터페이스 없이 시작한 실행은 필수 키가 없으면 오류와 함께 멈춥니다." },
      ],
    },
    {
      kind: "table",
      id: "modes",
      title: "에이전트가 혼자 할 수 있는 범위를 정하세요.",
      intro: "채팅마다 권한 모드가 있습니다. 읽기와 검색은 모든 모드에서 실행됩니다. 모드는 나머지 작업을 어떻게 처리할지 정합니다.",
      head: ["모드", "동작"],
      rows: [
        ["Plan(계획)", "에이전트가 조사하고 계획을 제안합니다. 아무것도 실행하지 않습니다."],
        ["Default(기본)", "읽기는 알아서 실행됩니다. 변경, 생성, 외부 호출을 하는 작업은 실행 전에 내가 승인합니다."],
        ["Auto(자동)", "에이전트가 묻지 않고 작업합니다. 모든 도구 호출은 여전히 로그에 남습니다."],
      ],
    },
    {
      kind: "table",
      id: "specs",
      title: "사양",
      head: ["항목", "설명"],
      rows: [
        ["에이전트", "Studio에서 ChatGPT, Claude, Gemini 플랜으로 실행됩니다."],
        ["모델", `호스팅 모델은 내 키로 사용합니다(${KEY_PROVIDERS} 등). 로컬 모델은 ${LOCAL_RUNTIMES}로 실행합니다.`],
        ["비용", "프로바이더 정가 그대로입니다. 내 키를 쓰면 NodeTool은 아무것도 붙이지 않습니다."],
        ["소스", "오픈소스, AGPL-3.0. 프로젝트는 내 디스크에 있는 파일입니다."],
      ],
    },
  ],
  faq: {
    heading: "만들기 전에 궁금한 점.",
    items: [
      {
        question: "NodeTool이 에이전트 우선이라는 것은 무슨 뜻인가요?",
        answer:
          "에이전트는 내가 NodeTool에서 여는 프로젝트, 즉 스토리보드, 타임라인, 워크플로를 그대로 편집합니다. 에이전트의 도구 호출, 결과, 오류를 확인한 다음 직접 이어받을 수 있습니다. 외부 코딩 에이전트도 MCP로 NodeTool을 사용할 수 있습니다.",
      },
      {
        question: "크리에이티브 하니스란 무엇인가요?",
        answer:
          "크리에이티브 하니스는 AI 에이전트에게 도구, 편집기, 모델 접근, 작업 기록을 제공합니다. NodeTool은 이를 내장 에이전트와 MCP로 연결된 코딩 에이전트에게 제공합니다. 에이전트의 작업은 직접 편집할 수 있는 프로젝트와 워크플로로 저장됩니다.",
      },
      {
        question: "플래닝 에이전트란 무엇인가요?",
        answer:
          "플래닝 에이전트는 목표를 받아 단계로 나누고, 단계마다 모델이나 도구를 고르고, 순서대로 처리하며 필요하면 방향을 조정합니다. NodeTool에서 에이전트는 캔버스 위의 블록이므로, 그 결과가 워크플로의 나머지 부분으로 이어집니다.",
      },
    ],
  },
  closing: {
    title: "에이전트에게 첫 워크플로를 만들어 보라고 하세요.",
    body: "Studio를 내려받아 에이전트가 직접 열고, 바꾸고, 다시 실행할 수 있는 워크플로를 만드는 모습을 지켜보세요.",
    secondary: { label: "에이전트 문서 읽기", href: "https://docs.nodetool.ai" },
  },
};
