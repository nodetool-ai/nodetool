export type BrowserPlatform = "Windows" | "macOS" | "Linux" | "mobile" | "unknown";

export function detectBrowserPlatform(
  browser: Pick<Navigator, "userAgent" | "platform" | "maxTouchPoints">
): BrowserPlatform {
  const ua = `${browser.userAgent} ${browser.platform}`;
  // iPadOS desktop mode reports MacIntel, but has multiple touch points.
  if (
    /android|iphone|ipad|ipod|mobile/i.test(ua) ||
    (/mac/i.test(ua) && browser.maxTouchPoints > 1)
  ) {
    return "mobile";
  }
  if (/win/i.test(ua)) {
    return "Windows";
  }
  if (/mac/i.test(ua)) {
    return "macOS";
  }
  if (/linux|x11/i.test(ua)) {
    return "Linux";
  }
  return "unknown";
}
