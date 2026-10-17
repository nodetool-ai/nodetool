/**
 * The surfaces that may emit product analytics. Each one is chosen by the code
 * that builds its client, never derived from a user agent.
 */
export const ANALYTICS_CLIENT_TYPES = [
  "cloud_web",
  "local_desktop",
  "local_web",
  "npm_cli",
  "cloud_backend"
] as const;

export type AnalyticsClientType = (typeof ANALYTICS_CLIENT_TYPES)[number];

/** Clients a person interacts with through the GUI. */
export const GUI_CLIENT_TYPES = [
  "cloud_web",
  "local_desktop",
  "local_web"
] as const satisfies readonly AnalyticsClientType[];

/** Clients that run workflows on a person's behalf: the GUIs and the CLI. */
export const INTERACTIVE_CLIENT_TYPES = [
  ...GUI_CLIENT_TYPES,
  "npm_cli"
] as const satisfies readonly AnalyticsClientType[];

/**
 * Coarse operating system. Browser clients report `web` rather than parsing
 * the user agent.
 */
export const ANALYTICS_PLATFORMS = [
  "macos",
  "windows",
  "linux",
  "web",
  "other"
] as const;

export type AnalyticsPlatform = (typeof ANALYTICS_PLATFORMS)[number];

/** Map a Node `process.platform` value to the coarse platform enum. */
export function platformFromNode(platform: string): AnalyticsPlatform {
  if (platform === "darwin") return "macos";
  if (platform === "win32") return "windows";
  if (platform === "linux") return "linux";
  return "other";
}

export function isAnalyticsClientType(
  value: unknown
): value is AnalyticsClientType {
  return (ANALYTICS_CLIENT_TYPES as readonly unknown[]).includes(value);
}
