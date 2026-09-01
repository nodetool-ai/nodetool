import { PROVIDER_META } from "./providerCatalog";
import type { SettingsSection } from "../../stores/SettingsPageStore";

export const SETTINGS_TAB_ITEMS: ReadonlyArray<{
  value: SettingsSection;
  label: string;
}> = [
  { value: "general", label: "General" },
  { value: "providers", label: "Models & Providers" },
  { value: "integrations", label: "Integrations" },
  { value: "about", label: "About" }
];

const TAB_LABEL: Record<SettingsSection, string> = {
  general: "General",
  providers: "Models & Providers",
  integrations: "Integrations",
  about: "About"
};

export const settingsTabLabel = (section: SettingsSection): string =>
  TAB_LABEL[section];

export function matchesSearch(keywords: string, search: string): boolean {
  const query = search.trim().toLowerCase();
  if (!query) {
    return true;
  }
  return keywords.toLowerCase().includes(query);
}

const GENERAL_KEYWORDS = [
  "select nodes on drag selection editor workspace",
  "sound notifications beep",
  "automatic updates desktop",
  "update channel stable nightly",
  "on close behavior quit background tray",
  "vaults isolated database",
  "warn before large runs confirmation execution",
  "large-run threshold",
  "audio buffer latency realtime synth playback dropout",
  "max concurrent jobs runs queue concurrency parallel",
  "max concurrent runs per workflow same queue",
  "pan controls mouse select left click drag canvas navigation",
  "node selection mode full partial",
  "grid snap align nodes",
  "grid snap precision",
  "connection snap range",
  "default models provider language image embedding tts asr video code",
  "autosave version history interval minutes enable",
  "save before running checkpoint",
  "save on window close",
  "storage database cleanup limits runs compact",
  "appearance time format 12h 24h"
];

const INTEGRATION_KEYWORDS = [
  "folders assets workspace directory storage",
  "connected accounts telegram discord messaging",
  "mcp servers claude desktop",
  "browser extension chrome",
  "search provider serp brave serpapi",
  "local model servers ollama vllm llamacpp lmstudio",
  "provider options zai kie",
  "observability traceloop",
  "data storage supabase",
  "nodetool api token"
];

const ABOUT_KEYWORDS = [
  "version application about",
  "operating system",
  "features versions",
  "installation paths",
  "links github docs"
];

export function tabHasMatches(tab: SettingsSection, search: string): boolean {
  const query = search.trim().toLowerCase();
  if (!query) {
    return true;
  }
  switch (tab) {
    case "general":
      return GENERAL_KEYWORDS.some((keywords) => keywords.includes(query));
    case "providers":
      return PROVIDER_META.some(
        (provider) =>
          provider.name.toLowerCase().includes(query) ||
          provider.description.toLowerCase().includes(query) ||
          provider.key.toLowerCase().includes(query)
      );
    case "integrations":
      return INTEGRATION_KEYWORDS.some((keywords) => keywords.includes(query));
    case "about":
      return ABOUT_KEYWORDS.some((keywords) => keywords.includes(query));
  }
}

export function otherMatchingTabs(
  current: SettingsSection,
  search: string
): SettingsSection[] {
  if (!search.trim()) {
    return [];
  }
  return SETTINGS_TAB_ITEMS.map((tab) => tab.value).filter(
    (tab) => tab !== current && tabHasMatches(tab, search)
  );
}
