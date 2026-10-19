/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useCallback } from "react";
import { useTranslation } from "react-i18next";

import {
  Box,
  Caption,
  ContextMenu,
  EmptyState,
  FlexRow,
  LoadingSpinner,
  MenuItemPrimitive,
  SectionHeader,
  SPACING,
  getSpacingPx
} from "../ui_primitives";
import AppsIcon from "@mui/icons-material/Apps";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import useModelPreferencesStore from "../../stores/ModelPreferencesStore";
import { openProviderOnboarding } from "../../stores/ProviderOnboardingStore";
import ModelMenuNavItem from "./shared/ModelMenuNavItem";

import {
  isHuggingFaceProvider,
  formatGenericProviderName,
  getProviderUrl,
  groupProvidersBySite,
  type ProviderEntry
} from "../../utils/providerDisplay";
import {
  requiredSecretForProvider,
  useLanguageModelMenuStore
} from "../../stores/ModelMenuStore";
import { useSecrets } from "../../hooks/useSecrets";
import { useIsDarkMode } from "../../hooks/useIsDarkMode";
import type { ModelSelectorModel } from "../../utils/modelNormalization";

// Provider icons vendored from @lobehub/icons-static-svg (see src/icons/providers/README.md)
import openaiIcon from "../../icons/providers/openai.svg";
import anthropicIcon from "../../icons/providers/anthropic.svg";
import claudeColorIcon from "../../icons/providers/claude-color.svg";
import geminiColorIcon from "../../icons/providers/gemini-color.svg";
import googlecloudColorIcon from "../../icons/providers/googlecloud-color.svg";
import vertexaiColorIcon from "../../icons/providers/vertexai-color.svg";
import huggingfaceColorIcon from "../../icons/providers/huggingface-color.svg";
import ollamaIcon from "../../icons/providers/ollama.svg";
import lmstudioIcon from "../../icons/providers/lmstudio.svg";
import azureColorIcon from "../../icons/providers/azure-color.svg";
import azureaiColorIcon from "../../icons/providers/azureai-color.svg";
import awsColorIcon from "../../icons/providers/aws-color.svg";
import bedrockColorIcon from "../../icons/providers/bedrock-color.svg";
import replicateIcon from "../../icons/providers/replicate.svg";
import falColorIcon from "../../icons/providers/fal-color.svg";
import deepseekColorIcon from "../../icons/providers/deepseek-color.svg";
import groqIcon from "../../icons/providers/groq.svg";
import mistralColorIcon from "../../icons/providers/mistral-color.svg";
import togetherColorIcon from "../../icons/providers/together-color.svg";
import perplexityColorIcon from "../../icons/providers/perplexity-color.svg";
import ai21Icon from "../../icons/providers/ai21.svg";
import cloudflareColorIcon from "../../icons/providers/cloudflare-color.svg";
import workersaiColorIcon from "../../icons/providers/workersai-color.svg";
import fireworksColorIcon from "../../icons/providers/fireworks-color.svg";
import stabilityColorIcon from "../../icons/providers/stability-color.svg";
import cerebrasColorIcon from "../../icons/providers/cerebras-color.svg";
import moonshotIcon from "../../icons/providers/moonshot.svg";
import novitaColorIcon from "../../icons/providers/novita-color.svg";
import sambanovaColorIcon from "../../icons/providers/sambanova-color.svg";
import siliconcloudColorIcon from "../../icons/providers/siliconcloud-color.svg";
import xinferenceColorIcon from "../../icons/providers/xinference-color.svg";
import dalleColorIcon from "../../icons/providers/dalle-color.svg";
import bflIcon from "../../icons/providers/bfl.svg";
import fluxIcon from "../../icons/providers/flux.svg";
import lumaColorIcon from "../../icons/providers/luma-color.svg";
import recraftIcon from "../../icons/providers/recraft.svg";
import ideogramIcon from "../../icons/providers/ideogram.svg";
import tripoColorIcon from "../../icons/providers/tripo-color.svg";
import haiperIcon from "../../icons/providers/haiper.svg";
import klingColorIcon from "../../icons/providers/kling-color.svg";
import hunyuanColorIcon from "../../icons/providers/hunyuan-color.svg";
import pikaIcon from "../../icons/providers/pika.svg";
import runwayIcon from "../../icons/providers/runway.svg";
import viduColorIcon from "../../icons/providers/vidu-color.svg";
import viggleIcon from "../../icons/providers/viggle.svg";
import hailuoColorIcon from "../../icons/providers/hailuo-color.svg";
import kolorsColorIcon from "../../icons/providers/kolors-color.svg";
import kreaIcon from "../../icons/providers/krea.svg";
import elevenlabsIcon from "../../icons/providers/elevenlabs.svg";
import deepmindColorIcon from "../../icons/providers/deepmind-color.svg";
import xaiIcon from "../../icons/providers/xai.svg";
import grokIcon from "../../icons/providers/grok.svg";
import metaColorIcon from "../../icons/providers/meta-color.svg";
import metaaiColorIcon from "../../icons/providers/metaai-color.svg";
import llamaindexColorIcon from "../../icons/providers/llamaindex-color.svg";
import langchainColorIcon from "../../icons/providers/langchain-color.svg";
import langfuseColorIcon from "../../icons/providers/langfuse-color.svg";
import langsmithColorIcon from "../../icons/providers/langsmith-color.svg";
import langgraphColorIcon from "../../icons/providers/langgraph-color.svg";
import nvidiaColorIcon from "../../icons/providers/nvidia-color.svg";
import hyperbolicColorIcon from "../../icons/providers/hyperbolic-color.svg";
import deepinfraColorIcon from "../../icons/providers/deepinfra-color.svg";
import basetenIcon from "../../icons/providers/baseten.svg";
import friendliIcon from "../../icons/providers/friendli.svg";
import exaColorIcon from "../../icons/providers/exa-color.svg";
import jinaIcon from "../../icons/providers/jina.svg";
import upstageColorIcon from "../../icons/providers/upstage-color.svg";
import cohereColorIcon from "../../icons/providers/cohere-color.svg";
import commandaColorIcon from "../../icons/providers/commanda-color.svg";
import ayaColorIcon from "../../icons/providers/aya-color.svg";
import palmColorIcon from "../../icons/providers/palm-color.svg";
import copilotColorIcon from "../../icons/providers/copilot-color.svg";
import githubcopilotIcon from "../../icons/providers/githubcopilot.svg";
import githubIcon from "../../icons/providers/github.svg";
import vercelIcon from "../../icons/providers/vercel.svg";
import openrouterIcon from "../../icons/providers/openrouter.svg";
import lobehubColorIcon from "../../icons/providers/lobehub-color.svg";
import automaticColorIcon from "../../icons/providers/automatic-color.svg";
import glifIcon from "../../icons/providers/glif.svg";
import pollinationsIcon from "../../icons/providers/pollinations.svg";
import ppioColorIcon from "../../icons/providers/ppio-color.svg";
import inferenceIcon from "../../icons/providers/inference.svg";
import featherlessColorIcon from "../../icons/providers/featherless-color.svg";
import voyageColorIcon from "../../icons/providers/voyage-color.svg";
import zaiIcon from "../../icons/providers/zai.svg";
import gmiIcon from "../../icons/gmi.svg";

