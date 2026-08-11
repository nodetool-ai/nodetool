/**
 * The three agent-facing search tools: `web_search`, `google_news`,
 * `google_images`.
 *
 * @deprecated Ported to the `web` capability module
 * (`../capabilities/web.ts`). These survive as thin subclasses so existing
 * constructors — including the SERP provider `createSearchTool` injects —
 * keep working; there is one implementation behind both.
 */

import type { SerpProvider } from "./serp-providers/index.js";
import { CapabilityTool, ungatedCapabilityRun } from "../capabilities/index.js";
import {
  googleImages,
  googleNews,
  webSearch,
  webSearchImpl
} from "../capabilities/web.js";

export { serpApiConfigured } from "../capabilities/web.js";

/**
 * @deprecated Ported to the `web` capability module. Kept as a thin subclass
 * so existing constructors keep working.
 */
export class WebSearchTool extends CapabilityTool {
  constructor(provider?: SerpProvider) {
    super(webSearch.spec, webSearchImpl(provider), ungatedCapabilityRun);
  }
}

/**
 * @deprecated Ported to the `web` capability module. Kept as a thin subclass
 * so existing constructors keep working. The provider argument was already
 * unused on this tool; it is accepted and ignored, as before.
 */
export class GoogleNewsTool extends CapabilityTool {
  constructor(_provider?: SerpProvider) {
    super(googleNews.spec, googleNews.impl, ungatedCapabilityRun);
  }
}

/**
 * @deprecated Ported to the `web` capability module. Kept as a thin subclass
 * so existing constructors keep working. The provider argument was already
 * unused on this tool; it is accepted and ignored, as before.
 */
export class GoogleImagesTool extends CapabilityTool {
  constructor(_provider?: SerpProvider) {
    super(googleImages.spec, googleImages.impl, ungatedCapabilityRun);
  }
}
