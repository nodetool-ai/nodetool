/**
 * Loads the Inter faces pinned under `demo/public/promo/` (copied from
 * `electron/assets`) so the promo's text cards render identically on any
 * machine — render containers usually have no Inter installed, and falling
 * back to DejaVu ruins the type. Registered as family "Inter", which also
 * upgrades the embedded product UI when its own webfont isn't bundled.
 */
import { useEffect, useState } from "react";
import { continueRender, delayRender, staticFile } from "remotion";

const FACES: ReadonlyArray<{ file: string; weight: string }> = [
  { file: "Inter-Regular.woff2", weight: "400" },
  { file: "Inter-Medium.woff2", weight: "500" },
  { file: "Inter-SemiBold.woff2", weight: "600" },
  { file: "Inter-ExtraBold.woff2", weight: "800" },
];

let loading: Promise<void> | null = null;

function ensureInterLoaded(): Promise<void> {
  if (!loading) {
    loading = Promise.all(
      FACES.map(async ({ file, weight }) => {
        const face = new FontFace(
          "Inter",
          `url(${staticFile(`promo/${file}`)}) format("woff2")`,
          { weight }
        );
        await face.load();
        document.fonts.add(face);
      })
    ).then(() => undefined);
  }
  return loading;
}

/** Blocks the render until the Inter faces are registered. */
export function useInterFont(): void {
  const [handle] = useState(() => delayRender("promo: load Inter"));
  useEffect(() => {
    let mounted = true;
    ensureInterLoaded()
      .catch(() => undefined) // font failure should degrade, not hang the render
      .then(() => {
        if (mounted) continueRender(handle);
      });
    return () => {
      mounted = false;
      continueRender(handle);
    };
  }, [handle]);
}
