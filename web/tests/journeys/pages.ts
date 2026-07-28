/**
 * Page objects for the user-journey suite.
 *
 * Each class wraps one surface in the verbs a user would use ("add a node",
 * "send a message", "run the app"), so the specs read as journeys and the
 * selector details live in one place. Selectors here were taken from the
 * running app, not guessed — where a raw class name is used it is because the
 * component exposes no role or label (ReactFlow internals, the node-menu
 * result list).
 */

import type { Locator, Page } from "@playwright/test";
import { waitForAppReady } from "./fixtures";

/** Open a route and wait until the app has finished booting. */
async function goto(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await waitForAppReady(page);
}

/** The workflow editor: the graph canvas, the node menu and the run controls. */
export class EditorPage {
  constructor(private readonly page: Page) {}

  async open(workflowId: string): Promise<void> {
    await goto(this.page, `/editor/${workflowId}`);
    await this.page
      .locator(".react-flow")
      .first()
      .waitFor({ state: "visible", timeout: 30_000 });
    // ReactFlow mounts the canvas before it lays the graph out; wait for the
    // first node so counts taken straight after open() are stable.
    await this.page
      .locator(".react-flow__node")
      .first()
      .waitFor({ state: "visible", timeout: 30_000 });
  }

  nodes(): Locator {
    return this.page.locator(".react-flow__node");
  }

  edges(): Locator {
    return this.page.locator(".react-flow__edge");
  }

  /** A specific node by its graph id (ReactFlow sets `rf__node-<id>`). */
  node(nodeId: string): Locator {
    return this.page.getByTestId(`rf__node-${nodeId}`);
  }

  /**
   * Add the first node matching `query` via the node menu.
   *
   * A single click on a search result creates the node (`RenderNodes`'
   * `handleNodeClick` → `requestCreate`). The menu is then dismissed with
   * Escape — it is a floating overlay that otherwise covers the canvas and
   * swallows subsequent clicks.
   */
  async addNode(query: string): Promise<void> {
    await this.page.getByRole("button", { name: "Add node" }).click();
    const search = this.page.getByPlaceholder("Search for nodes...");
    await search.waitFor({ state: "visible", timeout: 15_000 });
    await search.fill(query);

    const firstResult = this.page.locator(".search-result-item").first();
    await firstResult.waitFor({ state: "visible", timeout: 15_000 });
    await firstResult.click();

    await this.page.keyboard.press("Escape");
    await this.page
      .locator(".floating-node-menu")
      .waitFor({ state: "detached", timeout: 10_000 })
      .catch(() => {});
  }

  async run(): Promise<void> {
    await this.page.getByRole("button", { name: "Run workflow" }).click();
  }

  /** Resolves when the canvas shows `text` (an Output node renders its value). */
  async waitForCanvasText(text: string, timeout = 60_000): Promise<void> {
    await this.page
      .locator(".react-flow")
      .first()
      .getByText(text, { exact: false })
      .first()
      .waitFor({ state: "visible", timeout });
  }
}

/** A full-page chat thread. */
export class ChatPage {
  constructor(private readonly page: Page) {}

  async open(threadId: string): Promise<void> {
    await goto(this.page, `/chat/${threadId}`);
    await this.composer().waitFor({ state: "visible", timeout: 30_000 });
  }

  composer(): Locator {
    return this.page.getByPlaceholder(/Continue the thread/i);
  }

  async send(message: string): Promise<void> {
    await this.composer().click();
    await this.composer().fill(message);
    await this.page.getByRole("button", { name: "Send" }).click();
  }

  /** Resolves once `text` appears anywhere in the transcript. */
  async waitForMessage(text: string, timeout = 60_000): Promise<void> {
    await this.page
      .getByText(text, { exact: false })
      .first()
      .waitFor({ state: "visible", timeout });
  }
}

/**
 * A mini app, opened the way a user opens one.
 *
 * An app is its own resource: there is no standalone `/apps/<id>` route any
 * more. A user reaches one from the editor's left rail — Apps → the app — which
 * opens it as a workspace tab in Design mode, then switches that tab to Run.
 */
export class MiniAppPage {
  constructor(private readonly page: Page) {}

  /** Open the app named `appName` and switch its tab to Run. */
  async open(appName: string): Promise<void> {
    await goto(this.page, "/workspace");
    await this.page.getByRole("button", { name: "Apps" }).first().click();
    await this.page
      .getByRole("button", { name: appName })
      .first()
      .click({ timeout: 30_000 });

    // The tab opens in Design mode; Run is the surface a user runs the app on.
    await this.page
      .getByRole("button", { name: "Run", exact: true })
      .first()
      .click({ timeout: 30_000 });

    await this.runButton().waitFor({ state: "visible", timeout: 30_000 });
  }

  runButton(): Locator {
    return this.page.getByRole("button", { name: "Run echo" });
  }

  /** The app's text input — labelled by the seeded input node's description. */
  promptInput(): Locator {
    return this.page.getByLabel("Text echoed back by the app");
  }

  async fillPrompt(value: string): Promise<void> {
    await this.promptInput().first().fill(value);
  }

  async run(): Promise<void> {
    await this.runButton().click();
  }

  /** The Output widget's rendered value, once the run streams one back. */
  async waitForOutput(text: string, timeout = 60_000): Promise<void> {
    await this.page
      .getByText(text, { exact: false })
      .first()
      .waitFor({ state: "visible", timeout });
  }
}

/**
 * The workflow library — the editor's left "Workflows" panel.
 *
 * This is the surface that actually lists a user's saved workflows. The
 * dashboard's own list is a different thing: it leads with templates and
 * starters, and in the seeded fixture it renders an empty state, so asserting
 * against it would test the fixture rather than the app.
 */
export class LibraryPage {
  constructor(private readonly page: Page) {}

  /** Open the editor on `workflowId`, then open the Workflows panel. */
  async open(workflowId: string): Promise<void> {
    const editor = new EditorPage(this.page);
    await editor.open(workflowId);
    await this.page.getByRole("button", { name: "Workflows" }).first().click();
    await this.searchBox().waitFor({ state: "visible", timeout: 30_000 });
  }

  searchBox(): Locator {
    // Three dots, not an ellipsis character — the dashboard's search box uses
    // "Search workflows…" and would match the wrong element.
    return this.page.getByPlaceholder("Search workflows...").first();
  }

  async search(query: string): Promise<void> {
    await this.searchBox().fill(query);
  }

  /** A workflow entry in the panel, by name. */
  entry(name: string): Locator {
    return this.page.getByText(name, { exact: false });
  }

  async openWorkflow(name: string): Promise<void> {
    await this.entry(name).first().click();
  }
}

/** The asset browser. */
export class AssetsPage {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await goto(this.page, "/assets");
    await this.searchBox().waitFor({ state: "visible", timeout: 30_000 });
  }

  searchBox(): Locator {
    return this.page.getByPlaceholder("Search current folder...").first();
  }

  async search(query: string): Promise<void> {
    await this.searchBox().fill(query);
  }

  async clearSearch(): Promise<void> {
    await this.page.getByTestId("asset-search-clear-btn").click();
  }
}