// Chinese providers
import alibabacloudColorIcon from "../../icons/providers/alibabacloud-color.svg";
import bailianColorIcon from "../../icons/providers/bailian-color.svg";
import qwenColorIcon from "../../icons/providers/qwen-color.svg";
import zhipuColorIcon from "../../icons/providers/zhipu-color.svg";
import chatglmColorIcon from "../../icons/providers/chatglm-color.svg";
import wenxinColorIcon from "../../icons/providers/wenxin-color.svg";
import baiduColorIcon from "../../icons/providers/baidu-color.svg";
import bytedanceColorIcon from "../../icons/providers/bytedance-color.svg";
import doubaoColorIcon from "../../icons/providers/doubao-color.svg";
import yiColorIcon from "../../icons/providers/yi-color.svg";
import stepfunColorIcon from "../../icons/providers/stepfun-color.svg";
import sensenovaColorIcon from "../../icons/providers/sensenova-color.svg";
import minimaxColorIcon from "../../icons/providers/minimax-color.svg";
import sparkColorIcon from "../../icons/providers/spark-color.svg";
import iflytekcloudColorIcon from "../../icons/providers/iflytekcloud-color.svg";
import internlmColorIcon from "../../icons/providers/internlm-color.svg";
import skyworkColorIcon from "../../icons/providers/skywork-color.svg";
import tencentColorIcon from "../../icons/providers/tencent-color.svg";
import tencentcloudColorIcon from "../../icons/providers/tencentcloud-color.svg";
import yuanbaoColorIcon from "../../icons/providers/yuanbao-color.svg";

