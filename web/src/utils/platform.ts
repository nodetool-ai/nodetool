export const isMac = (): boolean =>
  typeof navigator !== "undefined" && navigator.userAgent.includes("Mac");
