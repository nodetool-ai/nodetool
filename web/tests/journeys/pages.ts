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

import { expect, type Locator, type Page } from "@playwright/test";
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

  /** Nodes React Flow marks as selected. */
  selectedNodes(): Locator {
    return this.page.locator(".react-flow__node.selected");
  }

  /** Group nodes (ReactFlow internals expose no role; class is the only hook). */
  groups(): Locator {
    return this.page.locator(
      ".react-flow__node-nodetool\\.workflows\\.base_node\\.Group"
    );
  }

  /** Click a node's header, optionally with modifier keys held. */
  async clickNode(
    nodeId: string,
    modifiers: Array<"Shift" | "ControlOrMeta"> = []
  ): Promise<void> {
    await this.page
      .locator(`[data-id="${nodeId}"] .node-header`)
      .first()
      .click({ modifiers });
  }

  /** Click empty canvas, away from the fixture's nodes. */
  async clickPane(): Promise<void> {
    await this.page
      .locator(".react-flow__pane")
      .click({ position: { x: 650, y: 700 } });
  }

  /**
   * Click a node's right resize edge without dragging it. The edge is
   * transparent until hovered, so the click is forced.
   */
  async clickResizeEdge(node: Locator): Promise<void> {
    await node
      .locator(".react-flow__resize-control.line.right")
      .first()
      .click({ force: true });
  }

  /** Click the label above the only group on the canvas. */
  async clickGroupLabel(
    modifiers: Array<"Shift" | "ControlOrMeta"> = []
  ): Promise<void> {
    const label = await this.groups().locator(".group-label").boundingBox();
    if (!label) {
      throw new Error("the group has no label to click");
    }
    // The label's text input is hidden from the pointer until it is edited,
    // so click a point on the label rather than the input element.
    await this.page.mouse.move(label.x + 8, label.y + label.height / 2);
    for (const key of modifiers) {
      await this.page.keyboard.down(key);
    }
    await this.page.mouse.down();
    await this.page.mouse.up();
    for (const key of modifiers) {
      await this.page.keyboard.up(key);
    }
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

  /** A node's output handle — the surface the output menu opens from. */
  outputHandle(nodeId: string): Locator {
    return this.page
      .locator(`[data-id="${nodeId}"] .react-flow__handle.source`)
      .first();
  }

  /**
   * Create a node from `nodeId`'s output handle via the row matching
   * `rowClass` (e.g. `create-preview-node`), and return its id.
   */
  async createFromOutputHandle(
    nodeId: string,
    rowClass: string
  ): Promise<string> {
    const idsBefore = await this.nodeIds();
    await this.outputHandle(nodeId).click({ button: "right" });
    await this.page
      .locator(".output-context-menu")
      .waitFor({ state: "visible", timeout: 15_000 });
    await this.page.locator(`.${rowClass}`).click();
    await this.page.waitForFunction(
      (count) => document.querySelectorAll(".react-flow__node").length > count,
      idsBefore.length,
      { timeout: 15_000 }
    );
    const created = (await this.nodeIds()).find(
      (id) => !idsBefore.includes(id)
    );
    if (!created) {
      throw new Error("no node was created from the output handle");
    }
    await this.waitForNodeSettled(created);
    return created;
  }

  /** Drag a node by its header, the way a user moves one. */
  async dragNode(nodeId: string, dx: number, dy: number): Promise<void> {
    const header = this.page
      .locator(`[data-id="${nodeId}"] .node-header`)
      .first();
    const box = await header.boundingBox();
    if (!box) {
      throw new Error(`node ${nodeId} has no header to drag`);
    }
    const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await this.page.mouse.move(from.x, from.y);
    await this.page.mouse.down();
    await this.page.mouse.move(from.x + dx, from.y + dy, { steps: 10 });
    await this.page.mouse.up();
    await this.waitForNodeSettled(nodeId);
  }

  /**
   * Resolve once `nodeId` has stopped moving.
   *
   * A programmatic move tweens (`transform var(--motion-normal)` in
   * `nodes.base.css`), so a rect read straight after creation is mid-slide.
   */
  async waitForNodeSettled(nodeId: string): Promise<void> {
    await this.page.waitForFunction(
      (id) => {
        const el = document.querySelector(
          `.react-flow__node[data-id="${id}"]`
        ) as HTMLElement | null;
        if (!el) {
          return false;
        }
        const w = window as unknown as {
          __settle?: { id: string; y: number; hits: number };
        };
        const y = el.getBoundingClientRect().y;
        const prev = w.__settle;
        if (!prev || prev.id !== id || Math.abs(prev.y - y) > 0.5) {
          w.__settle = { id, y, hits: 0 };
          return false;
        }
        prev.hits += 1;
        return prev.hits >= 3;
      },
      nodeId,
      { timeout: 15_000, polling: 100 }
    );
  }

  async nodeIds(): Promise<string[]> {
    return await this.page.evaluate(() =>
      Array.from(document.querySelectorAll(".react-flow__node")).map(
        (el) => el.getAttribute("data-id") ?? ""
      )
    );
  }

  /**
   * Screen-space geometry of a node and of the handles the layout is judged
   * by: its own first input handle, and its box.
   */
  async nodeGeometry(nodeId: string): Promise<{
    box: { x: number; y: number; width: number; height: number };
    inputHandle: { x: number; y: number } | null;
  }> {
    return await this.page.evaluate((id) => {
      const el = document.querySelector(
        `.react-flow__node[data-id="${id}"]`
      ) as HTMLElement | null;
      if (!el) {
        throw new Error(`node ${id} is not on the canvas`);
      }
      const r = el.getBoundingClientRect();
      const handle = el.querySelector(".react-flow__handle.target");
      const hr = handle?.getBoundingClientRect() ?? null;
      return {
        box: { x: r.x, y: r.y, width: r.width, height: r.height },
        inputHandle: hr
          ? { x: hr.x + hr.width / 2, y: hr.y + hr.height / 2 }
          : null
      };
    }, nodeId);
  }

  /** Screen-space centre of a node's output handle. */
  async outputHandleCenter(nodeId: string): Promise<{ x: number; y: number }> {
    const box = await this.outputHandle(nodeId).boundingBox();
    if (!box) {
      throw new Error(`node ${nodeId} has no output handle`);
    }
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }

  async run(): Promise<void> {
    await this.page
      .getByRole("button", { name: "Run entire workflow", exact: true })
      .click();
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

/** A chat thread open as a workspace tab. */
export class ChatPage {
  constructor(private readonly page: Page) {}

  async open(threadId: string): Promise<void> {
    await goto(this.page, `/chat/${threadId}`);
    await this.composer().waitFor({ state: "visible", timeout: 30_000 });
  }

  composer(): Locator {
    return this.page.getByPlaceholder(/Ask anything/i);
  }

  async send(message: string): Promise<void> {
    await this.composer().click();
    await this.composer().fill(message);
    await this.composer().press("Enter");
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
 * more. A user reaches one from the editor's left rail — Documents → the app —
 * which opens it as a workspace tab in Design mode, then switches that tab to
 * Run. Apps are grouped under Documents with the other project documents.
 */
export class MiniAppPage {
  constructor(private readonly page: Page) {}

  /** Open the app named `appName`. A tab opens in View mode, on the Run surface. */
  async open(appName: string): Promise<void> {
    await goto(this.page, "/workspace");
    await this.page
      .getByRole("button", { name: "Documents", exact: true })
      .click();
    await this.page
      .locator('[role="treeitem"][aria-level="1"]')
      .filter({ hasText: /^Apps/ })
      .locator('[role="treeitem"][aria-level="2"]')
      .filter({ hasText: appName })
      .click({ timeout: 30_000 });

    await this.runButton().waitFor({ state: "visible", timeout: 30_000 });
  }

  runButton(): Locator {
    return this.runtime().getByRole("button", { name: "Run echo" });
  }

  /** The app's text input within the active Run layer. */
  promptInput(): Locator {
    return this.runtime().getByRole("textbox").first();
  }

  async fillPrompt(value: string): Promise<void> {
    await this.promptInput().first().fill(value);
  }

  async run(): Promise<void> {
    await this.runButton().click();
  }

  /** The Output widget's rendered value, once the run streams one back. */
  async waitForOutput(text: string, timeout = 60_000): Promise<void> {
    await this.runtime()
      .getByText(text, { exact: false })
      .first()
      .waitFor({ state: "visible", timeout });
  }

  private runtime(): Locator {
    return this.page
      .getByTestId("application-run-layer")
      .locator('.appbuilder-runtime[data-focus-id="app-runtime"]');
  }
}

/**
 * The workflow library — the editor's Documents tree.
 *
 * This is the surface that actually lists a user's saved workflows. The
 * dashboard's own list is a different thing: it leads with templates and
 * starters, and in the seeded fixture it renders an empty state, so asserting
 * against it would test the fixture rather than the app.
 */
export class LibraryPage {
  constructor(private readonly page: Page) {}

  /** Open the editor on `workflowId`, then open the Documents panel. */
  async open(workflowId: string): Promise<void> {
    const editor = new EditorPage(this.page);
    await editor.open(workflowId);
    await this.page
      .getByRole("button", { name: "Documents", exact: true })
      .click();
    await this.searchBox().waitFor({ state: "visible", timeout: 30_000 });
  }

  searchBox(): Locator {
    return this.page.getByPlaceholder("Search documents").first();
  }

  async search(query: string): Promise<void> {
    await this.searchBox().fill(query);
  }

  /** A workflow entry in the panel, by name. */
  entry(name: string): Locator {
    return this.page
      .getByRole("tree", { name: "Project documents" })
      .locator('[role="treeitem"][aria-level="2"]')
      .filter({ hasText: name })
      .first();
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

/** The visual board and its semantic shot inspector. */
export class StoryboardPage {
  constructor(private readonly page: Page) {}

  async open(name: string): Promise<void> {
    await goto(this.page, "/workspace");
    await this.page.getByRole("button", { name: "Documents", exact: true }).click();
    await this.page.getByRole("treeitem", { name: `${name} Storyboard`, exact: true }).click();
  }

  firstShot(): Locator {
    // Shot cards expose controls but no container role.
    return this.page.locator(".shot-card").first();
  }

  shotEditor(): Locator {
    return this.page.getByTestId("shot-edit-panel");
  }
}

/** A text file opened from the New menu, edited in Monaco. */
export class TextFilePage {
  constructor(private readonly page: Page) {}

  /** New → New text file… → the given format, from the workspace home. */
  async create(format: RegExp): Promise<void> {
    await goto(this.page, "/workspace");
    await this.page.getByRole("button", { name: "Open or create a tab" }).click();
    await this.page.getByRole("menuitem", { name: /New text file/ }).click();
    await this.page.getByRole("menuitem", { name: format }).click();
    // Monaco exposes no role for its text area; `.view-lines` is what renders.
    await this.lines().waitFor({ state: "visible", timeout: 30_000 });
  }

  lines(): Locator {
    return this.page.locator(".monaco-editor .view-lines").first();
  }

  /** Type the way a fast typist or a key-repeat does: one key every 15 ms. */
  async typeFast(text: string): Promise<void> {
    await this.lines().click();
    await this.page.keyboard.type(text, { delay: 15 });
  }
}

/** The Create view, opened from the New menu. */
export class CreatePage {
  constructor(private readonly page: Page) {}

  /** Start the image model on the hermetic provider's, as Settings would. */
  async seedImageModel(): Promise<void> {
    await this.page.addInitScript(() => {
      window.localStorage.setItem(
        "nodetool-media-generation",
        JSON.stringify({
          state: {
            image: {
              model: {
                type: "image_model",
                id: "test-image-model",
                provider: "openai",
                name: "Test Image Model",
                path: ""
              },
              resolution: "1K",
              aspectRatio: "1:1",
              variations: 1
            }
          },
          version: 5
        })
      );
    });
  }

  /** New → Create images and videos, from the workspace home. */
  async open(): Promise<void> {
    await goto(this.page, "/workspace");
    await this.page.getByRole("button", { name: "Open or create a tab" }).click();
    await this.page.getByRole("menuitem", { name: /Create images and videos/ }).click();
    await this.prompt().waitFor({ state: "visible", timeout: 30_000 });
  }

  prompt(): Locator {
    return this.page.getByRole("textbox", { name: "Describe what to create" });
  }

  async generate(prompt: string): Promise<void> {
    await this.prompt().fill(prompt);
    await this.page.getByRole("button", { name: "Generate" }).click();
  }

  /** The finished tiles, by the prompt each was made from. */
  tile(prompt: string): Locator {
    return this.page
      .getByTestId("create-grid-item")
      .filter({ hasText: prompt })
      .filter({ has: this.page.getByRole("button", { name: /^Retake / }) });
  }
}

/** Home actions must work at their first painted positions, without scrolling. */
export class HomePage {
  constructor(private readonly page: Page) {}

  async open(projectId: string | null, mode: "light" | "dark"): Promise<void> {
    await this.page.addInitScript(({ projectId, mode }) => {
      localStorage.setItem("mode", mode);
      localStorage.setItem("workspace-tabs-storage", JSON.stringify({
        version: 4,
        state: {
          tabs: [],
          activeTabId: null,
          activeProjectId: projectId,
          personalProjectId: null,
          projectSessions: projectId
            ? { [projectId]: { tabIds: [], activeTabId: null, selectedChatThreadId: null } }
            : {}
        }
      }));
    }, { projectId, mode });
    await goto(this.page, "/workspace");
    await this.actions().waitFor({ state: "visible" });
    if (projectId) {
      await expect(this.page.getByRole("button", { name: "Selected project: Scrapheart", exact: true })).toBeVisible();
    }
  }

  actions(): Locator {
    return this.page.getByRole("group", { name: "Create a game or 3D model", exact: true });
  }

  action(name: "Game" | "New 3D model"): Locator {
    return this.actions().getByRole("button", { name, exact: true });
  }

  async firstScreenGeometry(name: "Game" | "New 3D model"): Promise<{
    fullyInsideViewport: boolean;
    unobstructed: boolean;
    scrollPositions: number[][];
    center: { x: number; y: number };
  }> {
    return this.action(name).evaluate((button) => {
      const rect = button.getBoundingClientRect();
      let fullyInsideViewport = rect.width > 0 && rect.height > 0 && rect.left >= 0 && rect.top >= 0 &&
        rect.right <= window.innerWidth && rect.bottom <= window.innerHeight;
      const scrollPositions = [[window.scrollX, window.scrollY]];
      for (let ancestor = button.parentElement; ancestor; ancestor = ancestor.parentElement) {
        if (ancestor.scrollHeight > ancestor.clientHeight || ancestor.scrollWidth > ancestor.clientWidth) {
          scrollPositions.push([ancestor.scrollLeft, ancestor.scrollTop]);
        }
        const style = getComputedStyle(ancestor);
        const clip = ancestor.getBoundingClientRect();
        if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
          fullyInsideViewport &&= rect.top >= clip.top && rect.bottom <= clip.bottom;
        }
        if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
          fullyInsideViewport &&= rect.left >= clip.left && rect.right <= clip.right;
        }
      }
      const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      const hit = document.elementFromPoint(center.x, center.y);
      return { fullyInsideViewport, unobstructed: hit !== null && button.contains(hit), scrollPositions, center };
    });
  }

  async clickWithoutScrolling(name: "Game" | "New 3D model"): Promise<void> {
    const { center } = await this.firstScreenGeometry(name);
    await this.page.mouse.click(center.x, center.y);
  }

  gameBrief(): Locator {
    return this.page.getByRole("textbox", { name: "Your game", exact: true });
  }

  modelMoveTool(): Locator {
    return this.page.getByRole("button", { name: "Move tool", exact: true });
  }
}