const providerIconMap: Record<string, string> = {
  // OpenAI / GPT
  openai: openaiIcon,
  "openai-chat": openaiIcon,
  chatgpt: openaiIcon,
  
  // Anthropic / Claude
  anthropic: anthropicIcon,
  claude: claudeColorIcon,

  // Google / Gemini
  google: geminiColorIcon,
  gemini: geminiColorIcon,
  "google-ai": geminiColorIcon,
  "google-cloud": googlecloudColorIcon,
  vertexai: vertexaiColorIcon,
  
  // HuggingFace
  huggingface: huggingfaceColorIcon,
  "huggingface-local": huggingfaceColorIcon,
  "huggingface-inference": huggingfaceColorIcon,
  "hf_inference": huggingfaceColorIcon,
  
  // Local providers
  ollama: ollamaIcon,
  "llama.cpp": ollamaIcon,
  llamacpp: ollamaIcon,
  "llama-cpp": ollamaIcon,
  lmstudio: lmstudioIcon,
  "lm-studio": lmstudioIcon,
  
  // Cloud AI Providers
  azure: azureColorIcon,
  azureai: azureaiColorIcon,
  aws: awsColorIcon,
  bedrock: bedrockColorIcon,
  replicate: replicateIcon,
  fal: falColorIcon,
  "fal-ai": falColorIcon,
  falai: falColorIcon,
  
  // Model providers
  deepseek: deepseekColorIcon,
  groq: groqIcon,
  mistral: mistralColorIcon,
  together: togetherColorIcon,
  "together-ai": togetherColorIcon,
  togetherai: togetherColorIcon,
  perplexity: perplexityColorIcon,
  ai21: ai21Icon,
  cloudflare: cloudflareColorIcon,
  "workers-ai": workersaiColorIcon,
  workersai: workersaiColorIcon,
  fireworks: fireworksColorIcon,
  "fireworks-ai": fireworksColorIcon,
  stability: stabilityColorIcon,
  "stable-diffusion": stabilityColorIcon,
  cerebras: cerebrasColorIcon,
  gmi: gmiIcon,
  moonshot: moonshotIcon,
  novita: novitaColorIcon,
  sambanova: sambanovaColorIcon,
  siliconcloud: siliconcloudColorIcon,
  xinference: xinferenceColorIcon,
  
  // Image generation
  dalle: dalleColorIcon,
  "dall-e": dalleColorIcon,
  bfl: bflIcon,
  "black-forest-labs": bflIcon,
  blackforestlabs: bflIcon,
  flux: fluxIcon,
  luma: lumaColorIcon,
  "luma-ai": lumaColorIcon,
  recraft: recraftIcon,
  ideogram: ideogramIcon,
  tripo: tripoColorIcon,
  haiper: haiperIcon,
  kling: klingColorIcon,
  hunyuan: hunyuanColorIcon,
  pika: pikaIcon,
  runway: runwayIcon,
  vidu: viduColorIcon,
  viggle: viggleIcon,
  hailuo: hailuoColorIcon,
  kolors: kolorsColorIcon,
  krea: kreaIcon,
  
  // Audio
  elevenlabs: elevenlabsIcon,
  "eleven-labs": elevenlabsIcon,
  
  // Research labs
  deepmind: deepmindColorIcon,
  xai: xaiIcon,
  x: xaiIcon,
  grok: grokIcon,
  meta: metaColorIcon,
  metaai: metaaiColorIcon,
  
  // Frameworks
  llamaindex: llamaindexColorIcon,
  langchain: langchainColorIcon,
  langfuse: langfuseColorIcon,
  langsmith: langsmithColorIcon,
  langgraph: langgraphColorIcon,
  
  // Chinese providers
  alibaba: alibabacloudColorIcon,
  "alibaba-cloud": alibabacloudColorIcon,
  bailian: bailianColorIcon,
  qwen: qwenColorIcon,
  zhipu: zhipuColorIcon,
  chatglm: chatglmColorIcon,
  wenxin: wenxinColorIcon,
  baidu: baiduColorIcon,
  bytedance: bytedanceColorIcon,
  doubao: doubaoColorIcon,
  yi: yiColorIcon,
  stepfun: stepfunColorIcon,
  sensenova: sensenovaColorIcon,
  minimax: minimaxColorIcon,
  spark: sparkColorIcon,
  iflytek: iflytekcloudColorIcon,
  internlm: internlmColorIcon,
  skywork: skyworkColorIcon,
  tencent: tencentColorIcon,
  tencentcloud: tencentcloudColorIcon,
  yuanbao: yuanbaoColorIcon,
  
  // GPUs / Infrastructure
  nvidia: nvidiaColorIcon,
  hyperbolic: hyperbolicColorIcon,
  deepinfra: deepinfraColorIcon,
  baseten: basetenIcon,
  friendli: friendliIcon,
  
  // Search / Tools
  exa: exaColorIcon,
  jina: jinaIcon,
  upstage: upstageColorIcon,
  cohere: cohereColorIcon,
  commanda: commandaColorIcon,
  aya: ayaColorIcon,
  palm: palmColorIcon,
  
  // Microsoft
  copilot: copilotColorIcon,
  "github-copilot": githubcopilotIcon,
  github: githubIcon,
  microsoft: copilotColorIcon,
  
  // Deployment
  vercel: vercelIcon,
  openrouter: openrouterIcon,
  lobehub: lobehubColorIcon,
  
  // Workflow / UI
  automatic: automaticColorIcon,
  "automatic1111": automaticColorIcon,
  "stable-diffusion-webui": automaticColorIcon,
  glif: glifIcon,
  pollinations: pollinationsIcon,
  ppio: ppioColorIcon,
  inference: inferenceIcon,
  featherless: featherlessColorIcon,
  voyage: voyageColorIcon,
};

