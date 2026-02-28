/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useCallback } from "react";
import {
  List,
  ListItemButton,
  ListItemText,
  CircularProgress,
  Checkbox,
  Tooltip,
  Box,
  Button,
  Menu,
  MenuItem,
  Divider
} from "@mui/material";
import FormatListBulletedIcon from "@mui/icons-material/FormatListBulleted";
import { useTheme } from "@mui/material/styles";
import {
  TOOLTIP_ENTER_DELAY,
  TOOLTIP_ENTER_NEXT_DELAY
} from "../../config/constants";
import useModelPreferencesStore from "../../stores/ModelPreferencesStore";

import { useSettingsStore } from "../../stores/SettingsStore";
import {
  isHuggingFaceProvider,
  isHuggingFaceLocalProvider,
  getProviderBaseName,
  formatGenericProviderName,
  getProviderUrl
} from "../../utils/providerDisplay";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import {
  ModelMenuStoreHook,
  requiredSecretForProvider,
  useLanguageModelMenuStore
} from "../../stores/ModelMenuStore";
import { useSecrets } from "../../hooks/useSecrets";
import { useIsDarkMode } from "../../hooks/useIsDarkMode";

// Import provider icons from @lobehub/icons-static-svg
import openaiIcon from "@lobehub/icons-static-svg/icons/openai.svg";
import anthropicIcon from "@lobehub/icons-static-svg/icons/anthropic.svg";
import claudeColorIcon from "@lobehub/icons-static-svg/icons/claude-color.svg";
import geminiColorIcon from "@lobehub/icons-static-svg/icons/gemini-color.svg";
import googlecloudColorIcon from "@lobehub/icons-static-svg/icons/googlecloud-color.svg";
import vertexaiColorIcon from "@lobehub/icons-static-svg/icons/vertexai-color.svg";
import huggingfaceColorIcon from "@lobehub/icons-static-svg/icons/huggingface-color.svg";
import ollamaIcon from "@lobehub/icons-static-svg/icons/ollama.svg";
import lmstudioIcon from "@lobehub/icons-static-svg/icons/lmstudio.svg";
import azureColorIcon from "@lobehub/icons-static-svg/icons/azure-color.svg";
import azureaiColorIcon from "@lobehub/icons-static-svg/icons/azureai-color.svg";
import awsColorIcon from "@lobehub/icons-static-svg/icons/aws-color.svg";
import bedrockColorIcon from "@lobehub/icons-static-svg/icons/bedrock-color.svg";
import replicateIcon from "@lobehub/icons-static-svg/icons/replicate.svg";
import falColorIcon from "@lobehub/icons-static-svg/icons/fal-color.svg";
import deepseekColorIcon from "@lobehub/icons-static-svg/icons/deepseek-color.svg";
import groqIcon from "@lobehub/icons-static-svg/icons/groq.svg";
import mistralColorIcon from "@lobehub/icons-static-svg/icons/mistral-color.svg";
import togetherColorIcon from "@lobehub/icons-static-svg/icons/together-color.svg";
import perplexityColorIcon from "@lobehub/icons-static-svg/icons/perplexity-color.svg";
import ai21Icon from "@lobehub/icons-static-svg/icons/ai21.svg";
import cloudflareColorIcon from "@lobehub/icons-static-svg/icons/cloudflare-color.svg";
import workersaiColorIcon from "@lobehub/icons-static-svg/icons/workersai-color.svg";
import fireworksColorIcon from "@lobehub/icons-static-svg/icons/fireworks-color.svg";
import stabilityColorIcon from "@lobehub/icons-static-svg/icons/stability-color.svg";
import cerebrasColorIcon from "@lobehub/icons-static-svg/icons/cerebras-color.svg";
import moonshotIcon from "@lobehub/icons-static-svg/icons/moonshot.svg";
import novitaColorIcon from "@lobehub/icons-static-svg/icons/novita-color.svg";
import sambanovaColorIcon from "@lobehub/icons-static-svg/icons/sambanova-color.svg";
import siliconcloudColorIcon from "@lobehub/icons-static-svg/icons/siliconcloud-color.svg";
import xinferenceColorIcon from "@lobehub/icons-static-svg/icons/xinference-color.svg";
import dalleColorIcon from "@lobehub/icons-static-svg/icons/dalle-color.svg";
import bflIcon from "@lobehub/icons-static-svg/icons/bfl.svg";
import fluxIcon from "@lobehub/icons-static-svg/icons/flux.svg";
import lumaColorIcon from "@lobehub/icons-static-svg/icons/luma-color.svg";
import recraftIcon from "@lobehub/icons-static-svg/icons/recraft.svg";
import ideogramIcon from "@lobehub/icons-static-svg/icons/ideogram.svg";
import tripoColorIcon from "@lobehub/icons-static-svg/icons/tripo-color.svg";
import haiperIcon from "@lobehub/icons-static-svg/icons/haiper.svg";
import klingColorIcon from "@lobehub/icons-static-svg/icons/kling-color.svg";
import hunyuanColorIcon from "@lobehub/icons-static-svg/icons/hunyuan-color.svg";
import pikaIcon from "@lobehub/icons-static-svg/icons/pika.svg";
import runwayIcon from "@lobehub/icons-static-svg/icons/runway.svg";
import viduColorIcon from "@lobehub/icons-static-svg/icons/vidu-color.svg";
import viggleIcon from "@lobehub/icons-static-svg/icons/viggle.svg";
import hailuoColorIcon from "@lobehub/icons-static-svg/icons/hailuo-color.svg";
import kolorsColorIcon from "@lobehub/icons-static-svg/icons/kolors-color.svg";
import kreaIcon from "@lobehub/icons-static-svg/icons/krea.svg";
import elevenlabsIcon from "@lobehub/icons-static-svg/icons/elevenlabs.svg";
import deepmindColorIcon from "@lobehub/icons-static-svg/icons/deepmind-color.svg";
import xaiIcon from "@lobehub/icons-static-svg/icons/xai.svg";
import grokIcon from "@lobehub/icons-static-svg/icons/grok.svg";
import metaColorIcon from "@lobehub/icons-static-svg/icons/meta-color.svg";
import metaaiColorIcon from "@lobehub/icons-static-svg/icons/metaai-color.svg";
import llamaindexColorIcon from "@lobehub/icons-static-svg/icons/llamaindex-color.svg";
import langchainColorIcon from "@lobehub/icons-static-svg/icons/langchain-color.svg";
import langfuseColorIcon from "@lobehub/icons-static-svg/icons/langfuse-color.svg";
import langsmithColorIcon from "@lobehub/icons-static-svg/icons/langsmith-color.svg";
import langgraphColorIcon from "@lobehub/icons-static-svg/icons/langgraph-color.svg";
import nvidiaColorIcon from "@lobehub/icons-static-svg/icons/nvidia-color.svg";
import hyperbolicColorIcon from "@lobehub/icons-static-svg/icons/hyperbolic-color.svg";
import deepinfraColorIcon from "@lobehub/icons-static-svg/icons/deepinfra-color.svg";
import basetenIcon from "@lobehub/icons-static-svg/icons/baseten.svg";
import friendliIcon from "@lobehub/icons-static-svg/icons/friendli.svg";
import exaColorIcon from "@lobehub/icons-static-svg/icons/exa-color.svg";
import jinaIcon from "@lobehub/icons-static-svg/icons/jina.svg";
import upstageColorIcon from "@lobehub/icons-static-svg/icons/upstage-color.svg";
import cohereColorIcon from "@lobehub/icons-static-svg/icons/cohere-color.svg";
import commandaColorIcon from "@lobehub/icons-static-svg/icons/commanda-color.svg";
import ayaColorIcon from "@lobehub/icons-static-svg/icons/aya-color.svg";
import palmColorIcon from "@lobehub/icons-static-svg/icons/palm-color.svg";
import copilotColorIcon from "@lobehub/icons-static-svg/icons/copilot-color.svg";
import githubcopilotIcon from "@lobehub/icons-static-svg/icons/githubcopilot.svg";
import githubIcon from "@lobehub/icons-static-svg/icons/github.svg";
import vercelIcon from "@lobehub/icons-static-svg/icons/vercel.svg";
import openrouterIcon from "@lobehub/icons-static-svg/icons/openrouter.svg";
import lobehubColorIcon from "@lobehub/icons-static-svg/icons/lobehub-color.svg";
import automaticColorIcon from "@lobehub/icons-static-svg/icons/automatic-color.svg";
import comfyuiColorIcon from "@lobehub/icons-static-svg/icons/comfyui-color.svg";
import glifIcon from "@lobehub/icons-static-svg/icons/glif.svg";
import pollinationsIcon from "@lobehub/icons-static-svg/icons/pollinations.svg";
import ppioColorIcon from "@lobehub/icons-static-svg/icons/ppio-color.svg";
import inferenceIcon from "@lobehub/icons-static-svg/icons/inference.svg";
import featherlessColorIcon from "@lobehub/icons-static-svg/icons/featherless-color.svg";
import voyageColorIcon from "@lobehub/icons-static-svg/icons/voyage-color.svg";
import zaiIcon from "@lobehub/icons-static-svg/icons/zai.svg";

