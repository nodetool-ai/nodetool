export const isMac = (): boolean =>
  typeof navigator !== "undefined" && navigator.userAgent.includes("Mac");

export const isWindows = (): boolean =>
  typeof navigator !== "undefined" && navigator.userAgent.includes("Windows");

/** Which file manager reveals a file on this platform. */
export type FileManagerKind = "finder" | "explorer" | "files";

export const fileManagerKind = (): FileManagerKind => {
  if (isMac()) {
    return "finder";
  }
  return isWindows() ? "explorer" : "files";
};