// Map of HuggingFace sub-provider names to their icons
const subProviderIcons: Record<string, string> = {
  // Cloud providers
  fireworks: fireworksColorIcon,
  "fireworks-ai": fireworksColorIcon,
  "fireworks_ai": fireworksColorIcon,
  featherless: featherlessColorIcon,
  "featherless-ai": featherlessColorIcon,
  "featherless_ai": featherlessColorIcon,
  zai: zaiIcon,
  // No icons available yet - will fall back to HuggingFace
  // nscale: nscaleIcon,
  // scaleway: scalewayIcon,
  replicate: replicateIcon,
  fal: falColorIcon,
  "fal-ai": falColorIcon,
  together: togetherColorIcon,
  "together-ai": togetherColorIcon,
  groq: groqIcon,
  cerebras: cerebrasColorIcon,
  sambanova: sambanovaColorIcon,
  novita: novitaColorIcon,
  hyperbolic: hyperbolicColorIcon,
  deepinfra: deepinfraColorIcon,
  baseten: basetenIcon,
  friendli: friendliIcon,
  cloudflare: cloudflareColorIcon,
  workersai: workersaiColorIcon,
  "workers-ai": workersaiColorIcon,
  siliconcloud: siliconcloudColorIcon,
  // AI21
  ai21: ai21Icon,
  // Frameworks
  langchain: langchainColorIcon,
  llamaindex: llamaindexColorIcon,
  // Chinese providers
  alibaba: alibabacloudColorIcon,
  alibabacloud: alibabacloudColorIcon,
  bailian: bailianColorIcon,
  qwen: qwenColorIcon,
  zhipu: zhipuColorIcon,
  chatglm: chatglmColorIcon,
  baidu: baiduColorIcon,
  bytedance: bytedanceColorIcon,
  doubao: doubaoColorIcon,
  stepfun: stepfunColorIcon,
  sensenova: sensenovaColorIcon,
  minimax: minimaxColorIcon,
  tencent: tencentColorIcon,
  hunyuan: hunyuanColorIcon,
  // Other providers
  openai: openaiIcon,
  anthropic: anthropicIcon,
  claude: claudeColorIcon,
  gemini: geminiColorIcon,
  google: geminiColorIcon,
  azure: azureColorIcon,
  azureai: azureaiColorIcon,
  aws: awsColorIcon,
  bedrock: bedrockColorIcon,
  meta: metaColorIcon,
  metaai: metaaiColorIcon,
  mistral: mistralColorIcon,
  cohere: cohereColorIcon,
  perplexity: perplexityColorIcon,
  // Image generation
  stability: stabilityColorIcon,
  "stable-diffusion": stabilityColorIcon,
  flux: fluxIcon,
  luma: lumaColorIcon,
  ideogram: ideogramIcon,
  runway: runwayIcon,
  recraft: recraftIcon,
  elevenlabs: elevenlabsIcon,
};

