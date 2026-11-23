// Kept apart from moonshot-provider.ts so provider-credits.ts can read the
// hosts without importing the provider class, which imports it back.

/**
 * `KIMI_REGION` → OpenAI-compatible API root. International:
 * https://platform.kimi.ai/docs/api/overview.md. Mainland China (the
 * platform.moonshot.cn console, now served at platform.kimi.com):
 * https://platform.kimi.com/docs/api/chat.md, whose OpenAPI `servers` entry is
 * https://api.moonshot.cn. Keys are not shared between the two platforms.
 */
export const KIMI_BASE_URLS = {
  international: "https://api.moonshot.ai/v1",
  china: "https://api.moonshot.cn/v1"
} as const;

/** `KIMI_REGION` → API root. Empty or unknown values use the international host. */
export function resolveKimiBaseURL(region?: string | null): string {
  const key = (region ?? "").trim().toLowerCase();
  return key === "china" ? KIMI_BASE_URLS.china : KIMI_BASE_URLS.international;
}