// Chinese providers
import alibabacloudColorIcon from "@lobehub/icons-static-svg/icons/alibabacloud-color.svg";
import bailianColorIcon from "@lobehub/icons-static-svg/icons/bailian-color.svg";
import qwenColorIcon from "@lobehub/icons-static-svg/icons/qwen-color.svg";
import zhipuColorIcon from "@lobehub/icons-static-svg/icons/zhipu-color.svg";
import chatglmColorIcon from "@lobehub/icons-static-svg/icons/chatglm-color.svg";
import wenxinColorIcon from "@lobehub/icons-static-svg/icons/wenxin-color.svg";
import baiduColorIcon from "@lobehub/icons-static-svg/icons/baidu-color.svg";
import bytedanceColorIcon from "@lobehub/icons-static-svg/icons/bytedance-color.svg";
import doubaoColorIcon from "@lobehub/icons-static-svg/icons/doubao-color.svg";
import yiColorIcon from "@lobehub/icons-static-svg/icons/yi-color.svg";
import stepfunColorIcon from "@lobehub/icons-static-svg/icons/stepfun-color.svg";
import sensenovaColorIcon from "@lobehub/icons-static-svg/icons/sensenova-color.svg";
import minimaxColorIcon from "@lobehub/icons-static-svg/icons/minimax-color.svg";
import sparkColorIcon from "@lobehub/icons-static-svg/icons/spark-color.svg";
import iflytekcloudColorIcon from "@lobehub/icons-static-svg/icons/iflytekcloud-color.svg";
import internlmColorIcon from "@lobehub/icons-static-svg/icons/internlm-color.svg";
import skyworkColorIcon from "@lobehub/icons-static-svg/icons/skywork-color.svg";
import tencentColorIcon from "@lobehub/icons-static-svg/icons/tencent-color.svg";
import tencentcloudColorIcon from "@lobehub/icons-static-svg/icons/tencentcloud-color.svg";
import yuanbaoColorIcon from "@lobehub/icons-static-svg/icons/yuanbao-color.svg";

