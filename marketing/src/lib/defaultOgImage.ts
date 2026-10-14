/**
 * Site-wide share card for routes without their own `opengraph-image`. A
 * route's `openGraph` replaces the root layout's, so each one names it.
 * `public/preview.png` is the root `opengraph-image` saved as a static file;
 * re-save it from `/opengraph-image` when that card changes.
 */
export const DEFAULT_OG_IMAGES = [
  {
    url: "/preview.png",
    width: 1200,
    height: 630,
    alt: "NodeTool | Open-source agent-first creative workspace",
  },
];
