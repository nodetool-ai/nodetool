/**
 * The provider registry behind the Models & Providers settings tab.
 *
 * Kept apart from the tab component so anything that needs to know which
 * secret keys belong to an AI provider — the "has a provider configured"
 * signal the dashboard checklist and the empty workspace read — has one source
 * to read instead of its own hardcoded list.
 */
import { PROVIDER_IDS, type ProviderId } from "@nodetool-ai/protocol";
import { isElectron, isLocalhost } from "../../lib/env";

// Provider icons vendored from @lobehub/icons-static-svg (see src/icons/providers/README.md)
import openaiIcon from "../../icons/providers/openai.svg";
import anthropicIcon from "../../icons/providers/anthropic.svg";
import openrouterIcon from "../../icons/providers/openrouter.svg";
import cerebrasColorIcon from "../../icons/providers/cerebras-color.svg";
import togetherColorIcon from "../../icons/providers/together-color.svg";
import deepseekColorIcon from "../../icons/providers/deepseek-color.svg";
import groqIcon from "../../icons/providers/groq.svg";
import mistralColorIcon from "../../icons/providers/mistral-color.svg";
import geminiColorIcon from "../../icons/providers/gemini-color.svg";
import xaiIcon from "../../icons/providers/xai.svg";
import huggingfaceColorIcon from "../../icons/providers/huggingface-color.svg";
import replicateIcon from "../../icons/providers/replicate.svg";
import falColorIcon from "../../icons/providers/fal-color.svg";
import elevenlabsIcon from "../../icons/providers/elevenlabs.svg";
import moonshotIcon from "../../icons/providers/moonshot.svg";
import topazlabsIcon from "../../icons/providers/topazlabs.svg";
import atlascloudIcon from "../../icons/providers/atlascloud.svg";
import zhipuColorIcon from "../../icons/providers/zhipu-color.svg";
import minimaxColorIcon from "../../icons/providers/minimax-color.svg";
import alibabacloudColorIcon from "../../icons/providers/alibabacloud-color.svg";
import meshyColorIcon from "../../icons/providers/meshy-color.svg";
import githubIcon from "../../icons/providers/github.svg";
import googleColorIcon from "../../icons/providers/google-color.svg";
import cohereColorIcon from "../../icons/providers/cohere-color.svg";
import jinaIcon from "../../icons/providers/jina.svg";
import voyageColorIcon from "../../icons/providers/voyage-color.svg";
import evolinkIcon from "../../icons/evolink.svg";
import gmiIcon from "../../icons/gmi.svg";
import metaColorIcon from "../../icons/providers/meta-color.svg";


export interface ProviderMeta {
  key: string;
  name: string;
  description: string;
  section: "popular" | "language" | "media" | "gateways" | "search" | "compute" | "advanced";
  tag?: string;
  docsUrl: string;
  icon?: string;
  /** Mono (single-color black) icon — needs inversion in dark mode to be visible. */
  mono?: boolean;
  /** Extra hint rendered under the description (e.g. required key scope). */
  note?: string;
  /** Provider supports OAuth sign-in in place of (or alongside) an API key. */
  oauth?: "openai" | "hf" | "claude";
  /**
   * Authentication is OAuth-only — there is no API key to store, so the card
   * shows sign-in/sign-out and nothing else. `key` is a display id, not a
   * secret NodeTool persists.
   */
  oauthOnly?: boolean;
  /**
   * Connecting only works when the browser and the server share a machine —
   * the flow finishes on the server's loopback listener and writes credentials
   * to its filesystem. Hidden on hosted deployments, where it can't complete.
   */
  localOnly?: boolean;
  /** Multi-field credentials (e.g. login + password). Single-field providers omit this. */
  fields?: Array<{ key: string; label: string; secret?: boolean }>;
  /**
   * The registry provider this card credentials, when there is one. A card can
   * hold a valid credential for a provider the server does not offer — a cloud
   * profile prunes the local and OAuth-backed providers, and a build may ship
   * without one — so the card reads `models.providers` and says so instead of
   * claiming a connection that yields no models. Entries with no registry
   * provider behind them (web search, GPU rental, tracing) leave this unset.
   */
  providerId?: ProviderId;
}

/** Hosted deployments can't finish a same-machine sign-in — hide those cards. */
export const isProviderAvailable = (meta: ProviderMeta): boolean =>
  !meta.localOnly || isLocalhost || isElectron;
