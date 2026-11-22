import type { LocalizedPageContent } from "@/i18n/content";
import { LOCAL_RUNTIMES, OPEN_SOURCE_LINE, UI_LANGUAGE_LINE } from "../shared";

/** Translates /studio (app/studio/page.tsx, data/studioPage.ts, StudioHero). */
export const studio: LocalizedPageContent = {
  route: "/studio",
  name: "Studio 데스크톱",
  title: "NodeTool Studio | AI 에이전트와 함께 만들고, 프로젝트는 내 컴퓨터에 저장",
  description:
    "macOS, Windows, Linux용 무료 오픈소스 NodeTool 데스크톱 앱입니다. 에이전트가 NodeTool 편집기 안에서 이미지, 동영상, 오디오, 텍스트를 만들고 프로젝트는 내 컴퓨터에 저장됩니다. ChatGPT, Claude, Gemini 플랜이나 내 API 키, 로컬 모델로 실행하세요.",
  hero: {
    kicker: "NodeTool Studio · 데스크톱 에디션",
    h1: "AI 에이전트와 함께 만드세요. 프로젝트는 내 컴퓨터에 저장하세요.",
    lead: "Studio는 무료 NodeTool 데스크톱 앱입니다. AI 에이전트가 NodeTool 편집기 안에서 이미지, 동영상, 오디오, 텍스트를 만듭니다. 어떤 샷이든 고치고, 대사를 다시 쓰고, 워크플로를 조정할 수 있습니다. 프로젝트는 내 컴퓨터에 저장됩니다.",
    note: `${OPEN_SOURCE_LINE} 본격적인 프로젝트에 권장합니다.`,
    secondary: { label: "편집기 둘러보기", href: "#editors" },
    media: {
      kind: "reel",
      base: "/hero-sizzle",
      alt: "NodeTool Studio: 하나의 브리프가 에이전트 채팅, 스토리보드, 그래프 캔버스, 스케치, 대본, 타임라인을 거쳐 하나의 프로젝트가 되는 과정",
      caption: "데스크톱 앱에서 녹화했습니다. 에이전트가 스토리보드를 짜고, 샷을 생성해 비교하고, 그림을 그리고, 목소리를 녹음하고, 동영상을 편집합니다.",
    },
  },
  sections: [
    {
      kind: "cards",
      id: "editors",
      title: "디테일은 직접 연출하세요.",
      intro: "바꾸려는 내용에 맞는 편집기에서 같은 프로젝트를 여세요. 샷, 대사 낭독, 레이어, 컷의 타이밍을 처음부터 다시 하지 않고 고칠 수 있습니다.",
      cards: [
        { title: "스토리보드", body: "샷의 설명, 카메라, 등장인물을 고치고 새 버전을 생성합니다. 렌더링 전에 프롬프트를 미리 보고 쓸 테이크를 고를 수 있습니다. 다른 샷은 그대로 둡니다." },
        { title: "대본과 목소리", body: "장면과 대사를 쓰고 대사마다 목소리를 입힙니다. 대사 하나를 고치면 그 대사의 목소리만 다시 생성합니다." },
        { title: "타임라인", body: "멀티 트랙 타임라인에서 트림, 분할, 전환, 자막, 음악, 키프레임을 다룹니다. 생성된 클립은 샷 순서대로 타임라인에 놓입니다." },
        { title: "스케치", body: "레이어가 있는 이미지 편집기입니다. 한 번에 레이어 하나만 다시 생성하고, 나머지 레이어는 건드리지 않습니다." },
        { title: "3D와 게임", body: "오브젝트, 조명, 머티리얼을 배치해 장면을 렌더링합니다. 내장 엔진으로 2D와 3D 게임을 만들고 플레이해 볼 수도 있습니다." },
        { title: "노드", body: "모든 프로젝트 아래에는 노드 그래프가 있습니다. 잘 된 과정을 저장해 두었다가 새 입력으로 다시 실행하세요." },
      ],
    },
    {
      kind: "text",
      id: "timelines",
      title: "모든 영화는 열어 볼 수 있는 타임라인입니다.",
      body: [
        "이 영상들은 NodeTool로 만들었습니다. 하나하나가 납작한 동영상 파일이 아니라 프로젝트입니다. Studio에서 열면 장면, 텍스트, 애니메이션을 바꿀 수 있습니다.",
        "Studio에서 로고 메뉴의 \"예제\"를 열고 \"타임라인\"을 고른 다음, 영화를 찾아 \"편집 가능한 타임라인 열기\"를 선택하세요.",
      ],
      links: [{ label: "NodeTool로 만든 영화 보기", href: "/storyboards" }],
    },
    {
      kind: "text",
      id: "ownership",
      kicker: "내 컴퓨터에서 실행",
      title: "프로젝트는 내 컴퓨터에 남습니다.",
      body: [
        "Studio는 프로젝트를 내 컴퓨터에 저장합니다. 온라인 AI 프로바이더나 서비스를 쓸 때만 인터넷에 연결됩니다.",
        `지원되는 언어 모델과 이미지 모델은 ${LOCAL_RUNTIMES}로 로컬에서 실행할 수 있습니다. 어떤 모델을 로컬에서 돌릴 수 있는지는 컴퓨터의 하드웨어에 따라 달라집니다.`,
      ],
      bullets: [
        "프로젝트 파일: Studio는 워크스페이스, 워크플로, 미디어를 내 컴퓨터에 저장합니다. 파일을 어디에 둘지, 언제 옮길지는 내가 정합니다.",
        "온라인 AI 프로바이더: 호스팅 모델이 작업에 맞을 때 내 프로바이더 계정을 연결하세요. 이 요청에는 네트워크 연결이 필요하며 프로바이더의 약관을 따릅니다.",
        "오프라인 작업: 프로젝트가 로컬 파일과 지원되는 로컬 모델만 쓴다면 Studio는 네트워크 없이도 작동합니다. 원격 프로바이더, 다운로드, 온라인 서비스에는 여전히 연결이 필요합니다.",
      ],
      media: {
        kind: "image",
        src: "/screen_model_manager.webp",
        width: 1600,
        height: 1089,
        alt: "로컬에서 사용할 수 있는 모델을 보여 주는 NodeTool 모델 관리자",
        caption: "모델 관리자로 로컬 모델을 내려받거나 프로바이더 계정을 연결하세요.",
      },
    },
    {
      kind: "table",
      id: "setup",
      title: "지금 가진 환경에서 시작하세요.",
      intro: "고성능 컴퓨터는 필요하지 않습니다. 내 컴퓨터에서 AI 모델을 실행하는 것은 선택 사항입니다.",
      head: ["항목", "설명"],
      rows: [
        ["데스크톱 플랫폼", "Studio는 macOS, Windows, Linux에서 사용할 수 있습니다."],
        ["그래픽 하드웨어", "호스팅 프로바이더를 쓴다면 전용 GPU는 선택 사항입니다. 더 큰 모델을 로컬에서 실행하려고 할 때 중요해집니다."],
        ["모델 다운로드", "내 프로바이더 계정으로 Studio를 쓰거나, 지원되는 모델을 내려받아 로컬에서 실행하세요."],
        ["표시 언어", UI_LANGUAGE_LINE],
      ],
    },
    {
      kind: "table",
      id: "specs",
      title: "사양",
      head: ["항목", "설명"],
      rows: [
        ["에이전트", "Studio에서 ChatGPT, Claude, Gemini 플랜으로 실행됩니다."],
        ["비용", "프로바이더 정가 그대로입니다. 내 키를 쓰면 NodeTool은 아무것도 붙이지 않습니다."],
        ["실행 환경", "macOS, Windows, Linux. MCP, CLI, HTTP API."],
      ],
    },
  ],
  faq: {
    heading: "Studio에 대한 질문",
    items: [
      {
        question: "Studio와 Cloud 중 무엇을 써야 하나요?",
        answer:
          "꾸준히 작업한다면 Studio를 고르세요. 프로젝트를 내 컴퓨터에 저장하고, macOS, Windows, Linux에서 온라인 프로바이더와 로컬 모델을 지원합니다. 설치 없이 브라우저에서 NodeTool을 써 보려면 Cloud를 고르세요. Cloud는 알파 단계이고, 에디션 사이의 프로젝트 이전은 아직 완전하지 않습니다. 필요한 파일과 기능이 제대로 옮겨지는지 확인하세요.",
      },
      {
        question: "NodeTool은 로컬 우선이고 프라이버시를 지키나요?",
        answer: `NodeTool Studio는 워크스페이스, 워크플로, 파일, 설정한 자격 증명을 내 컴퓨터에 저장합니다. 지원되는 오픈 웨이트 모델은 ${LOCAL_RUNTIMES}로 로컬에서 실행할 수 있습니다. 호스팅 모델을 호출하면 요청이 내 컴퓨터를 떠나 해당 프로바이더로 전송됩니다. Cloud는 호스팅된 프로젝트 저장소를 사용하므로, 민감한 자료를 쓰기 전에 현재 개인정보 처리방침과 이용약관을 확인하세요.`,
      },
      {
        question: "NodeTool을 실행하려면 GPU가 필요한가요?",
        answer:
          "아니요. Studio는 호스팅 프로바이더를 사용할 수 있고, 이 경우 모델은 프로바이더의 하드웨어에서 실행됩니다. GPU는 지원되는 오픈 웨이트 모델을 내 컴퓨터에서 실행하기로 했을 때만 중요합니다. 그때 필요한 성능은 모델과 실행 환경에 따라 다르며, 작은 모델은 CPU에서 느리게 실행될 수도 있습니다.",
      },
      {
        question: "Studio는 인터넷 연결 없이 작동하나요?",
        answer:
          "프로젝트가 로컬 파일과 내 컴퓨터에 설치된 지원 로컬 모델만 쓴다면 Studio는 네트워크 없이도 작업을 이어 갈 수 있습니다. 원격 프로바이더, 모델 다운로드, 온라인 문서, 그 밖의 호스팅 서비스에는 여전히 연결이 필요합니다.",
      },
    ],
  },
  closing: {
    title: "Studio에서 다음 프로젝트를 시작하세요.",
    body: "macOS, Windows, Linux용 무료 데스크톱 앱을 내려받으세요. 앱과 소스 코드는 AGPL-3.0으로 공개되어 있습니다.",
    secondary: { label: "Cloud 사용해 보기(알파)", href: "https://app.nodetool.ai" },
  },
};
