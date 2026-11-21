/**
 * Loads the Noto Sans SC faces for the Chinese cut. The files under
 * demo/public/promo/ are subsets that hold only the glyphs the zh copy uses,
 * so a render container without CJK fonts still draws the same type.
 * After changing Chinese text in locale.ts or VerticalCut.tsx, regenerate
 * them with `npm run font:zh` (scripts/subset-zh-font.sh). Noto Sans SC is
 * licensed under the SIL Open Font License 1.1, which permits subsets.
 */
import { staticFile } from "remotion";

const WEIGHTS = ["400", "500", "600", "800"] as const;

let loading: Promise<void> | null = null;

export function ensureZhFontLoaded(): Promise<void> {
  if (!loading) {
    loading = Promise.all(
      WEIGHTS.map(async (weight) => {
        const face = new FontFace(
          "Noto Sans SC",
          `url(${staticFile(`promo/NotoSansSC-${weight}.subset.woff2`)}) format("woff2")`,
          { weight }
        );
        await face.load();
        document.fonts.add(face);
      })
    ).then(() => undefined);
  }
  return loading;
}
