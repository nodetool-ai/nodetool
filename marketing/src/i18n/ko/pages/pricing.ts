import type { LocalizedPageContent } from "@/i18n/content";
import { KEY_PROVIDERS, LOCAL_RUNTIMES } from "../shared";

/**
 * Translates /pricing (app/pricing/page.tsx, faqEntries.ts). The credit-plan
 * calculator is left out because it is an interactive component. The plan
 * table (SubscriptionSection) is a table section below.
 */
export const pricing: LocalizedPageContent = {
  route: "/pricing",
  name: "요금",
  title: "요금 | 무료 다운로드, 프로바이더에 직접 결제, 마크업 없음 · NodeTool",
  description:
    "NodeTool Studio는 무료 오픈소스입니다. 이미 결제 중인 ChatGPT, Claude, Gemini 플랜으로 실행하거나, 내 프로바이더 API 키를 추가해 정가로 직접 결제하거나, 로컬에서 모델을 무료로 실행하세요. 현재 Cloud 알파는 무료입니다.",
  hero: {
    kicker: "요금",
    h1: "무료로 내려받으세요. 프로바이더 가격 그대로, 덧붙이는 것 없이.",
    lead: "NodeTool Studio는 무료 오픈소스입니다. 이미 결제 중인 ChatGPT, Claude, Gemini 플랜으로 실행하거나, 내 프로바이더 키를 추가해 프로바이더마다 정가를 직접 결제하거나, 내 컴퓨터에서 로컬 모델을 실행해 실행당 비용 없이 쓰세요. 현재 Cloud 알파는 무료이며, 앞으로의 Cloud 요금은 아직 발표되지 않았습니다.",
  },
  sections: [
    {
      kind: "cards",
      id: "editions",
      title: "두 가지 에디션.",
      cards: [
        {
          title: "NodeTool Studio · 영구 무료",
          meta: "데스크톱 앱 · 내 컴퓨터에서 실행",
          body: `macOS, Windows, Linux에서 실행됩니다. 로컬 모델은 ${LOCAL_RUNTIMES}로 실행합니다. 지원되는 클라우드 프로바이더의 내 계정을 사용합니다. 워크플로와 파일은 내 컴퓨터에 남습니다. AGPL-3.0.`,
          link: { label: "Studio 다운로드", href: "/download" },
        },
        {
          title: "NodeTool Cloud · 알파 기간 무료",
          meta: "호스팅 · 설치 없음",
          body: "브라우저에서 실행되며 설치할 것이 없습니다. 지원되는 클라우드 프로바이더의 내 계정을 사용하고, 프로바이더 가격으로 프로바이더에 직접 결제합니다. 직접 호스팅할 수 있는 것과 같은 AGPL-3.0 코드입니다. 앞으로의 Cloud 요금은 아직 발표되지 않았으니, 사용하기 전에 Cloud 페이지에서 현재 알파 약관을 확인하세요.",
          link: { label: "Cloud 사용해 보기(알파)", href: "https://app.nodetool.ai" },
        },
      ],
    },
    {
      kind: "table",
      id: "subscription",
      title: "이미 결제 중인 AI 플랜으로 에이전트를 실행하세요.",
      intro: "Studio에서 ChatGPT 또는 Claude로 로그인하면 종량제 API 요금 대신 구독으로 에이전트가 실행됩니다. ChatGPT와 Gemini 플랜은 이미지도 생성하고, Gemini는 동영상도 생성합니다. 이 실행은 플랜 자체의 한도에 포함됩니다.",
      head: ["플랜", "채팅과 에이전트", "이미지", "동영상"],
      rows: [
        ["ChatGPT", "○", "○", "×"],
        ["Claude", "○", "×", "×"],
        ["Gemini", "○", "○", "○"],
      ],
      note: "구독은 데스크톱 앱인 Studio에서 실행됩니다. Gemini는 로그인한 브라우저에 NodeTool Chrome 확장 프로그램도 필요합니다. 플랜이 다루지 않는 모델은 fal.ai, Kie.ai, Replicate, OpenAI의 내 키를 추가하고 해당 프로바이더에 정가를 직접 결제하세요. NodeTool은 아무것도 붙이지 않습니다.",
    },
    {
      kind: "table",
      id: "compare",
      title: "Studio와 Cloud는 무엇이 다른가요?",
      intro: "Studio는 내 컴퓨터에서 실행되는 무료 데스크톱 앱이고 로컬 모델도 쓸 수 있습니다. Cloud는 같은 오픈소스 작업 공간을 브라우저 탭에서 쓰는 것으로, 알파 기간에는 무료입니다. 둘 다 내 키로 프로바이더를 호출합니다. 대가를 받는 작업에는 완성된 에디션인 Studio를 쓰세요.",
      head: ["기능", "Studio", "Cloud(알파)"],
      rows: [
        ["현재 가격", "무료", "무료(알파)"],
        ["앞으로의 가격", "무료", "미발표"],
        ["실행 위치", "내 컴퓨터(macOS, Windows, Linux)", "내 브라우저, 우리가 호스팅"],
        ["내 API 키 사용", "가능", "가능"],
        ["프로바이더에 직접 결제(마크업 없음)", "예", "예"],
        ["로컬 모델(Ollama, MLX, llama.cpp)", "가능", "불가"],
        ["그래픽 카드 필요 여부", "로컬 모델에만 필요", "필요 없음"],
        ["설치", "데스크톱 앱 설치", "설치 없음, 로그인만"],
        ["오픈소스(AGPL-3.0)", "예", "예"],
        ["언제든 직접 호스팅", "예", "예"],
      ],
    },
    {
      kind: "text",
      id: "byok",
      title: "내 키 사용은 어떻게 작동하나요?",
      body: [
        `쓰려는 프로바이더(${KEY_PROVIDERS} 등)의 API 키를 추가합니다. 모든 요청은 그 프로바이더로 곧장 가고, 프로바이더가 공개한 가격으로 직접 결제합니다. NodeTool은 자체 크레딧을 발행하지 않고 프로바이더 가격에 마크업을 붙이지 않습니다. 알파 기간에는 Cloud 이용 방식과 요금이 바뀔 수 있으니, 특정 플랜에 의존하기 전에 Cloud 페이지를 확인하세요.`,
        "로컬 모델은 Ollama, MLX, llama.cpp로 실행되며 호출당 비용이 없습니다.",
      ],
    },
  ],
  faq: {
    heading: "자주 묻는 질문",
    items: [
      {
        question: "\"내 키 사용\"은 나에게 무슨 뜻인가요?",
        answer:
          "BYOK는 내 프로바이더 API 키를 연결한다는 뜻입니다. 요청은 그 프로바이더로 전달되고, 프로바이더가 공개한 요금으로 직접 결제합니다. NodeTool은 마크업도 크레딧 체계도 없습니다.",
      },
      {
        question: "ChatGPT, Claude, Gemini 구독을 쓸 수 있나요?",
        answer:
          "네, Studio에서 쓸 수 있습니다. ChatGPT 또는 Claude로 로그인하면 에이전트가 API 키 대신 그 구독으로 실행됩니다. NodeTool Chrome 확장 프로그램을 설치하면 로그인해 둔 ChatGPT나 Gemini 탭도 사용합니다. ChatGPT는 이미지를 생성하고, Gemini는 채팅, 이미지, 동영상을 실행합니다. 이 실행은 플랜의 한도에 포함되므로 호출당 결제는 없습니다. 모든 실행은 ChatGPT나 Gemini 기록에 표시됩니다.",
      },
      {
        question: "NodeTool 비용은 얼마인가요?",
        answer:
          "Studio는 무료 오픈소스입니다. Cloud는 알파 기간 동안 무료이며 이후 요금은 아직 발표되지 않았습니다. 프로바이더 API 요금은 별도이고, 구독으로 실행한 작업은 해당 플랜의 한도에 포함됩니다. 로컬 모델은 내 하드웨어와 전기로 실행되며 호출당 프로바이더 요금이 없습니다.",
      },
      {
        question: "NodeTool이 모델 가격에 마크업을 붙이나요?",
        answer: "아니요. 내 API 키를 연결하면 프로바이더가 공개한 요금으로 프로바이더에 직접 결제하며, NodeTool은 아무것도 붙이지 않습니다.",
      },
      {
        question: "Studio와 Cloud 중 무엇을 써야 하나요?",
        answer:
          "꾸준히 작업한다면 Studio를 고르세요. 프로젝트를 내 컴퓨터에 저장하고 온라인 프로바이더와 로컬 모델을 지원합니다. 설치 없이 브라우저에서 써 보려면 Cloud를 고르세요. Cloud는 알파 단계이고, 에디션 사이의 프로젝트 이전은 아직 완전하지 않습니다.",
      },
      {
        question: "모델을 로컬에서 실행할 수 있나요?",
        answer: `네. Studio는 ${LOCAL_RUNTIMES}로 로컬 모델을 지원합니다. 사용할 수 있는 모델과 속도는 하드웨어에 따라 다릅니다.`,
      },
    ],
  },
  closing: {
    title: "무료로, 내 컴퓨터에서 시작하세요.",
    body: "Studio를 내려받아 몇 분 만에 첫 워크플로를 만들어 보세요.",
  },
};
