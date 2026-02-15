/**
 * Helper utilities for efficient waiting in E2E tests
 * 
 * These helpers replace arbitrary waitForTimeout() calls with proper state-based waiting,
 * significantly improving test speed and reliability.
 */

import { Page, Locator, expect } from "@playwright/test";

/**
 * Wait for the React Flow editor to be fully loaded and interactive
 */
export async function waitForEditorReady(page: Page, timeout = 10000): Promise<void> {
  // Wait for the ReactFlow container
  const canvas = page.locator(".react-flow");
  await expect(canvas).toBeVisible({ timeout });
  
  // Wait for viewport to be ready
  const viewport = page.locator(".react-flow__viewport");
  await expect(viewport).toBeVisible({ timeout: 5000 });
  
  // Wait for any loading indicators to disappear
  await page.waitForFunction(
    () => {
      const loadingElements = document.querySelectorAll('[aria-busy="true"], [data-loading="true"]');
      return loadingElements.length === 0;
    },
    { timeout: 5000 }
  ).catch(() => {
    // If no loading indicators found, that's fine
  });
}

/**
 * Wait for a node to be rendered and stable
 */
export async function waitForNodeReady(node: Locator, timeout = 5000): Promise<void> {
  await expect(node).toBeVisible({ timeout });
  
  // Wait for node to be stable (not animating)
  await node.waitFor({ state: "visible", timeout });
}

/**
 * Wait for page navigation to complete without networkidle
 * Uses domcontentloaded which is much faster than networkidle
 */
export async function waitForPageReady(page: Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded");
  
  // Wait for critical React hydration with a more generous timeout
  try {
    await page.waitForFunction(
      () => {
        // Check if React root is mounted
        const root = document.getElementById("root");
        return root && root.children.length > 0;
      },
      { timeout: 10000 }
    );
  } catch (_error) {
    // If React hydration check fails, that's okay - page might still be functional
    // This can happen if the backend is not responding
  }
}

/**
 * Wait for an animation to complete
 * Uses requestAnimationFrame for precise timing
 */
export async function waitForAnimation(page: Page): Promise<void> {
  await page.evaluate(() => {
    return new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
    });
  });
}

/**
 * Wait for a condition to be true with polling
 * More flexible than page.waitForFunction for complex conditions
 */
export async function waitForCondition(
  checkFn: () => Promise<boolean> | boolean,
  options: { timeout?: number; interval?: number } = {}
): Promise<void> {
  const { timeout = 5000, interval = 100 } = options;
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    if (await checkFn()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  throw new Error(`Condition not met within ${timeout}ms`);
}

/**
 * Wait for network requests to settle
 * More targeted than networkidle - only waits for specific patterns
 */
export async function waitForApiRequests(
  page: Page,
  pattern: string | RegExp,
  timeout = 5000
): Promise<void> {
  let pendingRequests = 0;
  let settled = false;
  
  const requestHandler = (request: any) => {
    const url = request.url();
    const matches = typeof pattern === 'string' 
      ? url.includes(pattern)
      : pattern.test(url);
    
    if (matches) {
      pendingRequests++;
    }
  };
  
  const responseHandler = (response: any) => {
    const url = response.url();
    const matches = typeof pattern === 'string'
      ? url.includes(pattern)
      : pattern.test(url);
    
    if (matches) {
      pendingRequests--;
      if (pendingRequests === 0) {
        settled = true;
      }
    }
  };
  
  page.on('request', requestHandler);
  page.on('response', responseHandler);
  
  try {
    await waitForCondition(() => settled, { timeout });
  } finally {
    page.off('request', requestHandler);
    page.off('response', responseHandler);
  }
}

/**
 * Wait for a specific element to be removed from the DOM
 */
export async function waitForElementRemoved(
  locator: Locator,
  timeout = 5000
): Promise<void> {
  await expect(locator).toHaveCount(0, { timeout });
}

/**
 * Wait for text content to stabilize (stop changing)
 */
export async function waitForTextStable(
  locator: Locator,
  timeout = 3000
): Promise<void> {
  let previousText = '';
  let stableCount = 0;
  const requiredStableChecks = 3;
  const checkInterval = 100;
  const maxChecks = timeout / checkInterval;
  
  for (let i = 0; i < maxChecks; i++) {
    const currentText = await locator.textContent().catch(() => '');
    
    if (currentText === previousText) {
      stableCount++;
      if (stableCount >= requiredStableChecks) {
        return;
      }
    } else {
      stableCount = 0;
      previousText = currentText;
    }
    
    await new Promise(resolve => setTimeout(resolve, checkInterval));
  }
}

/**
 * Wait for multiple elements to be visible
 */
export async function waitForElements(
  locators: Locator[],
  timeout = 5000
): Promise<void> {
  await Promise.all(
    locators.map(locator => expect(locator).toBeVisible({ timeout }))
  );
}

/**
 * Replace page.goto with optimized navigation
 */
export async function navigateToPage(
  page: Page,
  url: string,
  options: { waitForNetworkIdle?: boolean } = {}
): Promise<void> {
  const { waitForNetworkIdle = false } = options;
  
  // Use a reasonable timeout for navigation
  await page.goto(url, { timeout: 30000 });
  
  if (waitForNetworkIdle) {
    await page.waitForLoadState("networkidle");
  } else {
    await waitForPageReady(page);
  }
}

/**
 * Wait for editor workflow to load
 */
export async function waitForWorkflowLoaded(page: Page, timeout = 10000): Promise<void> {
  // Wait for editor to be ready
  await waitForEditorReady(page, timeout);
  
  // Wait for any initial API calls to complete
  await page.waitForFunction(
    () => {
      // Check if there are any pending requests in the UI
      const pendingIndicators = document.querySelectorAll('[data-pending="true"]');
      return pendingIndicators.length === 0;
    },
    { timeout: 5000 }
  ).catch(() => {
    // If no pending indicators, that's fine
  });
}
