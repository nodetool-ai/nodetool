import type { BrowserContext, Request } from "@playwright/test";

/**
 * Abort top-level navigations outside the permitted origins. Subresources
 * (fonts, CDNs, iframes) still load, since a person's browser loads them too.
 */
export async function installOriginGuard(
  context: BrowserContext,
  allowedOrigins: readonly string[],
  onBlocked: (url: string) => Promise<void> | void
): Promise<void> {
  const allowed = new Set(allowedOrigins.map((o) => new URL(o).origin));
  await context.route("**/*", async (route) => {
    const request = route.request();
    if (isTopLevelNavigation(request) && !allowed.has(new URL(request.url()).origin)) {
      await onBlocked(request.url());
      await route.abort("blockedbyclient");
      return;
    }
    await route.fallback();
  });
}

function isTopLevelNavigation(request: Request): boolean {
  if (!request.isNavigationRequest()) {
    return false;
  }
  try {
    return request.frame().parentFrame() === null;
  } catch {
    // A new tab's first navigation is issued before its frame exists, and
    // Playwright throws on `frame()`. Only a top-level page can be in that state.
    return true;
  }
}
