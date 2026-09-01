// sanitizeSvg.ts
// -----------------------------------------------------------------
// One sanitizer for SVG markup that is about to be inlined into the
// DOM. An SVG asset is a document the agent or the user wrote, so it
// reaches the browser as untrusted markup: inlining it raw would run
// `<script>`, `onload=`, and `<foreignObject>` HTML with the app's
// own origin. The stored file is served with a sandbox CSP
// (storage-api.ts), but an inline preview bypasses that response
// entirely — this is the boundary for that path.
// -----------------------------------------------------------------

import DOMPurify from "dompurify";

/**
 * Sanitize a whole SVG document for `dangerouslySetInnerHTML`. Keeps the
 * drawing vocabulary (gradients, filters, masks, symbols) and drops scripts,
 * event handlers and `<foreignObject>`.
 */
export const sanitizeSvgMarkup = (markup: string): string =>
  DOMPurify.sanitize(markup, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ["script", "foreignObject"],
    FORBID_ATTR: ["onload", "onerror", "onclick"]
  });

/** Whether markup contains an `<svg>` root element the preview can paint. */
export const looksLikeSvg = (markup: string): boolean =>
  /<svg[\s>]/i.test(markup);