// Substring fallbacks, scanned in order. Kept as entries so the lookup below
// doesn't rebuild the pair array on every call.
const partialMatches: ReadonlyArray<readonly [string, string]> = Object.entries({
  openai: openaiIcon,
  anthropic: anthropicIcon,
  claude: claudeColorIcon,
  gemini: geminiColorIcon,
  google: geminiColorIcon,
  huggingface: huggingfaceColorIcon,
  ollama: ollamaIcon,
  llama: ollamaIcon,
  mistral: mistralColorIcon,
  groq: groqIcon,
  together: togetherColorIcon,
  deepseek: deepseekColorIcon,
  replicate: replicateIcon,
  fal: falColorIcon,
  elevenlabs: elevenlabsIcon,
  stability: stabilityColorIcon,
  luma: lumaColorIcon,
  flux: fluxIcon,
  bfl: bflIcon,
  ideogram: ideogramIcon,
  runway: runwayIcon,
  pika: pikaIcon,
  kling: klingColorIcon,
  hunyuan: hunyuanColorIcon,
  qwen: qwenColorIcon,
  baidu: baiduColorIcon,
  stepfun: stepfunColorIcon,
  cohere: cohereColorIcon,
  azure: azureColorIcon,
  aws: awsColorIcon,
  bedrock: bedrockColorIcon,
  vertex: vertexaiColorIcon,
  cerebras: cerebrasColorIcon,
  gmi: gmiIcon,
  fireworks: fireworksColorIcon,
  cloudflare: cloudflareColorIcon,
  moonshot: moonshotIcon,
  alibaba: alibabacloudColorIcon,
  perplexity: perplexityColorIcon,
  ai21: ai21Icon,
  meta: metaColorIcon,
  nvidia: nvidiaColorIcon,
});

