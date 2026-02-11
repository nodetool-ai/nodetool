/**
 * Fixtures and mock data utilities for e2e tests
 * 
 * This module provides utilities for loading and using mock data in Playwright tests.
 * All fixtures are loaded from JSON files in the fixtures directory.
 */

import { Page, Route } from "@playwright/test";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const loadJson = <T>(filename: string): T => {
  const filePath = join(__dirname, filename);
  try {
    const content = readFileSync(filePath, "utf-8");
    return JSON.parse(content) as T;
  } catch (error) {
    if (error instanceof Error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new Error(`Mock data file not found: ${filePath}`);
      }
      if (error instanceof SyntaxError) {
        throw new Error(`Invalid JSON in mock data file ${filename}: ${error.message}`);
      }
      throw new Error(`Failed to load mock data from ${filename}: ${error.message}`);
    }
    throw error;
  }
};

interface Workflow {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  access: string;
  thumbnail: string | null;
  tags: string[];
  graph: {
    nodes: unknown[];
    edges: unknown[];
  };
}

interface Thread {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  messages_count: number;
}

interface Message {
  id: string;
  thread_id: string;
  role: string;
  content: string;
  created_at: string;
}

interface Models {
  huggingface: unknown[];
  recommended: unknown[];
  recommended_language: unknown[];
  recommended_image: unknown[];
  providers: unknown[];
}

interface TemplateWorkflow {
  id: string;
  name: string;
  description: string;
  tags: string[];
}

interface Templates {
  workflows: TemplateWorkflow[];
}

const workflows = loadJson<{ workflows: Workflow[] }>("workflows.json");
const threads = loadJson<{ threads: Thread[] }>("threads.json");
const messages = loadJson<Record<string, Message[]>>("messages.json");
const models = loadJson<Models>("models.json");
const templates = loadJson<Templates>("templates.json");

export { workflows, threads, messages, models, templates };

/**
 * Get the API URL for route mocking.
 * 
 * For Playwright route interception, we need to intercept requests as seen by the browser.
 * The browser makes requests to the frontend URL (e.g., http://localhost:3000/api/...)
 * which Vite then proxies to the backend. Since we're intercepting at the browser level,
 * we use the frontend URL, not the backend URL.
 */
export function getBackendApiUrl(): string {
  const frontendUrl = process.env.E2E_FRONTEND_URL || "http://localhost:3000";
  return `${frontendUrl}/api`;
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

  // Mock essential app endpoints needed for the app to load

  // Mock settings endpoint
  await page.route(`${apiUrl}/settings/`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        COMFY_FOLDER: "",
        CHROMA_PATH: ""
      })
    });
  });

  // Mock secrets endpoint (match with and without query params)
  await page.route(`${apiUrl}/settings/secrets*`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({})
    });
  });

  // Mock workflow versions endpoint
  await page.route(`${apiUrl}/workflows/*/versions*`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ versions: [], next: null })
    });
  });

  // Mock nodes metadata endpoint with minimal metadata
  await page.route(`${apiUrl}/nodes/metadata`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          title: "Text Input",
          description: "A text input node",
          namespace: "nodetool.text",
          node_type: "nodetool.text.TextInput",
          layout: "default",
          basic_fields: [],
          is_dynamic: false,
          properties: [
            {
              name: "value",
              type: { type: "str", optional: false, type_args: [] },
              required: false
            }
          ],
          outputs: [
            {
              name: "output",
              type: { type: "str", optional: false, type_args: [] }
            }
          ],
          the_model_info: {},
          recommended_models: [],
          expose_as_tool: false,
          supports_dynamic_outputs: false,
          is_streaming_output: false
        },
        {
          title: "Preview",
          description: "Preview any value",
          namespace: "nodetool.workflows.base_node",
          node_type: "nodetool.workflows.base_node.Preview",
          layout: "default",
          basic_fields: [],
          is_dynamic: false,
          properties: [
            {
              name: "value",
              type: { type: "any", optional: true, type_args: [] },
              required: false
            }
          ],
          outputs: [],
          the_model_info: {},
          recommended_models: [],
          expose_as_tool: false,
          supports_dynamic_outputs: false,
          is_streaming_output: false
        },
        {
          title: "Stable Diffusion",
          description: "Generate images using Stable Diffusion",
          namespace: "nodetool.image",
          node_type: "nodetool.image.StableDiffusion",
          layout: "default",
          basic_fields: [],
          is_dynamic: false,
          properties: [
            {
              name: "prompt",
              type: { type: "str", optional: false, type_args: [] },
              required: true
            },
            {
              name: "steps",
              type: { type: "int", optional: false, type_args: [] },
              required: false
            },
            {
              name: "width",
              type: { type: "int", optional: false, type_args: [] },
              required: false
            },
            {
              name: "height",
              type: { type: "int", optional: false, type_args: [] },
              required: false
            }
          ],
          outputs: [
            {
              name: "image",
              type: { type: "image", optional: false, type_args: [] }
            }
          ],
          the_model_info: {},
          recommended_models: [],
          expose_as_tool: false,
          supports_dynamic_outputs: false,
          is_streaming_output: false
        },
        {
          title: "Chat Input",
          description: "Input for chat messages",
          namespace: "nodetool.text",
          node_type: "nodetool.text.ChatInput",
          layout: "default",
          basic_fields: [],
          is_dynamic: false,
          properties: [
            {
              name: "message",
              type: { type: "str", optional: false, type_args: [] },
              required: false
            }
          ],
          outputs: [
            {
              name: "output",
              type: { type: "str", optional: false, type_args: [] }
            }
          ],
          the_model_info: {},
          recommended_models: [],
          expose_as_tool: false,
          supports_dynamic_outputs: false,
          is_streaming_output: false
        },
        {
          title: "Chat Completion",
          description: "LLM Chat Completion",
          namespace: "nodetool.llm",
          node_type: "nodetool.llm.ChatCompletion",
          layout: "default",
          basic_fields: [],
          is_dynamic: false,
          properties: [
            {
              name: "model",
              type: { type: "str", optional: false, type_args: [] },
              required: true
            },
            {
              name: "temperature",
              type: { type: "float", optional: false, type_args: [] },
              required: false
            }
          ],
          outputs: [
            {
              name: "output",
              type: { type: "str", optional: false, type_args: [] }
            }
          ],
          the_model_info: {},
          recommended_models: [],
          expose_as_tool: false,
          supports_dynamic_outputs: false,
          is_streaming_output: false
        }
      ])
    });
  });

  // Mock models/all endpoint
  await page.route(`${apiUrl}/models/all`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([])
    });
  });

  // Mock assets endpoint
  await page.route(`${apiUrl}/assets/`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ assets: [], next: null })
    });
  });

  // Mock jobs endpoint
  await page.route(`${apiUrl}/jobs/`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ jobs: [], next: null })
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
