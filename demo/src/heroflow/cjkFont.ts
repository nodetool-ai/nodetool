/**
 * Loads the Noto Sans faces for the Chinese, Japanese and Korean cuts. The files
 * under demo/public/promo/ are subsets that hold only the glyphs the copy
 * uses, so a render container without CJK fonts still draws the same type.
 * After changing Chinese, Japanese or Korean text in locale.ts or VerticalCut.tsx,
 * regenerate them with `npm run font:cjk` (scripts/subset-cjk-font.sh).
 * Noto Sans SC, JP and KR are licensed under the SIL Open Font License 1.1,
 * which permits subsets.
 */
import { staticFile } from "remotion";

import type { HeroLocale } from "./locale";

const WEIGHTS = ["400", "500", "600", "800"] as const;

const FAMILY: Partial<Record<HeroLocale, { family: string; file: string }>> = {
  zh: { family: "Noto Sans SC", file: "NotoSansSC" },
  ja: { family: "Noto Sans JP", file: "NotoSansJP" },
  ko: { family: "Noto Sans KR", file: "NotoSansKR" }
};

const loading = new Map<HeroLocale, Promise<void>>();

/** Resolves at once for a locale that needs no CJK face. */
export function ensureCjkFontLoaded(locale: HeroLocale): Promise<void> {
  const face = FAMILY[locale];
  if (!face) {
    return Promise.resolve();
  }
  let pending = loading.get(locale);
  if (!pending) {
    pending = Promise.all(
      WEIGHTS.map(async (weight) => {
        const font = new FontFace(
          face.family,
          `url(${staticFile(`promo/${face.file}-${weight}.subset.woff2`)}) format("woff2")`,
          { weight }
        );
        await font.load();
        document.fonts.add(font);
      })
    ).then(() => undefined);
    loading.set(locale, pending);
  }
  return pending;
}
