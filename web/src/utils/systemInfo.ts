/** Browser, OS and build provenance, as one block of text for bug reports. */
import { VERSION, GIT_COMMIT_HASH, BUILD_NUMBER } from "../config/constants";

export function getSystemInfo(): string {
  return [
    `Browser: ${navigator.userAgent}`,
    `Platform: ${navigator.platform}`,
    `Language: ${navigator.language}`,
    `Screen: ${window.screen.width}x${window.screen.height} (devicePixelRatio: ${window.devicePixelRatio})`,
    `Window: ${window.innerWidth}x${window.innerHeight}`,
    `URL: ${window.location.pathname}${window.location.search}`,
    `NodeTool version: ${VERSION} (build ${BUILD_NUMBER}, commit ${GIT_COMMIT_HASH})`,
    `Time: ${new Date().toISOString()}`
  ].join("\n");
}
