/**
 * Browser interaction tools.
 *
 * @deprecated Ported to the `web` capability module
 * (`../capabilities/web.ts`). These survive as thin subclasses so existing
 * constructors keep working; there is one implementation behind both.
 * `htmlToText` moved with them and is re-exported here for its callers.
 */

import { CapabilityTool, ungatedCapabilityRun } from "../capabilities/index.js";
import { browser, takeScreenshot } from "../capabilities/web.js";

export { htmlToText } from "../capabilities/web.js";

/**
 * @deprecated Ported to the `web` capability module. Kept as a thin subclass
 * so existing constructors keep working.
 */
export class BrowserTool extends CapabilityTool {
  constructor() {
    super(browser.spec, browser.impl, ungatedCapabilityRun);
  }
}

/**
 * @deprecated Ported to the `web` capability module. Kept as a thin subclass
 * so existing constructors keep working.
 */
export class ScreenshotTool extends CapabilityTool {
  constructor() {
    super(takeScreenshot.spec, takeScreenshot.impl, ungatedCapabilityRun);
  }
}
