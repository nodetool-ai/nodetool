import React from "react";

/**
 * Hero screenshot of the workflow canvas with a hand-built srcSet.
 *
 * The Cloudflare deploy sets `images.unoptimized`, so next/image emits a
 * single fixed-size file and phones download the full 1200px screenshot.
 * The -640/-960 variants are committed next to the original in public/.
 */
export default function CanvasScreenshot({ alt }: { alt: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/screen_canvas.webp"
      srcSet="/screen_canvas-640.webp 640w, /screen_canvas-960.webp 960w, /screen_canvas.webp 1200w"
      sizes="(max-width: 1023px) 100vw, 58vw"
      alt={alt}
      width={1200}
      height={792}
      decoding="async"
      className="block h-auto w-full rounded-xl"
      // React 18 doesn't know the camelCase prop yet; pass the raw attribute.
      {...{ fetchpriority: "high" }}
    />
  );
}
