import type { LocalizedPageContent } from "@/i18n/content";
import { AGGREGATORS, LOCAL_RUNTIMES } from "../shared";

/** Translates /models (app/models/page.tsx). */
const compare = (title: string, slug: string) => ({
  title,
  body: "같은 프롬프트, 모델 둘, 나란히 비교.",
  link: { label: "비교 보기", href: `/models/${slug}` },
});

export const models: LocalizedPageContent = {
  route: "/models",
  name: "지원 모델",
  title: "지원하는 AI 모델 | 모든 최상위 모델이 하나의 노드 · NodeTool",
  description:
    "NodeTool이 지원하는 이미지, 동영상, 음성, 언어 모델입니다. Flux, Seedance, Wan, Veo, Kling, Hailuo 등을 내 키로 프로바이더 가격에 쓰거나, Ollama와 llama.cpp로 로컬에서 실행하세요.",
  hero: {
    kicker: "모델 디렉터리",
    h1: "모든 최상위 모델이 하나의 노드입니다.",
    lead: "지금 쓸 수 있는 최고의 이미지 및 동영상 모델이 모여 있습니다. 어느 모델이든 시각적 워크플로에서 실행하고, 하나씩 이어 붙이고, 두 모델에 같은 프롬프트를 주고 비교해 보세요. 내 키로 프로바이더 가격에 사용합니다. 현재 {providerCount}개 프로바이더의 모델 {modelCount}개를 지원합니다.",
    primary: { label: "모델 전체 보기", href: "#featured" },
    secondary: { label: "Studio 무료 다운로드", href: "/download" },
  },
  sections: [
    {
      kind: "text",
      id: "providers",
      title: "내 키로 프로바이더에 직접 연결합니다.",
      body: [
        "설정에서 프로바이더의 API 키를 추가하면 NodeTool이 해당 프로바이더를 직접 호출하고, 프로바이더가 공개한 가격으로 직접 결제합니다. NodeTool은 자체 크레딧을 발행하지 않고 가격에 아무것도 붙이지 않습니다.",
        "Flux, Seedance, Wan, Veo, Kling, Hailuo, Qwen Image, Whisper, ElevenLabs, Suno 같은 주요 모델을 FAL, KIE, OpenAI, Anthropic, Gemini, Replicate, Together, Groq, Mistral, OpenRouter, HuggingFace 같은 프로바이더를 통해 사용할 수 있습니다.",
      ],
    },
    {
      kind: "text",
      id: "local",
      title: "내 컴퓨터에서 모델 실행하기.",
      body: [
        `지원되는 오픈 웨이트 모델은 ${LOCAL_RUNTIMES}로 로컬에서 실행할 수 있고, 키도 호출당 요금도 필요 없습니다. 어떤 모델을 얼마나 빠르게 돌릴 수 있는지는 하드웨어에 따라 다릅니다.`,
      ],
      links: [{ label: "로컬 모델과 클라우드 모델", href: "https://docs.nodetool.ai/models" }],
    },
    {
      kind: "catalog",
      id: "featured",
      title: "동영상과 이미지 모델",
      intro: `아래 모델은 ${AGGREGATORS} 같은 프로바이더를 통해 호출하며, 카드마다 해당 모델을 제공하는 프로바이더 수가 표시됩니다.`,
      source: "models",
    },
    {
      kind: "cards",
      id: "compare",
      title: "같은 프롬프트, 모델 둘, 나란히 비교.",
      cards: [
        compare("Veo 3 vs Sora 2", "veo-3-vs-sora"),
        compare("Veo 3 vs Kling", "veo-3-vs-kling"),
        compare("Sora 2 vs Kling", "sora-vs-kling"),
        compare("Kling vs Hailuo", "kling-vs-hailuo"),
        compare("Seedance vs Kling", "seedance-vs-kling"),
        compare("Hailuo vs Wan", "hailuo-vs-wan"),
        compare("FLUX vs Seedream", "flux-vs-seedream"),
        compare("FLUX vs GPT Image", "flux-vs-gpt-image"),
        compare("Imagen vs FLUX", "imagen-vs-flux"),
        compare("GPT Image vs Imagen", "gpt-image-vs-imagen"),
      ],
    },
  ],
  faq: {
    heading: "자주 묻는 질문",
    items: [
      {
        question: "어떤 모델을 지원하나요?",
        answer: `Flux, Seedance, Wan, Veo, Kling, Hailuo, Qwen Image, Whisper, ElevenLabs, Suno 같은 주요 모델을 FAL, KIE, OpenAI, Anthropic, Gemini, Replicate, Together, Groq, Mistral, OpenRouter, HuggingFace 같은 프로바이더를 통해 사용할 수 있습니다. ${LOCAL_RUNTIMES}로 내 컴퓨터에서 실행할 수도 있습니다.`,
      },
      {
        question: "\"내 키 사용\"은 나에게 무슨 뜻인가요?",
        answer:
          "BYOK는 내 프로바이더 API 키를 연결한다는 뜻입니다. 요청은 그 프로바이더로 전달되고, 프로바이더가 공개한 요금으로 직접 결제합니다. NodeTool은 마크업도 크레딧 체계도 없습니다.",
      },
      {
        question: "NodeTool이 모델 가격에 마크업을 붙이나요?",
        answer: "아니요. 내 API 키를 연결하면 프로바이더가 공개한 요금으로 프로바이더에 직접 결제하며, NodeTool은 아무것도 붙이지 않습니다.",
      },
      {
        question: "모델을 로컬에서 실행할 수 있나요?",
        answer: `네. Studio는 ${LOCAL_RUNTIMES}(MLX는 Apple Silicon용)로 로컬 모델을 지원합니다. 사용할 수 있는 모델과 속도는 하드웨어에 따라 다릅니다. 로컬 모델 요청은 내 컴퓨터에서 실행되고, 온라인 프로바이더는 내가 보내는 요청을 여전히 받습니다.`,
      },
      {
        question: "NodeTool을 실행하려면 GPU가 필요한가요?",
        answer:
          "아니요. Studio는 호스팅 프로바이더를 사용할 수 있고, 이 경우 모델은 프로바이더의 하드웨어에서 실행됩니다. GPU는 지원되는 오픈 웨이트 모델을 내 컴퓨터에서 실행하기로 했을 때만 중요합니다. 그때 필요한 성능은 모델과 실행 환경에 따라 다르며, 작은 모델은 CPU에서 느리게 실행될 수도 있습니다.",
      },
    ],
  },
  readMore: {
    heading: "더 읽어 보기",
    links: [
      { label: "프로바이더와 API 키", href: "/providers" },
      { label: "요금", href: "/pricing" },
      { label: "노드 워크플로", href: "/node-based-workflows" },
      { label: "모델과 프로바이더 가이드", href: "https://docs.nodetool.ai/models-and-providers" },
      { label: "비용과 크레딧 가이드", href: "https://docs.nodetool.ai/costs-and-credits" },
    ],
  },
  closing: {
    title: "도구는 그대로, 모델만 바꾸세요.",
    body: "무료 오픈소스 Studio를 내려받아 이미 가진 프로바이더 키를 연결하거나 모델을 로컬에서 실행하세요.",
  },
};
