/**
 * Fixtures and mock data utilities for e2e tests
 * 
 * This module provides utilities for loading and using mock data in Playwright tests.
 * All fixtures are loaded from JSON files in the fixtures directory.
 */

import { Page, Route } from "@playwright/test";
import workflows from "./workflows.json";
import threads from "./threads.json";
import messages from "./messages.json";
import models from "./models.json";
import templates from "./templates.json";

export { workflows, threads, messages, models, templates };

/**
 * Get the backend API URL from environment or use default
 */
export function getBackendApiUrl(): string {
  const backendUrl = process.env.E2E_BACKEND_URL || "http://localhost:7777";
  return `${backendUrl}/api`;
}

/**
 * Setup mock routes for all common API endpoints
 * This will intercept API calls and return mock data instead
 */
export async function setupMockApiRoutes(page: Page): Promise<void> {
  const apiUrl = getBackendApiUrl();

  // Mock workflows endpoints
  await page.route(`${apiUrl}/workflows`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        workflows: workflows.workflows,
        next: null
      })
    });
  });

  await page.route(`${apiUrl}/workflows/examples`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(templates)
    });
  });

  await page.route(`${apiUrl}/workflows/examples/search*`, async (route: Route) => {
    // Parse query parameter
    const url = new URL(route.request().url());
    const query = url.searchParams.get("query") || "";
    
    // Filter templates based on query
    const filteredWorkflows = templates.workflows.filter(w => 
      w.name.toLowerCase().includes(query.toLowerCase()) ||
      w.description.toLowerCase().includes(query.toLowerCase()) ||
      w.tags.some(tag => tag.toLowerCase().includes(query.toLowerCase()))
    );

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        workflows: filteredWorkflows
      })
    });
  });

  // Mock individual workflow endpoint
  await page.route(`${apiUrl}/workflows/*`, async (route: Route) => {
    const url = route.request().url();
    const workflowId = url.split("/workflows/")[1]?.split("?")[0];
    
    const workflow = workflows.workflows.find(w => w.id === workflowId);
    
    if (workflow) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(workflow)
      });
    } else {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Workflow not found" })
      });
    }
  });

  // Mock threads endpoints
  await page.route(`${apiUrl}/threads`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        threads: threads.threads,
        next: null
      })
    });
  });

  // Mock individual thread endpoint
  await page.route(`${apiUrl}/threads/*`, async (route: Route) => {
    const url = route.request().url();
    const threadId = url.split("/threads/")[1]?.split("/")[0];
    
    const thread = threads.threads.find(t => t.id === threadId);
    
    if (thread) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(thread)
      });
    } else {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Thread not found" })
      });
    }
  });

  // Mock messages endpoints
  await page.route(`${apiUrl}/threads/*/messages`, async (route: Route) => {
    const url = route.request().url();
    const threadId = url.split("/threads/")[1]?.split("/messages")[0];
    
    const threadMessages = messages[threadId as keyof typeof messages] || [];
    
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        messages: threadMessages,
        next: null
      })
    });
  });

  // Mock models endpoints
  await page.route(`${apiUrl}/models/huggingface`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(models.huggingface)
    });
  });

  await page.route(`${apiUrl}/models/recommended`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(models.recommended)
    });
  });

  await page.route(`${apiUrl}/models/recommended/language`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(models.recommended_language)
    });
  });

  await page.route(`${apiUrl}/models/recommended/image`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(models.recommended_image)
    });
  });

  await page.route(`${apiUrl}/models/providers`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(models.providers)
    });
  });
}

/**
 * Setup mock routes for specific endpoints only
 * Use this when you want to mock only certain APIs while letting others pass through
 */
export async function setupSelectiveMockRoutes(
  page: Page,
  options: {
    mockWorkflows?: boolean;
    mockThreads?: boolean;
    mockMessages?: boolean;
    mockModels?: boolean;
    mockTemplates?: boolean;
  }
): Promise<void> {
  const apiUrl = getBackendApiUrl();

  if (options.mockWorkflows) {
    await page.route(`${apiUrl}/workflows`, async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          workflows: workflows.workflows,
          next: null
        })
      });
    });
  }

  if (options.mockTemplates) {
    await page.route(`${apiUrl}/workflows/examples*`, async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(templates)
      });
    });
  }

  if (options.mockThreads) {
    await page.route(`${apiUrl}/threads`, async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          threads: threads.threads,
          next: null
        })
      });
    });
  }

  if (options.mockMessages) {
    await page.route(`${apiUrl}/threads/*/messages`, async (route: Route) => {
      const url = route.request().url();
      const threadId = url.split("/threads/")[1]?.split("/messages")[0];
      
      const threadMessages = messages[threadId as keyof typeof messages] || [];
      
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          messages: threadMessages,
          next: null
        })
      });
    });
  }

  if (options.mockModels) {
    await page.route(`${apiUrl}/models/**`, async (route: Route) => {
      const url = route.request().url();
      
      if (url.includes("/huggingface")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(models.huggingface)
        });
      } else if (url.includes("/recommended/language")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(models.recommended_language)
        });
      } else if (url.includes("/recommended/image")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(models.recommended_image)
        });
      } else if (url.includes("/recommended")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(models.recommended)
        });
      } else if (url.includes("/providers")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(models.providers)
        });
      } else {
        await route.continue();
      }
    });
  }
}

/**
 * Utility to wait for all mock API calls to complete
 */
export async function waitForMockApiCalls(page: Page, timeout = 5000): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout });
}
