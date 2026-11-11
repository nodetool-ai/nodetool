/**
 * Doherty threshold: workflow editor interactions.
 *
 * Each interaction is timed from its input event to the first frame that shows
 * its result, and fails above 400 ms. See `doherty.ts` for the method.
 */

import { EditorPage } from "../journeys/pages";
import { measureInteraction } from "./doherty";
import { test } from "./fixtures";

const EDITOR = "wf-editor-journey";
const OTHER = "wf-first-workflow";
const OTHER_NAME = "Lighthouse at Dusk";
const OTHER_NODE = "fw-idea";

test.describe("Doherty threshold: editor", () => {
  test("canvas", async ({ page }, testInfo) => {
    const editor = new EditorPage(page);
    await editor.open(EDITOR);
    const pane = page.locator(".react-flow__pane");

    await measureInteraction(page, testInfo, {
      name: "select a node",
      reset: async () => {
        await page.keyboard.press("Escape");
        await editor.clickPane();
      },
      act: () => editor.clickNode("prompt_input"),
      ready: { selector: '.react-flow__node.selected[data-id="prompt_input"]' }
    });

    await measureInteraction(page, testInfo, {
      name: "pan the canvas",
      reset: () => editor.clickPane(),
      act: async () => {
        await page.mouse.move(650, 700);
        await page.mouse.down();
        await page.mouse.move(700, 720, { steps: 2 });
        await page.mouse.up();
      },
      ready: { selector: ".react-flow__viewport", changes: "style" }
    });

    let zoomIn = false;
    await measureInteraction(page, testInfo, {
      name: "zoom with the keyboard",
      reset: () => editor.clickPane(),
      act: async () => {
        zoomIn = !zoomIn;
        await page.keyboard.press(zoomIn ? "ControlOrMeta+Equal" : "ControlOrMeta+Minus");
      },
      ready: { selector: ".react-flow__viewport", changes: "style" }
    });

    await measureInteraction(page, testInfo, {
      name: "open the canvas context menu",
      reset: async () => {
        await page.keyboard.press("Escape");
        await page.locator('[role="menu"]').first().waitFor({ state: "hidden" }).catch(() => {});
      },
      act: () => pane.click({ button: "right", position: { x: 650, y: 700 } }),
      ready: { selector: '[role="menu"]' }
    });
    await page.keyboard.press("Escape");

  });

  test("node menu", async ({ page }, testInfo) => {
    const editor = new EditorPage(page);
    await editor.open(EDITOR);
    const menu = page.locator(".floating-node-menu");
    const search = menu.locator("input").first();
    const closeMenu = async (): Promise<void> => {
      if (await menu.isVisible()) {
        await page.keyboard.press("Escape");
        await menu.waitFor({ state: "detached", timeout: 10_000 }).catch(() => {});
      }
    };

    await measureInteraction(page, testInfo, {
      name: "open the node menu (button)",
      reset: closeMenu,
      act: () => page.getByRole("button", { name: "Add node" }).click(),
      ready: { selector: ".floating-node-menu input" }
    });

    await measureInteraction(page, testInfo, {
      name: "open the node menu (Space)",
      reset: async () => {
        await closeMenu();
        await editor.clickPane();
      },
      act: () => page.keyboard.press("Space"),
      ready: { selector: ".floating-node-menu input" }
    });

    await measureInteraction(page, testInfo, {
      name: "type a node search",
      reset: async () => {
        if (!(await search.isVisible())) {
          await page.getByRole("button", { name: "Add node" }).click();
        }
        await search.fill("");
        await search.focus();
        await page.locator(".search-result-item", { hasText: "Concat" }).first()
          .waitFor({ state: "hidden" }).catch(() => {});
      },
      // One input event for the whole query, as a paste or a fast typist's
      // last key: the time measured is query to results, not typing speed.
      act: () => page.keyboard.insertText("concat"),
      ready: { selector: ".search-result-item", text: "Concat" }
    });

    await measureInteraction(page, testInfo, {
      name: "add a node from search results",
      runs: 3,
      reset: async () => {
        if (!(await search.isVisible())) {
          await page.getByRole("button", { name: "Add node" }).click();
        }
        await search.fill("concat");
        await page.locator(".search-result-item").first().waitFor();
      },
      act: () => page.locator(".search-result-item").first().click(),
      ready: async () => ({
        selector: ".react-flow__node",
        minCount: (await editor.nodes().count()) + 1
      })
    });
    await closeMenu();
  });

  test("text entry", async ({ page }, testInfo) => {
    const editor = new EditorPage(page);
    await editor.open(EDITOR);
    await editor.node("prompt_input").getByRole("button", { name: "Edit value" }).click();
    const field = editor.node("prompt_input").locator("textarea, input[type=text], [contenteditable=true]").first();
    await field.waitFor();
    await field.focus();
    let typed = "";

    await measureInteraction(page, testInfo, {
      name: "type into a node's text field",
      runs: 8,
      act: async () => {
        typed += "x";
        await page.keyboard.press("x");
      },
      ready: async () => ({
        selector: '[data-id="prompt_input"] textarea, [data-id="prompt_input"] input[type=text], [data-id="prompt_input"] [contenteditable=true]',
        text: `hello journey${typed}x`
      })
    });
  });

  test("tabs and documents", async ({ page }, testInfo) => {
    const editor = new EditorPage(page);
    await editor.open(EDITOR);
    const documentsButton = page.getByRole("button", { name: "Documents", exact: true });
    const tree = page.locator(".documents-tree-leaf").first();

    await measureInteraction(page, testInfo, {
      name: "toggle the Documents panel",
      act: () => documentsButton.click(),
      ready: async () => ({
        selector: ".documents-tree-leaf",
        state: (await documentsButton.getAttribute("aria-pressed")) === "true" ? "hidden" : "visible"
      })
    });

    if ((await documentsButton.getAttribute("aria-pressed")) !== "true") {
      await documentsButton.click();
      await tree.waitFor();
    }
    const otherTab = page.locator('[role="tab"]', { hasText: OTHER_NAME });

    await measureInteraction(page, testInfo, {
      name: "open a workflow from Documents",
      runs: 3,
      reset: async () => {
        if (await otherTab.count()) {
          await otherTab.hover();
          await otherTab.getByRole("button", { name: /close/i }).click();
          await otherTab.waitFor({ state: "detached" });
        }
        if ((await documentsButton.getAttribute("aria-pressed")) !== "true") {
          await documentsButton.click();
        }
        await page.locator('[role="treeitem"][aria-level="2"]').filter({ hasText: OTHER_NAME }).first().waitFor();
      },
      act: () =>
        page
          .locator('[role="treeitem"][aria-level="2"]')
          .filter({ hasText: OTHER_NAME })
          .first()
          .click(),
      ready: { selector: `.react-flow__node[data-id="${OTHER_NODE}"]` },
      feedback: { selector: '[role="tab"][aria-selected="true"]', text: OTHER_NAME }
    });

    const editorTab = page.locator('[role="tab"]', { hasText: "Editor Journey Fixture" });
    await measureInteraction(page, testInfo, {
      name: "switch workflow tabs",
      runs: 6,
      act: async () => {
        const onOther = (await otherTab.getAttribute("aria-selected")) === "true";
        await (onOther ? editorTab : otherTab).click();
      },
      ready: async () => {
        const onOther = (await otherTab.getAttribute("aria-selected")) === "true";
        return {
          selector: onOther
            ? '.react-flow__node[data-id="prompt_input"]'
            : `.react-flow__node[data-id="${OTHER_NODE}"]`
        };
      }
    });
  });

  test("commands and run", async ({ page }, testInfo) => {
    const editor = new EditorPage(page);
    await editor.open(EDITOR);

    await measureInteraction(page, testInfo, {
      name: "open the command menu",
      reset: async () => {
        await page.keyboard.press("Escape");
        await page.locator('[role="dialog"] input').first().waitFor({ state: "hidden" }).catch(() => {});
        await editor.clickPane();
      },
      act: () => page.keyboard.press("ControlOrMeta+k"),
      ready: { selector: '[role="dialog"] input' }
    });
    await page.keyboard.press("Escape");

    await measureInteraction(page, testInfo, {
      name: "run a two-node workflow to its output",
      runs: 1,
      act: () => editor.run(),
      ready: { selector: '[data-id="result_output"]', text: "hello journey" }
    });
  });
});
