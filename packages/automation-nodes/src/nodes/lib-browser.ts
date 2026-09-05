import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import { withPage } from "@nodetool-ai/browser";
import { tagAsServer } from "@nodetool-ai/nodes-utils";

/** The single `output` slot `lib.browser.Screenshot` declares: a PNG image ref. */
type ScreenshotLibNodeOutputs = {
  output: {
    type: "image";
    /** Raw base64 PNG bytes — never a `data:` URI. */
    data: string;
    mime_type: string;
  };
};

export class ScreenshotLibNode extends BaseNode {
  static readonly nodeType = "lib.browser.Screenshot";
  static readonly title = "Screenshot";
  static readonly description =
    "Takes a screenshot of a web page or specific element.\n    browser, screenshot, capture, image\n\n    Use cases:\n    - Capture visual representation of web pages\n    - Document specific UI elements\n    - Create visual records of web content";
  static readonly metadataOutputTypes = {
    output: "image"
  };
  static readonly inlineFields = ["url", "selector"];
  static readonly inputFields = [];

  @prop({
    type: "str",
    default: "",
    title: "Url",
    description: "URL to navigate to before taking screenshot"
  })
  declare url: string;

  @prop({
    type: "str",
    default: "",
    title: "Selector",
    description: "Optional CSS selector for capturing a specific element"
  })
  declare selector: string;

  @prop({
    type: "int",
    default: 30000,
    title: "Timeout",
    description: "Timeout in milliseconds for page navigation"
  })
  declare timeout: number;

  async process(): Promise<ScreenshotLibNodeOutputs> {
    const { url, selector, timeout } = this;
    if (!url) throw new Error("URL is required");

    return withPage({}, async (page) => {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout });

      let buffer: Buffer;
      if (selector) {
        await page.waitForSelector(selector, { timeout });
        buffer = await page.screenshotOfElement(selector);
      } else {
        buffer = await page.screenshot();
      }

      return {
        output: {
          type: "image",
          data: buffer.toString("base64"),
          mime_type: "image/png"
        }
      };
    });
  }
}

export const LIB_BROWSER_NODES = tagAsServer([ScreenshotLibNode]);
