import { expect, test } from "@playwright/test";
import { detectBrowserPlatform } from "../../src/lib/browserPlatform";

const browsers = [
  {
    name: "iPhone",
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
    platform: "iPhone",
    maxTouchPoints: 5,
    label: "Get the desktop app",
    detected: "mobile",
  },
  {
    name: "Android",
    userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36",
    platform: "Linux armv8l",
    maxTouchPoints: 5,
    label: "Get the desktop app",
    detected: "mobile",
  },
  {
    name: "iPad",
    userAgent: "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
    platform: "iPad",
    maxTouchPoints: 5,
    label: "Get the desktop app",
    detected: "mobile",
  },
  {
    name: "iPadOS desktop mode",
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15",
    platform: "MacIntel",
    maxTouchPoints: 5,
    label: "Get the desktop app",
    detected: "mobile",
  },
  {
    name: "unknown platform",
    userAgent: "Unknown browser",
    platform: "",
    maxTouchPoints: 0,
    label: "Download Studio",
    detected: "unknown",
  },
  {
    name: "Windows",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36",
    platform: "Win32",
    maxTouchPoints: 5,
    label: "Download Studio for Windows",
    detected: "Windows",
  },
  {
    name: "macOS",
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15",
    platform: "MacIntel",
    maxTouchPoints: 0,
    label: "Download Studio for macOS",
    detected: "macOS",
  },
  {
    name: "Linux",
    userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36",
    platform: "Linux x86_64",
    maxTouchPoints: 0,
    label: "Download Studio for Linux",
    detected: "Linux",
  },
];

test.describe("platform detection", () => {
  for (const browser of browsers) {
    test(`recognizes ${browser.name}`, () => {
      expect(detectBrowserPlatform(browser)).toBe(browser.detected);
    });
  }
});

for (const browser of browsers) {
  test(`${browser.name} gets an appropriate desktop download action`, async ({ page }) => {
    await page.route("https://plausible.io/**", (route) => route.abort());
    await page.route(/\.(mp4|webm)(\?.*)?$/, (route) => route.abort());
    await page.addInitScript(({ platform, maxTouchPoints, userAgent }) => {
      Object.defineProperties(navigator, {
        platform: { get: () => platform },
        maxTouchPoints: { get: () => maxTouchPoints },
        userAgent: { get: () => userAgent },
      });
    }, browser);
    await page.route("https://api.github.com/repos/nodetool-ai/nodetool/releases/latest", (route) =>
      route.fulfill({ json: { tag_name: "v1.0.0", assets: [] } })
    );
    await page.goto("/studio");
    const action = page.getByRole("link", { name: browser.label, exact: true }).first();
    await expect(action).toBeVisible();
    await action.click();
    await expect(page).toHaveURL(/\/download$/);
    await expect(page.getByRole("heading", { name: "Download NodeTool Studio" })).toBeVisible();

    if (browser.label === "Get the desktop app") {
      await expect(page.getByText("Open this page on your desktop to install NodeTool Studio. Choose a build for macOS, Windows, or Linux below.")).toBeVisible();
      await expect(page.getByRole("link", { name: /^Download for/ })).toHaveCount(0);
      for (const name of ["macOS · Apple silicon", "macOS · Intel", "Windows", "Linux"]) {
        await expect(page.getByRole("link", { name, exact: false }).first()).toBeVisible();
      }
    } else if (browser.name !== "unknown platform") {
      await expect(page.getByRole("link", { name: /^Download for/ })).toHaveCount(1);
    } else {
      await expect(page.getByText("Pick the build for your machine.")).toBeVisible();
      await expect(page.getByRole("link", { name: /^Download for/ })).toHaveCount(0);
    }
  });
}
