export const isMac = (): boolean =>
  typeof navigator !== "undefined" && navigator.userAgent.toLowerCase().includes("mac");