// Provider to SVG icon mapping
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
  mlx: lmstudioIcon,
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
  comfyui: comfyuiColorIcon,
  glif: glifIcon,
  pollinations: pollinationsIcon,
  ppio: ppioColorIcon,
  inference: inferenceIcon,
  featherless: featherlessColorIcon,
  voyage: voyageColorIcon,
};

// Get icon URL for a provider
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

const listStyles = css({
  overflowY: "auto",
  maxHeight: "calc(100% - 20px)"
});

export interface ProviderListProps {
  providers: string[];
  isLoading: boolean;
  isError: boolean;
  storeHook?: ModelMenuStoreHook<any>;
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
  const setMenuOpen = useSettingsStore((s) => s.setMenuOpen);
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
    const result = { enabledList, disabledList };
    return result;
  }, [providers, enabledProviders]);

  const handleSelectNull = useCallback(() => {
    setSelected(null);
  }, [setSelected]);

  const handleSelectProvider = useCallback((p: string) => () => {
    setSelected(p);
  }, [setSelected]);

  const handleProviderChange = useCallback((p: string, enabled: boolean) => () => {
    setProviderEnabled(p, enabled);
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

  const handleOpenSettings = useCallback(() => {
    setMenuOpen(true, 1);
  }, [setMenuOpen]);

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

  return (
    <List
      dense
      css={listStyles}
      className="model-menu__providers-list"
      sx={{ fontSize: (theme) => theme.vars.fontSizeSmall, px: iconOnly ? 0.5 : 0 }}
    >
      {isLoading && (
        <div className="model-menu__providers-loading is-loading" style={{ padding: 8 }}>
          <CircularProgress size={20} />
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
          py: iconOnly ? 1 : 0.25,
          justifyContent: iconOnly ? 'center' : 'flex-start',
          px: iconOnly ? 0 : 2,
          minHeight: iconOnly ? 40 : 'auto',
          borderRadius: iconOnly ? 1 : 0
        }}
      >
        {iconOnly ? (
          <Tooltip className="model-menu__all-providers-tooltip" title="All providers" placement="right">
            <FormatListBulletedIcon className="model-menu__all-providers-icon" />
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
      {[...sortedProviders.enabledList, ...sortedProviders.disabledList].map(
        (p, idx) => {
          const enabled = isProviderEnabled(p);
          const showDivider =
            idx === sortedProviders.enabledList.length &&
            sortedProviders.disabledList.length > 0;
          const env = requiredSecretForProvider(p);
          const normKey = /gemini|google/i.test(p) ? "gemini" : p;
          const providerEnabled = (enabledProviders || {})[normKey] !== false;
          const hasKey = env ? isApiKeySet(env) : true;
          const available = providerEnabled && hasKey;
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
              <Box className="model-menu__provider-badges" sx={{ display: "flex", gap: 0.5 }}>
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
                      enterDelay={TOOLTIP_ENTER_DELAY * 2}
                      enterNextDelay={TOOLTIP_ENTER_NEXT_DELAY * 2}
                    >
                      <span
                        className={`model-menu__provider-badge model-menu__provider-badge--${b.label.toLowerCase()}`}
                        style={{
                          padding: "1px 5px",
                          fontSize: theme.vars.fontSizeTiny,
                          lineHeight: 1.1,
                          borderRadius: 4,
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
              </Box>
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
                onClick={handleSelectProvider(p)}
                onContextMenu={(e) => handleMenuOpen(e, p)}
                sx={{
                  gap: 0.1,
                  opacity: enabled && available ? 1 : 0.5,
                  py: iconOnly ? 1 : 0.25,
                  justifyContent: iconOnly ? 'center' : 'flex-start',
                  px: iconOnly ? 0 : 2,
                  minHeight: iconOnly ? 40 : 'auto',
                  borderRadius: iconOnly ? 1 : 0
                }}
              >
                {iconOnly ? (
                  <Tooltip className="model-menu__provider-icon-tooltip" title={p} placement="right">
                    <Box className="model-menu__provider-icon-circle" sx={{
                      width: 36,
                      height: 36,
                      borderRadius: '50%',
                      bgcolor: (selected === p) ? 'primary.main' : (isProviderEnabled(p) ? 'action.selected' : 'transparent'),
                      border: `1px solid ${selected === p ? 'transparent' : theme.vars.palette.divider}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: '0.8rem',
                      color: (selected === p) ? 'primary.contrastText' : (isProviderEnabled(p) ? 'text.primary' : 'text.disabled'),
                      overflow: 'hidden',
                    }}>
                      {(() => {
                        const iconUrl = getProviderIconUrl(p);
                        if (iconUrl) {
                          // Check if using HuggingFace logo (either base HF or unknown sub-provider)
                          // In this case, don't invert in dark mode since HF logo has good contrast
                          const isHFLogo = iconUrl === huggingfaceColorIcon;
                          return (
                            <img
                              className="model-menu__provider-icon-image"
                              src={iconUrl} 
                              alt="" 
                              style={{ 
                                width: 24, 
                                height: 24, 
                                objectFit: 'contain',
                                filter: selected === p ? 'brightness(0) invert(1)' : 
                                  (isDarkMode && !isHFLogo) ? 'invert(1) brightness(1.1) contrast(0.9)' : 'none'
                              }} 
                            />
                          );
                        }
                        return formatGenericProviderName(p).substring(0, 2).toUpperCase();
                      })()}
                    </Box>
                  </Tooltip>
                ) : (
                  <>
                    <ListItemText
                      className="model-menu__provider-label"
                      primary={
                        <Box className="model-menu__provider-label-content" sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                          {(() => {
                            const iconUrl = getProviderIconUrl(p);
                            // Check if using HuggingFace logo (either base HF or unknown sub-provider)
                            // In this case, don't invert in dark mode since HF logo has good contrast
                            const isHFLogo = iconUrl === huggingfaceColorIcon;
                            return (
                              <Box className="model-menu__provider-inline-icon" sx={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: 28,
                                height: 28,
                                flexShrink: 0,
                                borderRadius: '4px',
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
                                ) : null}
                              </Box>
                            );
                          })()}
                          <span className="model-menu__provider-name">
                            {isHuggingFaceProvider(p)
                              ? getProviderBaseName(p)
                              : formatGenericProviderName(p)}
                          </span>
                        </Box>
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
                      <Box
                        className="model-menu__provider-missing-key"
                        sx={{
                          mr: 1,
                          display: "flex",
                          alignItems: "center",
                          gap: 0.5
                        }}
                        onClick={handleStopPropagation}
                      >
                        <Tooltip className="model-menu__provider-missing-key-tooltip" title="API key required">
                          <InfoOutlinedIcon
                            className="model-menu__provider-missing-key-icon"
                            sx={{
                              fontSize: (theme) => theme.vars.fontSizeNormal,
                              color: "warning.main"
                            }}
                          />
                        </Tooltip>
                        <Tooltip className="model-menu__provider-add-key-tooltip" title="Open Settings to add API key">
                          <Button
                            className="model-menu__provider-add-key-button"
                            size="small"
                            variant="text"
                            color="warning"
                            sx={{
                              minWidth: "auto",
                              p: 0,
                              fontSize: (theme) => theme.vars.fontSizeSmaller
                            }}
                            onClick={handleOpenSettings}
                          >
                            Add key
                          </Button>
                        </Tooltip>
                      </Box>
                    )}
                    <Box
                      className="model-menu__provider-actions"
                      sx={{
                        ml: "auto",
                        display: "flex",
                        alignItems: "center",
                        gap: 0.5
                      }}
                      onClick={handleStopPropagation}
                    >
                      {renderBadges()}
                      <Tooltip
                        className="model-menu__provider-toggle-tooltip"
                        title={enabled ? "Disable provider" : "Enable provider"}
                      >
                        <Checkbox
                          className="model-menu__provider-toggle-checkbox"
                          edge="end"
                          size="small"
                          sx={{
                            padding: 0,
                            "& .MuiSvgIcon-root": {
                              fontSize: (theme) => theme.vars.fontSizeBig
                            }
                          }}
                          checked={enabled}
                          onChange={(e) => handleProviderChange(p, e.target.checked)}
                        />
                      </Tooltip>
                    </Box>
                  </>
                )}
              </ListItemButton>
            </React.Fragment>
          );
        }
      )}
      <Menu
        className="model-menu__provider-context-menu"
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={handleMenuClose}
      >
        <MenuItem
          className="model-menu__provider-context-menu-item model-menu__provider-context-menu-item--website"
          disabled={!menuProvider || !getProviderUrl(menuProvider)}
          onClick={handleOpenWebsite}
        >
          Open provider website
        </MenuItem>
        <MenuItem
          className="model-menu__provider-context-menu-item model-menu__provider-context-menu-item--toggle"
          onClick={handleToggleProvider}
        >
          {menuProvider && isProviderEnabled(menuProvider)
            ? "Disable provider"
            : "Enable provider"}
        </MenuItem>
      </Menu>
    </List>
  );
};

export default ProviderList;
