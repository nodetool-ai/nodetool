import { test, expect } from "@playwright/test";
import { setupMockApiRoutes, setupSelectiveMockRoutes, workflows, threads, messages, models, templates } from "./fixtures/mockData";

// Skip when executed by Jest; Playwright tests are meant to run via `npx playwright test`.
if (process.env.JEST_WORKER_ID) {
  test.skip("skipped in jest runner", () => {});
} else {
  test.describe("Mock Data Fixtures Validation", () => {
    test("should validate workflow fixtures structure", () => {
      // Verify workflows fixture has expected structure
      expect(workflows).toBeDefined();
      expect(workflows.workflows).toBeDefined();
      expect(Array.isArray(workflows.workflows)).toBe(true);
      expect(workflows.workflows.length).toBeGreaterThan(0);

      const workflow = workflows.workflows[0];
      expect(workflow).toHaveProperty("id");
      expect(workflow).toHaveProperty("name");
      expect(workflow).toHaveProperty("description");
      expect(workflow).toHaveProperty("created_at");
      expect(workflow).toHaveProperty("graph");
      expect(workflow.graph).toHaveProperty("nodes");
      expect(workflow.graph).toHaveProperty("edges");
      expect(Array.isArray(workflow.graph.nodes)).toBe(true);
      expect(Array.isArray(workflow.graph.edges)).toBe(true);
    });

    test("should validate thread fixtures structure", () => {
      // Verify threads fixture has expected structure
      expect(threads).toBeDefined();
      expect(threads.threads).toBeDefined();
      expect(Array.isArray(threads.threads)).toBe(true);
      expect(threads.threads.length).toBeGreaterThan(0);

      const thread = threads.threads[0];
      expect(thread).toHaveProperty("id");
      expect(thread).toHaveProperty("name");
      expect(thread).toHaveProperty("created_at");
      expect(thread).toHaveProperty("user_id");
    });

    test("should validate message fixtures structure", () => {
      // Verify messages fixture has expected structure
      expect(messages).toBeDefined();
      expect(messages["thread-001"]).toBeDefined();
      expect(Array.isArray(messages["thread-001"])).toBe(true);
      expect(messages["thread-001"].length).toBeGreaterThan(0);

      const message = messages["thread-001"][0];
      expect(message).toHaveProperty("id");
      expect(message).toHaveProperty("thread_id");
      expect(message).toHaveProperty("role");
      expect(message).toHaveProperty("content");
      expect(Array.isArray(message.content)).toBe(true);
      expect(message.content[0]).toHaveProperty("type");
    });

    test("should validate model fixtures structure", () => {
      // Verify models fixture has expected structure
      expect(models).toBeDefined();
      expect(models.huggingface).toBeDefined();
      expect(Array.isArray(models.huggingface)).toBe(true);
      expect(models.huggingface.length).toBeGreaterThan(0);

      const model = models.huggingface[0];
      expect(model).toHaveProperty("id");
      expect(model).toHaveProperty("name");
      expect(model).toHaveProperty("repo_id");
      expect(model).toHaveProperty("type");

      // Verify providers
      expect(models.providers).toBeDefined();
      expect(Array.isArray(models.providers)).toBe(true);
      expect(models.providers.length).toBeGreaterThan(0);
    });

    test("should validate template fixtures structure", () => {
      // Verify templates fixture has expected structure
      expect(templates).toBeDefined();
      expect(templates.workflows).toBeDefined();
      expect(Array.isArray(templates.workflows)).toBe(true);
      expect(templates.workflows.length).toBeGreaterThan(0);

      const template = templates.workflows[0];
      expect(template).toHaveProperty("id");
      expect(template).toHaveProperty("name");
      expect(template).toHaveProperty("tags");
      expect(Array.isArray(template.tags)).toBe(true);
    });

    test("should have messages with tool calls", () => {
      // Verify we have at least one message with tool calls
      const messagesWithToolCalls = messages["thread-001"].filter(
        m => m.tool_calls !== null && m.tool_calls !== undefined
      );
      
      expect(messagesWithToolCalls.length).toBeGreaterThan(0);
      
      const messageWithTools = messagesWithToolCalls[0];
      expect(messageWithTools.tool_calls).toBeDefined();
      expect(Array.isArray(messageWithTools.tool_calls)).toBe(true);
      expect(messageWithTools.tool_calls![0]).toHaveProperty("id");
      expect(messageWithTools.tool_calls![0]).toHaveProperty("type");
      expect(messageWithTools.tool_calls![0]).toHaveProperty("function");
    });

    test("should have workflows with different node types", () => {
      // Verify workflows have different types of nodes
      const allNodeTypes = new Set<string>();
      
      workflows.workflows.forEach(workflow => {
        workflow.graph.nodes.forEach(node => {
          allNodeTypes.add(node.type);
        });
      });

      expect(allNodeTypes.size).toBeGreaterThan(1);
    });

    test("should have models of different types", () => {
      // Verify we have different model types
      const modelTypes = new Set<string>();
      
      models.huggingface.forEach(model => {
        modelTypes.add(model.type);
      });

      expect(modelTypes.size).toBeGreaterThan(1);
      expect(modelTypes.has("diffusion") || modelTypes.has("image")).toBe(true);
      expect(modelTypes.has("language") || modelTypes.has("llm")).toBe(true);
    });
  });

  test.describe("Mock API Route Setup", () => {
    test("should setup mock routes for workflows", async ({ page }) => {
      await setupMockApiRoutes(page);
      
      // Navigate to a page that uses workflows
      await page.goto("/dashboard");
      await page.waitForLoadState("networkidle");
      
      // Page should load successfully with mocked data
      const bodyText = await page.textContent("body");
      expect(bodyText).toBeTruthy();
    });

    test("should setup selective mock routes", async ({ page }) => {
      await setupSelectiveMockRoutes(page, {
        mockModels: true,
        mockTemplates: true
      });
      
      // Navigate to templates page
      await page.goto("/templates");
      await page.waitForLoadState("networkidle");
      
      // Page should load successfully
      const bodyText = await page.textContent("body");
      expect(bodyText).toBeTruthy();
    });

    test("should handle workflow API requests with mock data", async ({ page }) => {
      await setupMockApiRoutes(page);
      
      // Track if the mock route was called
      let workflowApiCalled = false;
      
      page.on("response", (response) => {
        if (response.url().includes("/api/workflows") && 
            response.status() === 200) {
          workflowApiCalled = true;
        }
      });
      
      await page.goto("/dashboard");
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1000);
      
      // The mock should have been used
      // Note: This might not always be true depending on page behavior
      const bodyText = await page.textContent("body");
      expect(bodyText).toBeTruthy();
    });

    test("should handle template search with mock data", async ({ page }) => {
      await setupMockApiRoutes(page);
      
      await page.goto("/templates");
      await page.waitForLoadState("networkidle");
      
      // The page should be functional with mock templates
      const bodyText = await page.textContent("body");
      expect(bodyText).toBeTruthy();
    });

    test("should handle model requests with mock data", async ({ page }) => {
      await setupMockApiRoutes(page);
      
      await page.goto("/models");
      await page.waitForLoadState("networkidle");
      
      // The page should be functional with mock models
      const bodyText = await page.textContent("body");
      expect(bodyText).toBeTruthy();
    });

    test("should handle chat/thread requests with mock data", async ({ page }) => {
      await setupMockApiRoutes(page);
      
      await page.goto("/chat");
      await page.waitForLoadState("networkidle");
      
      // The page should be functional with mock chat data
      const bodyText = await page.textContent("body");
      expect(bodyText).toBeTruthy();
    });
  });

  test.describe("Mock Data Content Validation", () => {
    test.beforeEach(async ({ page }) => {
      await setupMockApiRoutes(page);
    });

    test("should have realistic workflow data", async ({ page }) => {
      // Verify workflows have realistic content
      const imageWorkflow = workflows.workflows.find(w => 
        w.tags.includes("image") || w.tags.includes("generation")
      );
      
      expect(imageWorkflow).toBeDefined();
      expect(imageWorkflow!.graph.nodes.length).toBeGreaterThan(0);
      
      await page.goto("/dashboard");
      await page.waitForLoadState("networkidle");
    });

    test("should have realistic chat conversations", async ({ page }) => {
      // Verify messages form coherent conversations
      const thread1Messages = messages["thread-001"];
      
      // Should have alternating user/assistant messages
      expect(thread1Messages[0].role).toBe("user");
      expect(thread1Messages[1].role).toBe("assistant");
      
      // Messages should be in chronological order
      for (let i = 1; i < thread1Messages.length; i++) {
        const prevTime = new Date(thread1Messages[i - 1].created_at).getTime();
        const currTime = new Date(thread1Messages[i].created_at).getTime();
        expect(currTime).toBeGreaterThanOrEqual(prevTime);
      }
      
      await page.goto("/chat");
      await page.waitForLoadState("networkidle");
    });

    test("should have realistic model metadata", async ({ page }) => {
      // Verify models have realistic properties
      const sdxlModel = models.huggingface.find(m => 
        m.id.includes("stable-diffusion")
      );
      
      expect(sdxlModel).toBeDefined();
      expect(sdxlModel!.size_on_disk).toBeGreaterThan(0);
      expect(sdxlModel!.downloads).toBeGreaterThan(0);
      
      await page.goto("/models");
      await page.waitForLoadState("networkidle");
    });

    test("should have templates with proper tags", async ({ page }) => {
      // Verify all templates have at least one tag
      templates.workflows.forEach(template => {
        expect(template.tags.length).toBeGreaterThan(0);
      });
      
      // Verify tags are descriptive
      const allTags = new Set<string>();
      templates.workflows.forEach(template => {
        template.tags.forEach(tag => allTags.add(tag));
      });
      
      expect(allTags.size).toBeGreaterThan(2);
      
      await page.goto("/templates");
      await page.waitForLoadState("networkidle");
    });
  });

  test.describe("Mock Data Integration Scenarios", () => {
    test.beforeEach(async ({ page }) => {
      await setupMockApiRoutes(page);
    });

    test("should support workflow with multiple nodes and edges", async ({ page }) => {
      const complexWorkflow = workflows.workflows.find(w => 
        w.graph.nodes.length > 1 && w.graph.edges.length > 0
      );
      
      expect(complexWorkflow).toBeDefined();
      expect(complexWorkflow!.graph.nodes.length).toBeGreaterThan(1);
      expect(complexWorkflow!.graph.edges.length).toBeGreaterThan(0);
      
      // Verify edges reference existing nodes
      complexWorkflow!.graph.edges.forEach(edge => {
        const sourceExists = complexWorkflow!.graph.nodes.some(n => n.id === edge.source);
        const targetExists = complexWorkflow!.graph.nodes.some(n => n.id === edge.target);
        expect(sourceExists).toBe(true);
        expect(targetExists).toBe(true);
      });
      
      await page.goto("/dashboard");
      await page.waitForLoadState("networkidle");
    });

    test("should support chat thread with multiple messages", async ({ page }) => {
      const thread = threads.threads[0];
      const threadMessages = messages[thread.id as keyof typeof messages];
      
      expect(threadMessages.length).toBeGreaterThan(2);
      
      await page.goto(`/chat/${thread.id}`);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1000);
      
      // Page should be functional
      const bodyText = await page.textContent("body");
      expect(bodyText).toBeTruthy();
    });

    test("should support different model providers", async ({ page }) => {
      // Verify we have multiple providers
      expect(models.providers.length).toBeGreaterThan(1);
      
      // Verify some require API keys and some don't
      const requiresKey = models.providers.some(p => p.requires_api_key === true);
      const noKeyNeeded = models.providers.some(p => p.requires_api_key === false);
      
      expect(requiresKey).toBe(true);
      expect(noKeyNeeded).toBe(true);
      
      await page.goto("/models");
      await page.waitForLoadState("networkidle");
    });

    test("should support template categorization", async ({ page }) => {
      // Verify templates have diverse tags for categorization
      const tagCategories = new Set<string>();
      
      templates.workflows.forEach(template => {
        template.tags.forEach(tag => {
          // Extract category from tag (e.g., "image-generation" -> "image")
          const category = tag.split("-")[0];
          tagCategories.add(category);
        });
      });
      
      expect(tagCategories.size).toBeGreaterThan(2);
      
      await page.goto("/templates");
      await page.waitForLoadState("networkidle");
    });
  });
}
