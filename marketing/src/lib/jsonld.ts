/**
 * Typed schema.org builders.
 *
 * One place that knows the shape of every structured-data block the site
 * emits, so pages pass content and never hand-roll `@context` / `@type`
 * literals. Render the result with `<JsonLd data={…} />`.
 *
 * House rule: **schema mirrors what the page shows.** Never build an
 * `faqPageSchema` from questions the visitor cannot read on that page — pass
 * the same array the page renders. `<FaqSection />` and `<FaqBlock />` do this
 * for you.
 */

/** Any schema.org node, in the shape `JSON.stringify` sees. */
export type JsonLdObject = Record<string, unknown>;

export const SITE_URL = "https://nodetool.ai";

/** `/pricing` → `https://nodetool.ai/pricing`. Absolute URLs pass through. */
export function absoluteUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Markdown → the plain text schema.org wants in an answer. */
export function plainText(md: string): string {
  return md
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`#>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// --- FAQPage -------------------------------------------------------------

/** One visible question and its visible answer. */
export type QaPair = {
  question: string;
  /** Plain text or Markdown — Markdown is stripped before it reaches schema. */
  answer: string;
  /** Standalone page for this question, when one exists. */
  url?: string;
};

export type QuestionSchema = {
  "@type": "Question";
  name: string;
  url?: string;
  acceptedAnswer: { "@type": "Answer"; text: string; url?: string };
};

export type FaqPageSchema = {
  "@context": "https://schema.org";
  "@type": "FAQPage";
  mainEntity: QuestionSchema[];
};

export function faqPageSchema(items: readonly QaPair[]): FaqPageSchema {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map(
      (item): QuestionSchema => ({
        "@type": "Question",
        name: item.question,
        ...(item.url ? { url: absoluteUrl(item.url) } : {}),
        acceptedAnswer: {
          "@type": "Answer",
          text: plainText(item.answer),
        },
      })
    ),
  };
}

/** A page that *is* one question — the standalone `/faq/<slug>` pages. */
export type QaPageSchema = {
  "@context": "https://schema.org";
  "@type": "QAPage";
  mainEntity: {
    "@type": "Question";
    name: string;
    answerCount: 1;
    acceptedAnswer: { "@type": "Answer"; text: string; url?: string };
  };
};

export function qaPageSchema(item: QaPair): QaPageSchema {
  return {
    "@context": "https://schema.org",
    "@type": "QAPage",
    mainEntity: {
      "@type": "Question",
      name: item.question,
      answerCount: 1,
      acceptedAnswer: {
        "@type": "Answer",
        text: plainText(item.answer),
        ...(item.url ? { url: absoluteUrl(item.url) } : {}),
      },
    },
  };
}

// --- BreadcrumbList ------------------------------------------------------

export type Crumb = {
  name: string;
  /** Site-relative path or absolute URL. */
  url: string;
};

export type BreadcrumbSchema = {
  "@context": "https://schema.org";
  "@type": "BreadcrumbList";
  itemListElement: {
    "@type": "ListItem";
    position: number;
    name: string;
    item: string;
  }[];
};

/** `breadcrumbs([{ name: "FAQ", url: "/faq" }])` — Home is prepended. */
export function breadcrumbSchema(trail: readonly Crumb[]): BreadcrumbSchema {
  const crumbs: Crumb[] = [{ name: "Home", url: SITE_URL }, ...trail];
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.url),
    })),
  };
}

// --- HowTo ---------------------------------------------------------------

export type HowToStepInput = {
  name: string;
  text: string;
  image?: string;
};

export type HowToSchema = {
  "@context": "https://schema.org";
  "@type": "HowTo";
  name: string;
  description: string;
  url?: string;
  image?: string;
  tool?: { "@type": "HowToTool"; name: string }[];
  step: {
    "@type": "HowToStep";
    position: number;
    name: string;
    text: string;
    url?: string;
    image?: string;
  }[];
};

export function howToSchema(input: {
  name: string;
  description: string;
  steps: readonly HowToStepInput[];
  /** Page the steps are shown on; each step anchors to it. */
  url?: string;
  image?: string;
  /** Named tools the reader uses, e.g. models or apps. */
  tools?: readonly string[];
}): HowToSchema {
  const stepUrl = input.url ? absoluteUrl(input.url) : undefined;
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: input.name,
    description: input.description,
    ...(stepUrl ? { url: stepUrl } : {}),
    ...(input.image ? { image: absoluteUrl(input.image) } : {}),
    ...(input.tools && input.tools.length > 0
      ? {
          tool: input.tools.map((name) => ({
            "@type": "HowToTool" as const,
            name,
          })),
        }
      : {}),
    step: input.steps.map((step, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: step.name,
      text: plainText(step.text),
      ...(stepUrl ? { url: `${stepUrl}#how-it-works` } : {}),
      ...(step.image ? { image: absoluteUrl(step.image) } : {}),
    })),
  };
}

// --- ItemList ------------------------------------------------------------

export type ItemListSchema = {
  "@context": "https://schema.org";
  "@type": "ItemList";
  name: string;
  itemListElement: {
    "@type": "ListItem";
    position: number;
    name: string;
    url?: string;
  }[];
};

export function itemListSchema(
  name: string,
  items: readonly { name: string; url?: string }[]
): ItemListSchema {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      ...(item.url ? { url: absoluteUrl(item.url) } : {}),
    })),
  };
}

// --- BlogPosting ---------------------------------------------------------

export type BlogPostingSchema = {
  "@context": "https://schema.org";
  "@type": "BlogPosting";
  headline: string;
  description: string;
  url: string;
  image?: string;
  datePublished: string;
  dateModified: string;
  keywords?: string;
  wordCount?: number;
  author: { "@type": "Organization"; name: string; url: string };
  publisher: {
    "@type": "Organization";
    name: string;
    url: string;
    logo: { "@type": "ImageObject"; url: string };
  };
  mainEntityOfPage: { "@type": "WebPage"; "@id": string };
};

export function blogPostingSchema(input: {
  headline: string;
  description: string;
  /** Site-relative path of the post. */
  url: string;
  /** Site-relative path of the social card. */
  image?: string;
  /** ISO date (YYYY-MM-DD). */
  datePublished: string;
  /** ISO date of the last edit; defaults to `datePublished`. */
  dateModified?: string;
  author: string;
  keywords?: readonly string[];
  wordCount?: number;
}): BlogPostingSchema {
  const url = absoluteUrl(input.url);
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: input.headline,
    description: input.description,
    url,
    ...(input.image ? { image: absoluteUrl(input.image) } : {}),
    datePublished: input.datePublished,
    dateModified: input.dateModified ?? input.datePublished,
    ...(input.keywords && input.keywords.length > 0
      ? { keywords: input.keywords.join(", ") }
      : {}),
    ...(input.wordCount ? { wordCount: input.wordCount } : {}),
    author: { "@type": "Organization", name: input.author, url: SITE_URL },
    publisher: {
      "@type": "Organization",
      name: "NodeTool",
      url: SITE_URL,
      logo: { "@type": "ImageObject", url: absoluteUrl("/logo.png") },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
  };
}
