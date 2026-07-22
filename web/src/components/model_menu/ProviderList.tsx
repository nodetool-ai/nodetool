/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useCallback } from "react";

import {
  Caption,
  Checkbox,
  Divider,
  EditorButton,
  EditorMenu,
  EditorMenuItem,
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  Tooltip,
  Box,
  BORDER_RADIUS,
  List,
  ListItemButton,
  ListItemText
} from "../ui_primitives";
import FormatListBulletedIcon from "@mui/icons-material/FormatListBulleted";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  TOOLTIP_ENTER_DELAY,
  TOOLTIP_ENTER_NEXT_DELAY
} from "../../config/constants";
import useModelPreferencesStore from "../../stores/ModelPreferencesStore";
import { openProviderOnboarding } from "../../stores/ProviderOnboardingStore";

import {
  isHuggingFaceProvider,
  isHuggingFaceLocalProvider,
  getProviderBaseName,
  formatGenericProviderName,
  getProviderUrl
} from "../../utils/providerDisplay";
import {
  requiredSecretForProvider,
  useLanguageModelMenuStore
} from "../../stores/ModelMenuStore";
import { useSecrets } from "../../hooks/useSecrets";
import { useIsDarkMode } from "../../hooks/useIsDarkMode";

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
      
      // Map of sub-provider names to their icons
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
      
      if (subProviderIcons[subProvider]) {
        return subProviderIcons[subProvider];
      }
    }
    
    // No matching sub-provider found - use HF logo
    return huggingfaceColorIcon;
  }
  
  // Try to match partial names
  const partialMatches: Record<string, string> = {
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
    perplexity: perplexityColorIcon,
    ai21: ai21Icon,
    meta: metaColorIcon,
    nvidia: nvidiaColorIcon,
  };
  
  for (const [key, value] of Object.entries(partialMatches)) {
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
  overflowY: "auto",
  maxHeight: "calc(100% - 20px)"
});

type ProviderStoreHook = <Selected>(
  selector: (state: {
    selectedProvider: string | null;
    setSelectedProvider: (provider: string | null) => void;
  }) => Selected,
  equalityFn?: (left: Selected, right: Selected) => boolean
) => Selected;

export interface ProviderListProps {
  providers: string[];
  isLoading: boolean;
  isError: boolean;
  storeHook?: ProviderStoreHook;
  forceUnselect?: boolean;
  iconOnly?: boolean;
}

