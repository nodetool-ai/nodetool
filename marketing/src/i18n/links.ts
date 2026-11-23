/**
 * Where a link on a page in `locale` should point. A route with a translation
 * goes to it. Anything else stays English and says so with hrefLang, as the
 * docs do. English pages (locale null) keep their links.
 */
import { localizedPath, type Locale } from "./routes";

export type LocaleHref = { href: string; hrefLang?: "en"; english: boolean };

export function localeHref(locale: Locale | null, href: string): LocaleHref {
  if (!locale) return { href, english: false };
  if (/^https?:\/\//.test(href)) {
    const english = new URL(href).hostname === "docs.nodetool.ai";
    return english ? { href, hrefLang: "en", english } : { href, english };
  }
  const [path, hash] = href.split("#");
  const translated = localizedPath(locale, path);
  if (translated) return { href: hash ? `${translated}#${hash}` : translated, english: false };
  return { href, hrefLang: "en", english: true };
}