export const PROVIDER_META: ProviderMeta[] = [
  {
    key: "OPENAI_API_KEY",
    providerId: PROVIDER_IDS.OPENAI,
    name: "OpenAI",
    description: "GPT models, images, embeddings, and more.",
    section: "popular",
    tag: "Popular",
    docsUrl: "https://platform.openai.com/docs",
    icon: openaiIcon,
    mono: true,
    oauth: "openai"
  },
  {
    key: "CLAUDE_SUBSCRIPTION",
    providerId: PROVIDER_IDS.CLAUDE_AGENT_SDK,
    name: "Claude",
    description: "Use a Claude Pro or Max subscription instead of API credits.",
    section: "popular",
    docsUrl: "https://code.claude.com/docs/en/overview",
    icon: anthropicIcon,
    mono: true,
    note: "Signs in through Claude Code and shares its credentials.",
    oauth: "claude",
    oauthOnly: true,
    localOnly: true
  },
  {
    key: "ANTHROPIC_API_KEY",
    providerId: PROVIDER_IDS.ANTHROPIC,
    name: "Anthropic",
    description: "Claude models for advanced reasoning.",
    section: "popular",
    docsUrl: "https://docs.anthropic.com",
    icon: anthropicIcon,
    mono: true
  },
  {
    key: "OPENROUTER_API_KEY",
    providerId: PROVIDER_IDS.OPENROUTER,
    name: "OpenRouter",
    description: "Access multiple AI models through one API.",
    section: "popular",
    docsUrl: "https://openrouter.ai/docs",
    icon: openrouterIcon,
    mono: true
  },
  {
    key: "GEMINI_API_KEY",
    providerId: PROVIDER_IDS.GEMINI,
    name: "Gemini",
    description: "Google Gemini AI models and services.",
    section: "popular",
    docsUrl: "https://ai.google.dev/docs",
    icon: geminiColorIcon
  },
  {
    key: "GROQ_API_KEY",
    providerId: PROVIDER_IDS.GROQ,
    name: "Groq",
    description: "Ultra-fast LLM inference on LPU hardware.",
    section: "language",
    docsUrl: "https://console.groq.com/docs",
    icon: groqIcon,
    mono: true
  },
  {
    key: "MISTRAL_API_KEY",
    providerId: PROVIDER_IDS.MISTRAL,
    name: "Mistral",
    description: "Mistral AI models and embeddings.",
    section: "language",
    docsUrl: "https://docs.mistral.ai/",
    icon: mistralColorIcon
  },
  {
    key: "DEEPSEEK_API_KEY",
    providerId: PROVIDER_IDS.DEEPSEEK,
    name: "DeepSeek",
    description: "State-of-the-art open models.",
    section: "language",
    docsUrl: "https://platform.deepseek.com/docs",
    icon: deepseekColorIcon
  },
  {
    key: "XAI_API_KEY",
    providerId: PROVIDER_IDS.XAI,
    name: "xAI",
    description: "Grok models via xAI's API.",
    section: "language",
    docsUrl: "https://docs.x.ai/",
    icon: xaiIcon,
    mono: true
  },
  {
    key: "META_API_KEY",
    providerId: PROVIDER_IDS.META,
    name: "Meta AI",
    description: "Meta's Muse Spark models for agentic and coding work.",
    section: "language",
    docsUrl: "https://dev.meta.ai/docs/overview",
    icon: metaColorIcon
  },
  {
    key: "CEREBRAS_API_KEY",
    providerId: PROVIDER_IDS.CEREBRAS,
    name: "Cerebras",
    description: "Fast LLM inference on Cerebras hardware.",
    section: "language",
    docsUrl: "https://docs.cerebras.ai/",
    icon: cerebrasColorIcon
  },
  {
    key: "TOGETHER_API_KEY",
    providerId: PROVIDER_IDS.TOGETHER,
    name: "Together AI",
    description: "Open-source models through Together API.",
    section: "language",
    docsUrl: "https://docs.together.ai/",
    icon: togetherColorIcon
  },
  {
    key: "KIMI_API_KEY",
    providerId: PROVIDER_IDS.MOONSHOT,
    name: "Kimi",
    description: "Moonshot AI models via Kimi API.",
    section: "language",
    docsUrl: "https://platform.moonshot.cn/docs",
    icon: moonshotIcon,
    mono: true
  },
  {
    key: "ZHIPU_API_KEY",
    name: "Z.AI",
    description: "GLM models via Z.AI's OpenAI-compatible API.",
    section: "language",
    docsUrl: "https://open.bigmodel.cn/",
    icon: zhipuColorIcon
  },
  {
    key: "MINIMAX_API_KEY",
    providerId: PROVIDER_IDS.MINIMAX,
    name: "MiniMax",
    description: "MiniMax AI models.",
    section: "language",
    docsUrl: "https://platform.minimax.chat/",
    icon: minimaxColorIcon
  },
  {
    key: "DASHSCOPE_API_KEY",
    providerId: PROVIDER_IDS.ALIBABA,
    name: "Alibaba Cloud",
    description: "Qwen models via Alibaba Cloud Model Studio.",
    section: "language",
    docsUrl: "https://www.alibabacloud.com/help/en/model-studio/",
    icon: alibabacloudColorIcon
  },
  {
    key: "HF_TOKEN",
    providerId: PROVIDER_IDS.HUGGINGFACE,
    name: "HuggingFace",
    description: "Inference providers and model hub access.",
    section: "language",
    docsUrl: "https://huggingface.co/docs",
    icon: huggingfaceColorIcon,
    oauth: "hf"
  },
  {
    key: "COHERE_API_KEY",
    providerId: PROVIDER_IDS.COHERE,
    name: "Cohere",
    description: "Embed v4 text embeddings and reranking.",
    section: "language",
    docsUrl: "https://docs.cohere.com/",
    icon: cohereColorIcon
  },
  {
    key: "JINA_API_KEY",
    providerId: PROVIDER_IDS.JINA,
    name: "Jina AI",
    description: "Jina embeddings and reranker models.",
    section: "language",
    docsUrl: "https://jina.ai/",
    icon: jinaIcon,
    mono: true
  },
  {
    key: "VOYAGE_API_KEY",
    providerId: PROVIDER_IDS.VOYAGE,
    name: "Voyage AI",
    description: "High-quality text and multimodal embeddings.",
    section: "language",
    docsUrl: "https://docs.voyageai.com/",
    icon: voyageColorIcon
  },
  {
    key: "FAL_API_KEY",
    providerId: PROVIDER_IDS.FAL_AI,
    name: "FAL",
    description: "Serverless AI image and video generation.",
    section: "media",
    docsUrl: "https://fal.ai/docs",
    icon: falColorIcon,
    note: 'For exact cost tracking, use an admin key (fal.ai dashboard → Keys → scope "Admin"). NodeTool reads each request\'s actual billing from FAL; a standard key only yields estimates.'
  },
  {
    key: "REPLICATE_API_TOKEN",
    providerId: PROVIDER_IDS.REPLICATE,
    name: "Replicate",
    description: "Run models on Replicate's cloud infrastructure.",
    section: "media",
    docsUrl: "https://replicate.com/docs",
    icon: replicateIcon,
    mono: true
  },
  {
    key: "ELEVENLABS_API_KEY",
    providerId: PROVIDER_IDS.ELEVENLABS,
    name: "ElevenLabs",
    description: "High-quality text-to-speech services.",
    section: "media",
    docsUrl: "https://elevenlabs.io/docs",
    icon: elevenlabsIcon,
    mono: true
  },
  {
    key: "TOPAZ_API_KEY",
    providerId: PROVIDER_IDS.TOPAZ,
    name: "Topaz",
    description: "Topaz Labs image and video enhancement.",
    section: "media",
    docsUrl: "https://developer.topazlabs.com/",
    icon: topazlabsIcon,
    mono: true
  },
  {
    key: "ATLASCLOUD_API_KEY",
    providerId: PROVIDER_IDS.ATLASCLOUD,
    name: "AtlasCloud",
    description: "Chat, image, and video models behind one key.",
    section: "gateways",
    docsUrl: "https://www.atlascloud.ai/",
    icon: atlascloudIcon
  },
  {
    key: "REVE_API_KEY",
    providerId: PROVIDER_IDS.REVE,
    name: "Reve",
    description: "Image creation, editing, and remix with strong prompt adherence.",
    section: "media",
    docsUrl: "https://api.reve.com/"
  },
  {
    key: "MESHY_API_KEY",
    providerId: PROVIDER_IDS.MESHY,
    name: "Meshy",
    description: "3D model generation.",
    section: "media",
    docsUrl: "https://docs.meshy.ai/",
    icon: meshyColorIcon
  },
  {
    key: "RODIN_API_KEY",
    providerId: PROVIDER_IDS.RODIN,
    name: "Rodin",
    description: "Rodin AI 3D model generation.",
    section: "media",
    docsUrl: "https://hyperhuman.deemos.com/"
  },
  {
    key: "EVOLINK_API_KEY",
    providerId: PROVIDER_IDS.EVOLINK,
    name: "Evolink",
    description: "GPT, Claude, Gemini, DeepSeek and more through one gateway.",
    section: "gateways",
    docsUrl: "https://docs.evolink.ai",
    icon: evolinkIcon
  },
  {
    key: "GMI_API_KEY",
    providerId: PROVIDER_IDS.GMI,
    name: "GMI Cloud",
    description: "Open-weight LLMs through GMI's OpenAI-compatible API.",
    section: "gateways",
    docsUrl: "https://docs.gmicloud.ai/",
    icon: gmiIcon
  },
  {
    key: "AKI_API_KEY",
    providerId: PROVIDER_IDS.AKI,
    name: "AKI",
    description: "AKI.IO AI Model Hub.",
    section: "gateways",
    docsUrl: "https://aki.io/"
  },
  {
    key: "KIE_API_KEY",
    providerId: PROVIDER_IDS.KIE,
    name: "Kie.ai",
    description: "Kie.ai unified model access.",
    section: "gateways",
    docsUrl: "https://kie.ai/"
  },
  {
    key: "SERPAPI_API_KEY",
    name: "SerpAPI",
    description: "Web search via SerpAPI.",
    section: "search",
    docsUrl: "https://serpapi.com/"
  },
  {
    key: "APIFY_API_TOKEN",
    name: "Apify",
    description: "Web search via Apify Google Search Scraper.",
    section: "search",
    docsUrl: "https://docs.apify.com/"
  },
  {
    key: "BRAVE_API_KEY",
    name: "Brave Search",
    description: "Brave Search web API.",
    section: "search",
    docsUrl: "https://brave.com/search/api/"
  },
  {
    key: "DATA_FOR_SEO_LOGIN",
    name: "DataForSEO",
    description: "Web search via DataForSEO.",
    section: "search",
    docsUrl: "https://docs.dataforseo.com/",
    fields: [
      { key: "DATA_FOR_SEO_LOGIN", label: "Login" },
      { key: "DATA_FOR_SEO_PASSWORD", label: "Password", secret: true }
    ]
  },
  {
    key: "RUNPOD_API_KEY",
    name: "RunPod",
    description: "Rent GPU pods to run NodeTool workers.",
    section: "compute",
    docsUrl: "https://docs.runpod.io/"
  },
  {
    key: "VAST_API_KEY",
    name: "Vast.ai",
    description: "Rent marketplace GPUs to run NodeTool workers.",
    section: "compute",
    docsUrl: "https://docs.vast.ai/"
  },
  {
    key: "LLAMA_API_KEY",
    providerId: PROVIDER_IDS.LLAMA_CPP,
    name: "llama.cpp",
    description: "Bearer auth for a local llama-server instance.",
    section: "compute",
    docsUrl: "https://github.com/ggml-org/llama.cpp"
  },
  {
    key: "GOOGLE_MAIL_USER",
    name: "Google Mail",
    description: "Email address and app password for Google mail integration.",
    section: "advanced",
    docsUrl: "https://support.google.com/mail/",
    icon: googleColorIcon,
    fields: [
      { key: "GOOGLE_MAIL_USER", label: "Email address" },
      { key: "GOOGLE_APP_PASSWORD", label: "App password", secret: true }
    ]
  },
  {
    key: "GITHUB_CLIENT_ID",
    name: "GitHub OAuth App",
    description: "OAuth App credentials for GitHub PKCE flow.",
    section: "advanced",
    docsUrl: "https://docs.github.com/en/apps/oauth-apps",
    icon: githubIcon,
    mono: true,
    fields: [
      { key: "GITHUB_CLIENT_ID", label: "Client ID" },
      { key: "GITHUB_CLIENT_SECRET", label: "Client Secret", secret: true }
    ]
  },
  {
    key: "NODE_SUPABASE_KEY",
    name: "NodeSupabase",
    description: "Supabase service key for user-provided nodes.",
    section: "advanced",
    docsUrl: "https://supabase.com/docs"
  },
  {
    key: "TRACELOOP_API_KEY",
    name: "Traceloop",
    description: "OpenLLMetry trace export to Traceloop.",
    section: "advanced",
    docsUrl: "https://www.traceloop.com/docs"
  },
  {
    key: "SERVER_AUTH_TOKEN",
    name: "Server Auth Token",
    description: "Bearer token to secure NodeTool server endpoints.",
    section: "advanced",
    docsUrl: "https://github.com/nodetool-ai/nodetool"
  }
];

/**
 * Sections whose entries are AI model providers — connecting one of them means
 * NodeTool can run a model. `search` (web-search APIs), `compute` (GPU rental,
 * local-server auth) and `advanced` (tracing, mail, server auth) are
 * credentials for something else, so they don't count.
 */
const MODEL_PROVIDER_SECTIONS: ReadonlySet<ProviderMeta["section"]> = new Set([
  "popular",
  "language",
  "media",
  "gateways"
]);

/**
 * Secret keys that, once configured, mean the user has an AI provider. OAuth-
 * only entries are excluded: their `key` is a display id, not a stored secret,
 * and their connection state comes from the OAuth token endpoints.
 */
export const AI_PROVIDER_SECRET_KEYS: ReadonlySet<string> = new Set(
  PROVIDER_META.filter(
    (meta) => MODEL_PROVIDER_SECTIONS.has(meta.section) && !meta.oauthOnly
  ).map((meta) => meta.key)
);

export const getProviderMeta = (key: string): ProviderMeta | undefined =>
  PROVIDER_META.find((p) => p.key === key);