const getProviderIconUrl = (provider: string): string | null => {
  if (!provider) {
    return null;
  }

  // Direct match
  const normalized = provider.toLowerCase().trim();
  if (providerIconMap[normalized]) {
    return providerIconMap[normalized];
  }

  // Check for HuggingFace sub-providers - use the actual provider's logo
  if (isHuggingFaceProvider(provider)) {
    // Extract the sub-provider name (e.g., "huggingface_fireworks" -> "fireworks")
    const subProviderMatch = normalized.match(/^huggingface[_\-/]?(.*)$/);
    if (subProviderMatch && subProviderMatch[1]) {
      const subProvider = subProviderMatch[1].toLowerCase();
      if (subProviderIcons[subProvider]) {
        return subProviderIcons[subProvider];
      }
    }

    // No matching sub-provider found - use HF logo
    return huggingfaceColorIcon;
  }

  for (const [key, value] of partialMatches) {
    if (normalized.includes(key)) {
      return value;
    }
  }

  return null;
};

const getProviderFallbackLabel = (provider: string): string => {
  const normalized = provider.toLowerCase().trim();
  if (normalized === "mlx") {
    return "MLX";
  }

  return formatGenericProviderName(provider).substring(0, 2).toUpperCase();
};

const listStyles = css({
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
  overflowX: "hidden",
  display: "flex",
  flexDirection: "column",
  gap: 2,
  padding: `${getSpacingPx(SPACING.sm)} ${getSpacingPx(SPACING.sm)}`
});

// Horizontal strip of filter chips used on narrow screens, where a sidebar
// would eat a quarter of the viewport.
const horizontalListStyles = css({
  display: "flex",
  flexDirection: "row",
  alignItems: "center",
  gap: getSpacingPx(SPACING.sm),
  overflowX: "auto",
  overflowY: "hidden",
  padding: `${getSpacingPx(SPACING.md)} ${getSpacingPx(SPACING.lg)}`
});

type ProviderStoreHook = <Selected>(
  selector: (state: {
    selectedProvider: string | null;
    setSelectedProvider: (provider: string | null) => void;
  }) => Selected,
  equalityFn?: (left: Selected, right: Selected) => boolean
) => Selected;

interface ProviderIconProps {
  provider: string;
  iconUrl: string | null;
}

/** A provider's logo at 16px, or its initials when there is no logo. */
const ProviderIcon: React.FC<ProviderIconProps> = ({ provider, iconUrl }) => {
  const isDarkMode = useIsDarkMode();
  if (!iconUrl) {
    return (
      <Caption component="span" sx={{ lineHeight: 1, color: "inherit" }}>
        {getProviderFallbackLabel(provider)}
      </Caption>
    );
  }
  // The HuggingFace logo has good contrast on its own, so it is the one icon
  // not inverted in dark mode.
  const invert = isDarkMode && iconUrl !== huggingfaceColorIcon;
  return (
    <img
      src={iconUrl}
      alt=""
      style={{
        objectFit: "contain",
        filter: invert ? "invert(1) brightness(1.1) contrast(0.9)" : "none"
      }}
    />
  );
};

interface ProviderListProps {
  providers: string[];
  models?: readonly ModelSelectorModel[];
  isLoading: boolean;
  isError: boolean;
  storeHook?: ProviderStoreHook;
  forceUnselect?: boolean;
  /** "horizontal" lays the entries out as a scrolling chip strip (mobile). */
  orientation?: "vertical" | "horizontal";
  /** Entries drawn after "All models": the Favorites and Recent views. */
  quickViews?: React.ReactNode;
}

