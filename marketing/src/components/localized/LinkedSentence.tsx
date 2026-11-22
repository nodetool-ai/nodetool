import { Fragment } from "react";
import type { Locale } from "@/i18n/routes";
import { localeHref } from "@/i18n/links";
import { localeChrome } from "@/i18n/pages";

/**
 * A sentence with links in it, written as one template so a translation can
 * move the links: "See how the {editor} turns the shots into a timeline."
 * Each `{name}` becomes the link of that name.
 */
export default function LinkedSentence({
  template,
  links,
  locale,
  className,
}: {
  template: string;
  links: Record<string, { href: string; label: string }>;
  locale: Locale | null;
  className: string;
}) {
  const parts = template.split(/(\{\w+\})/);
  return (
    <>
      {parts.map((part, index) => {
        const key = part.match(/^\{(\w+)\}$/)?.[1];
        const link = key ? links[key] : undefined;
        if (!link) return <Fragment key={index}>{part}</Fragment>;
        const target = localeHref(locale, link.href);
        return (
          <a key={index} href={target.href} hrefLang={target.hrefLang} className={className}>
            {link.label}
            {target.english && locale ? localeChrome(locale).englishSuffix : null}
          </a>
        );
      })}
    </>
  );
}
