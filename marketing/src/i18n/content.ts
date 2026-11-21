/**
 * The shape of a translated page. `components/localized/LocalizedPage.tsx`
 * renders every translated page from one of these, so a translation is data:
 * the copy, which shipped media to show, and links. Links name English
 * routes; the renderer points them at the translated page when one exists and
 * marks the rest as English.
 */
import type { QaPair } from "@/lib/jsonld";

export type PageLink = { label: string; href: string };

export type PageMedia =
  /** A looping reel from /public, played by HeroDemoPlayer. */
  | { kind: "reel"; base: string; alt: string; caption?: string }
  | { kind: "image"; src: string; width: number; height: number; alt: string; caption?: string };

/** Cards drawn from a generated catalog, with translated titles. */
export type CatalogSource = "storyboards" | "adLibrary" | "recipes" | "models";

export type PageSection =
  | {
      kind: "text";
      id: string;
      kicker?: string;
      title: string;
      body: readonly string[];
      bullets?: readonly string[];
      /** A shell command shown as a code block. */
      code?: string;
      links?: readonly PageLink[];
      media?: PageMedia;
    }
  | {
      kind: "cards";
      id: string;
      kicker?: string;
      title: string;
      intro?: string;
      cards: readonly { title: string; body: string; meta?: string; link?: PageLink }[];
      note?: string;
    }
  | {
      kind: "steps";
      id: string;
      kicker?: string;
      title: string;
      intro?: string;
      steps: readonly { title: string; body: string; meta?: string }[];
      note?: string;
      links?: readonly PageLink[];
    }
  | {
      kind: "table";
      id: string;
      title: string;
      intro?: string;
      head: readonly string[];
      rows: readonly (readonly string[])[];
      note?: string;
    }
  | {
      kind: "catalog";
      id: string;
      kicker?: string;
      title: string;
      intro?: string;
      source: CatalogSource;
      /** Only these slugs, in this order. Default: the whole catalog. */
      slugs?: readonly string[];
      link?: PageLink;
    }
  | { kind: "installers"; id: string; title: string; intro?: string };

export type LocalizedPageContent = {
  /** The English route this page translates. */
  route: string;
  title: string;
  description: string;
  /** Breadcrumb and nav name. */
  name: string;
  hero: {
    kicker: string;
    h1: string;
    lead: string;
    /** Small print under the buttons. */
    note?: string;
    primary?: PageLink;
    secondary?: PageLink;
    code?: string;
    media?: PageMedia;
  };
  sections: readonly PageSection[];
  faq?: { heading: string; items: readonly QaPair[] };
  readMore?: { heading: string; links: readonly PageLink[] };
  closing: { title: string; body: string; primary?: PageLink; secondary?: PageLink };
};

/** Shared strings of the page frame, per locale. */
export type LocaleChrome = {
  download: string;
  tryBrowser: string;
  englishVersion: string;
  englishSuffix: string;
  updated: string;
};