// Memoized: the model menu re-renders on every keystroke in its search box and
// every arrow-key move through the model list, none of which changes these props.
// Provider selection is read from the store here, so selecting one still re-renders.
const ProviderList: React.FC<ProviderListProps> = React.memo(({
  providers,
  models = [],
  isLoading,
  isError,
  storeHook = useLanguageModelMenuStore,
  forceUnselect = false,
  orientation = "vertical",
  quickViews
}) => {
  const { t } = useTranslation();
  const selected = storeHook((s) => s.selectedProvider);
  const setSelected = storeHook((s) => s.setSelectedProvider);
  const [menuAnchor, setMenuAnchor] = React.useState<null | HTMLElement>(null);
  const [menuProvider, setMenuProvider] = React.useState<string | null>(null);
  const isProviderEnabled = useModelPreferencesStore(
    (s) => s.isProviderEnabled
  );
  const enabledProviders = useModelPreferencesStore((s) => s.enabledProviders);
  const setProviderEnabled = useModelPreferencesStore(
    (s) => s.setProviderEnabled
  );
  const { isApiKeySet } = useSecrets();
  const isHorizontal = orientation === "horizontal";

  const modelCounts = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of models) {
      const p = m.provider ?? "";
      counts.set(p, (counts.get(p) ?? 0) + 1);
    }
    return counts;
  }, [models]);

  // Group providers: enabled cloud, enabled local, then disabled, each by
  // name. The icon URL is resolved here as well: it is a pure function of the
  // provider id, and resolving it inside the render loop re-ran a substring
  // scan over ~45 icon names per provider on every re-render.
  const { cloudList, localList, disabledList } = React.useMemo(() => {
    const groups = groupProvidersBySite(providers, enabledProviders || {});
    const withIcons = (list: ProviderEntry[]) =>
      list.map(({ provider, label }) => ({
        p: provider,
        label,
        iconUrl: getProviderIconUrl(provider)
      }));
    return {
      cloudList: withIcons(groups.cloud),
      localList: withIcons(groups.local),
      disabledList: withIcons(groups.disabled)
    };
  }, [providers, enabledProviders]);

  const handleSelectNull = useCallback(() => {
    setSelected(null);
  }, [setSelected]);

  const handleSelectProvider = useCallback((event: React.MouseEvent<HTMLElement>) => {
    const provider = event.currentTarget.dataset.provider;
    if (provider) {
      setSelected(provider);
    }
  }, [setSelected]);

  const handleMenuOpen = useCallback((event: React.MouseEvent<HTMLElement>) => {
    event.preventDefault();
    setMenuAnchor(event.currentTarget);
    setMenuProvider(event.currentTarget.dataset.provider ?? null);
  }, []);

  const handleMenuClose = useCallback(() => {
    setMenuAnchor(null);
    setMenuProvider(null);
  }, []);

  const handleOpenWebsite = useCallback(() => {
    const url = getProviderUrl(menuProvider || undefined);
    if (url) { window.open(url, "_blank", "noopener,noreferrer"); }
    handleMenuClose();
  }, [menuProvider, handleMenuClose]);

  const handleToggleProvider = useCallback(() => {
    if (menuProvider) {
      const next = !isProviderEnabled(menuProvider);
      setProviderEnabled(menuProvider, next);
    }
    handleMenuClose();
  }, [menuProvider, isProviderEnabled, setProviderEnabled, handleMenuClose]);

  const menuSecret = menuProvider ? requiredSecretForProvider(menuProvider) : null;
  const menuNeedsKey = !!menuSecret && !isApiKeySet(menuSecret);

  const handleAddKey = useCallback(() => {
    handleMenuClose();
    openProviderOnboarding(
      menuSecret ? { highlightSecretKey: menuSecret } : undefined
    );
  }, [handleMenuClose, menuSecret]);

  const renderProvider = ({
    p,
    label,
    iconUrl
  }: {
    p: string;
    label: string;
    iconUrl: string | null;
  }) => {
    const enabled = isProviderEnabled(p);
    const env = requiredSecretForProvider(p);
    const hasKey = env ? isApiKeySet(env) : true;
    return (
      <ModelMenuNavItem
        key={p}
        className={`model-menu__provider-item ${selected === p ? "is-selected" : ""} ${enabled ? "is-enabled" : "is-disabled"}`}
        orientation={orientation}
        label={label}
        icon={<ProviderIcon provider={p} iconUrl={iconUrl} />}
        selected={selected === p && !forceUnselect}
        onClick={handleSelectProvider}
        onContextMenu={handleMenuOpen}
        data-provider={p}
        dimmed={!enabled}
        tooltip={
          !enabled
            ? t("screen_modelMenu.disabledRightClickToEnable")
            : !hasKey
              ? t("screen_modelMenu.addApiKeyRightClickForOptions")
              : undefined
        }
        count={modelCounts.get(p)}
        trailing={
          enabled && !hasKey ? (
            <WarningAmberIcon
              className="model-menu__provider-missing-key-icon"
              aria-label={t("screen_modelMenu.apiKeyRequired")}
              sx={{ width: 14, height: 14, color: "warning.main", flexShrink: 0 }}
            />
          ) : undefined
        }
      />
    );
  };

  return (
    <Box
      css={isHorizontal ? horizontalListStyles : listStyles}
      className={`model-menu__providers-list ${isHorizontal ? "is-horizontal" : ""}`}
      role="navigation"
      aria-label={t("screen_modelMenu.modelSources")}
    >
      <ModelMenuNavItem
        className="model-menu__provider-item model-menu__provider-item--all"
        orientation={orientation}
        label={isHorizontal ? t("screen_modelMenu.all") : t("screen_modelMenu.allModels")}
        icon={<AppsIcon />}
        selected={selected === null && !forceUnselect}
        onClick={handleSelectNull}
        count={models.length}
      />
      {quickViews}
      {!isHorizontal && cloudList.length > 0 && (
        <SectionHeader
          title={t("screen_modelMenu.cloud")}
          size="small"
          sx={{ px: SPACING.md, pt: SPACING.md, pb: SPACING.xs }}
        />
      )}
      {isLoading && (
        <FlexRow className="model-menu__providers-loading" sx={{ p: SPACING.md }}>
          <LoadingSpinner size="small" />
        </FlexRow>
      )}
      {isError && (
        <Box className="model-menu__providers-error">
          <EmptyState variant="error" size="small" title={t("screen_modelMenu.providersDidNotLoad")} />
        </Box>
      )}
      {cloudList.map(renderProvider)}
      {localList.length > 0 && !isHorizontal && (
        <SectionHeader
          title={t("screen_modelMenu.local")}
          size="small"
          sx={{ px: SPACING.md, pt: SPACING.md, pb: SPACING.xs }}
        />
      )}
      {localList.map(renderProvider)}
      {disabledList.length > 0 && !isHorizontal && (
        <SectionHeader
          title={t("screen_modelMenu.disabled")}
          size="small"
          sx={{ px: SPACING.md, pt: SPACING.md, pb: SPACING.xs }}
        />
      )}
      {disabledList.map(renderProvider)}
      <ContextMenu
        className="model-menu__provider-context-menu"
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={handleMenuClose}
      >
        {menuNeedsKey && (
          <MenuItemPrimitive label={t("screen_modelMenu.addApiKeyEllipsis")} onClick={handleAddKey} />
        )}
        <MenuItemPrimitive
          label={
            menuProvider && isProviderEnabled(menuProvider)
              ? t("screen_modelMenu.disableProvider")
              : t("screen_modelMenu.enableProvider")
          }
          onClick={handleToggleProvider}
        />
        <MenuItemPrimitive
          label={t("screen_modelMenu.openProviderWebsite")}
          disabled={!menuProvider || !getProviderUrl(menuProvider)}
          onClick={handleOpenWebsite}
        />
      </ContextMenu>
    </Box>
  );
});

ProviderList.displayName = "ProviderList";

export default ProviderList;