const ProviderList: React.FC<ProviderListProps> = ({
  providers,
  isLoading,
  isError,
  storeHook = useLanguageModelMenuStore,
  forceUnselect = false,
  iconOnly = false
}) => {
  const theme = useTheme();
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

  const isDarkMode = useIsDarkMode();

  // Sort providers: enabled first (alphabetical), then disabled (alphabetical)
  const sortedProviders = React.useMemo(() => {
    // Use enabledProviders map directly to avoid expensive re-computation via selector functions
    const map = enabledProviders || {};
    const withLabels = providers.map((p) => {
      const label = isHuggingFaceProvider(p)
        ? getProviderBaseName(p)
        : formatGenericProviderName(p);
      const enabled = map[p] !== false; // default enabled
      return { p, label, enabled };
    });
    const enabledList = withLabels
      .filter((x) => x.enabled)
      .sort((a, b) => a.label.localeCompare(b.label))
      .map((x) => x.p);
    const disabledList = withLabels
      .filter((x) => !x.enabled)
      .sort((a, b) => a.label.localeCompare(b.label))
      .map((x) => x.p);
    return { enabledList, disabledList };
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

  const handleProviderToggle = useCallback((event: React.MouseEvent<HTMLElement>) => {
    event.stopPropagation();
    const target = event.currentTarget;
    const provider = target.dataset.provider;
    const newEnabled = target.dataset.enabled === "true";
    if (provider) {
      setProviderEnabled(provider, newEnabled);
    }
  }, [setProviderEnabled]);

  const handleMenuOpen = useCallback((event: React.MouseEvent, p: string) => {
    event.preventDefault();
    setMenuAnchor(event.currentTarget as HTMLElement);
    setMenuProvider(p);
  }, []);

  const handleMenuClose = useCallback(() => {
    setMenuAnchor(null);
    setMenuProvider(null);
  }, []);

  const handleStopPropagation = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
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

  const handleAddKey = useCallback(
    (secretKey: string | null) => {
      handleMenuClose();
      openProviderOnboarding(
        secretKey ? { highlightSecretKey: secretKey } : undefined
      );
    },
    [handleMenuClose]
  );

  return (
    <List
      dense
      css={listStyles}
      className="model-menu__providers-list"
      sx={{ fontSize: (theme: Theme) => theme.vars.fontSizeSmall, px: iconOnly ? 0.5 : 0 }}
    >
      {isLoading && (
        <div className="model-menu__providers-loading is-loading" style={{ padding: 8 }}>
          <LoadingSpinner size="small" />
        </div>
      )}
      {isError && (
        <div className="model-menu__providers-error is-error" style={{ padding: 8 }}>
          Error loading providers
        </div>
      )}
      <ListItemButton
        disableRipple
        className={`model-menu__provider-item model-menu__provider-item--all ${selected === null && !forceUnselect ? "is-selected" : ""}`}
        selected={selected === null && !forceUnselect}
        onClick={handleSelectNull}
        sx={{
          py: iconOnly ? 1 : 0.5,
          justifyContent: iconOnly ? "center" : "flex-start",
          px: iconOnly ? 0 : 2,
          minHeight: iconOnly ? 52 : "auto",
          borderRadius: iconOnly ? 1 : 0
        }}
      >
        {iconOnly ? (
          <Tooltip
            className="model-menu__all-providers-tooltip"
            title="All providers"
            placement="right"
          >
            <FlexColumn align="center" gap={0.5} sx={{ py: 0.5 }}>
              <FormatListBulletedIcon className="model-menu__all-providers-icon" />
              <Caption
                sx={{
                  display: "block",
                  maxWidth: 76,
                  textAlign: "center",
                  lineHeight: 1.15,
                  fontSize: (t: Theme) => t.vars.fontSizeSmaller,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap"
                }}
              >
                All
              </Caption>
            </FlexColumn>
          </Tooltip>
        ) : (
          <ListItemText
            className="model-menu__all-providers-text"
            primary="All providers"
            primaryTypographyProps={{
              sx: { fontSize: (theme) => theme.vars.fontSizeSmall }
            }}
          />
        )}
      </ListItemButton>
      {[...sortedProviders.enabledList, ...sortedProviders.disabledList]
        .map(
        (p, idx) => {
          const enabled = isProviderEnabled(p);
          const showDivider =
            idx === sortedProviders.enabledList.length &&
            sortedProviders.disabledList.length > 0;
          const normKey = /gemini|google/i.test(p) ? "gemini" : p;
          const providerEnabled = (enabledProviders || {})[normKey] !== false;
          const available = providerEnabled;
          const env = requiredSecretForProvider(p);
          const hasKey = env ? isApiKeySet(env) : true;
          const providerLabel = isHuggingFaceProvider(p)
            ? getProviderBaseName(p)
            : formatGenericProviderName(p);
          const renderBadges = () => {
            const badges: Array<{ label: string }> = [];
            const isHF = isHuggingFaceProvider(p);
            const isHFLocal = isHuggingFaceLocalProvider(p);
            const isLocal = /ollama|local|lmstudio|llama[_-]?cpp|mlx/i.test(p);

            if (isHF) {
              badges.push({ label: "HF" });
            }
            if (isHFLocal || isLocal) {
              badges.push({ label: "Local" });
            }
            if (!isHF && !isLocal && !isHFLocal) {
              badges.push({ label: "API" });
            }

            return (
              <FlexRow className="model-menu__provider-badges" gap={0.5}>
                {badges.map((b) => {
                  const tooltipTitle =
                    b.label === "HF"
                      ? "HuggingFace: Models from the Hugging Face Hub."
                      : b.label === "Local"
                        ? "Local: Runs locally on your machine."
                        : "API: Remote provider; runs via API without local download. Requires API key.";
                  return (
                    <Tooltip
                      className="model-menu__provider-badge-tooltip"
                      key={b.label}
                      title={tooltipTitle}
                      delay={TOOLTIP_ENTER_DELAY * 2}
                      nextDelay={TOOLTIP_ENTER_NEXT_DELAY * 2}
                    >
                      <span
                        className={`model-menu__provider-badge model-menu__provider-badge--${b.label.toLowerCase()}`}
                        style={{
                          padding: theme.spacing(0.5, 1.5),
                          fontSize: theme.vars.fontSizeSmaller,
                          lineHeight: 1.1,
                          borderRadius: BORDER_RADIUS.sm,
                          background: "transparent",
                          color:
                            b.label === "API"
                              ? theme.vars.palette.c_provider_api
                              : b.label === "Local"
                                ? theme.vars.palette.c_provider_local
                                : theme.vars.palette.c_provider_hf,
                          letterSpacing: 0.2,
                          border: `1px solid currentColor`
                        }}
                      >
                        {b.label}
                      </span>
                    </Tooltip>
                  );
                })}
              </FlexRow>
            );
          };
          return (
            <React.Fragment key={`provider-item-${p}`}>
              {showDivider && !iconOnly && (
                <Divider className="model-menu__providers-divider" component="li" sx={{ my: 0.5, opacity: 0.5 }} />
              )}
              <ListItemButton
                disableRipple
                className={`model-menu__provider-item ${selected === p ? "is-selected" : ""} ${enabled && available ? "is-enabled" : "is-disabled"}`}
                selected={selected === p}
                onClick={handleSelectProvider}
                data-provider={p}
                onContextMenu={(e) => handleMenuOpen(e, p)}
                sx={{
                  gap: 0.5,
                  opacity: enabled && available ? 1 : 0.5,
                  py: iconOnly ? 1 : 0.5,
                  justifyContent: iconOnly ? "center" : "flex-start",
                  px: iconOnly ? 0 : 2,
                  minHeight: iconOnly ? 68 : "auto",
                  borderRadius: iconOnly ? 1 : 0
                }}
              >
                {iconOnly ? (
                  <Tooltip
                    className="model-menu__provider-icon-tooltip"
                    title={providerLabel}
                    placement="right"
                  >
                    <FlexColumn align="center" gap={0.5} sx={{ py: 0.5 }}>
                      <FlexRow
                        className="model-menu__provider-icon-circle"
                        align="center"
                        justify="center"
                        sx={{
                          width: 36,
                          height: 36,
                          borderRadius: BORDER_RADIUS.circle,
                          bgcolor:
                            selected === p
                              ? "primary.main"
                              : isProviderEnabled(p)
                                ? "action.selected"
                                : "transparent",
                          border: `1px solid ${selected === p ? "transparent" : theme.vars.palette.divider}`,
                          fontWeight: 600,
                          fontSize: "var(--fontSizeSmall)",
                          color:
                            selected === p
                              ? "primary.contrastText"
                              : isProviderEnabled(p)
                                ? "text.primary"
                                : "text.disabled",
                          overflow: "hidden",
                          flexShrink: 0
                        }}
                      >
                        {(() => {
                          const iconUrl = getProviderIconUrl(p);
                          if (iconUrl) {
                            const isHFLogo = iconUrl === huggingfaceColorIcon;
                            return (
                              <img
                                className="model-menu__provider-icon-image"
                                src={iconUrl}
                                alt=""
                                style={{
                                  width: 24,
                                  height: 24,
                                  objectFit: "contain",
                                  filter: selected === p
                                    ? "brightness(0) invert(1)"
                                    : isDarkMode && !isHFLogo
                                      ? "invert(1) brightness(1.1) contrast(0.9)"
                                      : "none"
                                }}
                              />
                            );
                          }
                          return getProviderFallbackLabel(p);
                        })()}
                      </FlexRow>
                      <Caption
                        sx={{
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                          wordBreak: "break-word",
                          maxWidth: 76,
                          textAlign: "center",
                          lineHeight: 1.15,
                          fontSize: (th: Theme) => th.vars.fontSizeSmaller
                        }}
                      >
                        {providerLabel}
                      </Caption>
                    </FlexColumn>
                  </Tooltip>
                ) : (
                  <>
                    <ListItemText
                      className="model-menu__provider-label"
                      primary={
                        <FlexRow className="model-menu__provider-label-content" gap={1} align="center">
                          {(() => {
                            const iconUrl = getProviderIconUrl(p);
                            // Check if using HuggingFace logo (either base HF or unknown sub-provider)
                            // In this case, don't invert in dark mode since HF logo has good contrast
                            const isHFLogo = iconUrl === huggingfaceColorIcon;
                            return (
                              <FlexRow className="model-menu__provider-inline-icon" align="center" justify="center" sx={{
                                width: 28,
                                height: 28,
                                flexShrink: 0,
                                borderRadius: BORDER_RADIUS.sm,
                                bgcolor: isDarkMode && !isHFLogo ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
                                opacity: available ? 1 : 0.5,
                              }}>
                                {iconUrl ? (
                                  <img
                                    className="model-menu__provider-inline-icon-image"
                                    src={iconUrl} 
                                    alt="" 
                                    style={{ 
                                      width: 22, 
                                      height: 22, 
                                      objectFit: 'contain',
                                      filter: (isDarkMode && !isHFLogo) ? 'invert(1) brightness(1.1) contrast(0.9)' : 'none'
                                    }} 
                                  />
                                ) : (
                                  <Box
                                    component="span"
                                    sx={{
                                      fontWeight: 600,
                                      fontSize: theme.vars.fontSizeSmall,
                                      color: theme.vars.palette.text.primary,
                                      lineHeight: 1
                                    }}
                                  >
                                    {getProviderFallbackLabel(p)}
                                  </Box>
                                )}
                              </FlexRow>
                            );
                          })()}
                          <span className="model-menu__provider-name">
                            {providerLabel}
                          </span>
                        </FlexRow>
                      }
                      slotProps={{
                        primary: {
                          sx: {
                            fontSize: (theme) => theme.vars.fontSizeSmall
                          }
                        }
                      }}
                    />
                    {!hasKey && (
                      <FlexRow
                        className="model-menu__provider-missing-key"
                        gap={0.5}
                        align="center"
                        sx={{ mr: 1 }}
                        onClick={handleStopPropagation}
                      >
                        <Tooltip className="model-menu__provider-missing-key-tooltip" title="API key required">
                          <InfoOutlinedIcon
                            className="model-menu__provider-missing-key-icon"
                            sx={{
                              fontSize: (theme: Theme) => theme.vars.fontSizeNormal,
                              color: "warning.main"
                            }}
                          />
                        </Tooltip>
                        <Tooltip className="model-menu__provider-add-key-tooltip" title="Connect this provider">
                          <EditorButton
                            className="model-menu__provider-add-key-button"
                            density="compact"
                            variant="text"
                            sx={{
                              minWidth: "auto",
                              p: 0,
                              fontSize: (theme: Theme) => theme.vars.fontSizeSmaller,
                              color: "warning.main"
                            }}
                            onClick={() => handleAddKey(env)}
                          >
                            Add key
                          </EditorButton>
                        </Tooltip>
                      </FlexRow>
                    )}
                    <FlexRow
                      className="model-menu__provider-actions"
                      gap={0.5}
                      align="center"
                      sx={{ ml: "auto" }}
                      onClick={handleStopPropagation}
                    >
                      {renderBadges()}
                      <Tooltip
                        className="model-menu__provider-toggle-tooltip"
                        title={enabled ? "Disable provider" : "Enable provider"}
                      >
                        <Box
                          data-provider={p}
                          data-enabled={!enabled}
                          onClick={handleProviderToggle}
                          sx={{ cursor: 'pointer' }}
                        >
                          <Checkbox
                            className="model-menu__provider-toggle-checkbox"
                            edge="end"
                            size="small"
                            sx={{
                              padding: 0,
                              "& .MuiSvgIcon-root": {
                                fontSize: (theme: Theme) => theme.vars.fontSizeBig
                              },
                              pointerEvents: 'none'
                            }}
                            checked={enabled}
                          />
                        </Box>
                      </Tooltip>
                    </FlexRow>
                  </>
                )}
              </ListItemButton>
            </React.Fragment>
          );
        }
      )}
      <EditorMenu
        className="model-menu__provider-context-menu"
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={handleMenuClose}
      >
        <EditorMenuItem
          className="model-menu__provider-context-menu-item model-menu__provider-context-menu-item--website"
          disabled={!menuProvider || !getProviderUrl(menuProvider)}
          onClick={handleOpenWebsite}
        >
          Open provider website
        </EditorMenuItem>
        <EditorMenuItem
          className="model-menu__provider-context-menu-item model-menu__provider-context-menu-item--toggle"
          onClick={handleToggleProvider}
        >
          {menuProvider && isProviderEnabled(menuProvider)
            ? "Disable provider"
            : "Enable provider"}
        </EditorMenuItem>
      </EditorMenu>
    </List>
  );
};

export default ProviderList;
