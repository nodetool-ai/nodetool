import { test, expect } from "@playwright/test";
import { registryModules } from "../../src/data/registry";

/** Every indexable route is checked without launching a browser page. */
const ROUTES = registryModules.flatMap((module) => {
  const entries = module.entries.filter((entry) => entry.indexable);
  return entries.map((entry) => entry.route);
});

const MEDIA_MAGIC: Record<string, string> = {
  jpg: "\xff\xd8\xff",
  jpeg: "\xff\xd8\xff",
  png: "\x89PNG",
  webp: "RIFF",
  mp4: "ftyp",
  webm: "\x1a\x45\xdf\xa3"
};

function tagContents(html: string, tag: string): string[] {
  return [
    ...html.matchAll(
      new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "gi")
    )
  ]
    .map((match) => (match[1] ?? "").trim())
    .filter(Boolean);
}

function openingTags(html: string, tag: string): string[] {
  return [...html.matchAll(new RegExp(`<${tag}\\b[^>]*>`, "gi"))].map(
    (match) => match[0]
  );
}

function attributeValue(tag: string, attribute: string): string | undefined {
  return tag.match(new RegExp(`\\b${attribute}=["']([^"']*)["']`, "i"))?.[1];
}

function metaValues(
  html: string,
  attribute: "name" | "property",
  value: string
): string[] {
  return openingTags(html, "meta")
    .filter(
      (tag) =>
        attributeValue(tag, attribute)?.toLowerCase() === value.toLowerCase()
    )
    .map((tag) => attributeValue(tag, "content")?.trim() ?? "")
    .filter(Boolean);
}

function canonicalHrefs(html: string): string[] {
  return openingTags(html, "link")
    .filter(
      (tag) => attributeValue(tag, "rel")?.toLowerCase() === "canonical"
    )
    .map((tag) => attributeValue(tag, "href")?.trim() ?? "")
    .filter(Boolean);
}

function mediaPaths(html: string): string[] {
  const paths: string[] = [];
  for (const tag of html.matchAll(/<(?:img|video|source)\b[^>]*>/gi)) {
    for (const match of tag[0].matchAll(/\b(?:src|poster)=["']([^"']+)["']/gi)) {
      const value = match[1] ?? "";
      if (value.startsWith("/") && !value.startsWith("//")) paths.push(value);
    }
  }
  return [...new Set(paths)];
}

test.describe("static marketing output", () => {
  for (const route of ROUTES) {
    test(`${route} has valid static metadata and media`, async ({ request }) => {
      const response = await request.get(route);
      expect(response.status(), `${route} status`).toBeLessThan(400);
      const html = await response.text();

      const titles = tagContents(html, "title");
      expect(titles, `${route} title`).toHaveLength(1);
      expect(titles[0]).toMatch(/NodeTool/i);

      const descriptions = metaValues(html, "name", "description");
      expect(descriptions, `${route} meta description`).toHaveLength(1);

      const canonicals = canonicalHrefs(html);
      expect(canonicals, `${route} canonical`).toHaveLength(1);
      const canonical = new URL(canonicals[0] ?? "");
      expect(canonical.origin, `${route} canonical origin`).toBe(
        "https://nodetool.ai"
      );
      expect(canonical.pathname, `${route} canonical path`).toBe(
        route === "/" ? "/" : route
      );

      for (const property of ["og:title", "og:description", "og:url"]) {
        expect(metaValues(html, "property", property), `${route} ${property}`).toHaveLength(1);
      }
      const ogUrl = new URL(metaValues(html, "property", "og:url")[0] ?? "");
      expect(ogUrl.origin, `${route} og:url origin`).toBe(
        "https://nodetool.ai"
      );
      expect(ogUrl.pathname, `${route} og:url path`).toBe(
        route === "/" ? "/" : route
      );

      const headings = tagContents(html, "h1");
      expect(headings, `${route} h1`).toHaveLength(1);

      const jsonLd = [
        ...html.matchAll(
          /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
        )
      ].map((match) => (match[1] ?? "").trim());
      expect(jsonLd, `${route} JSON-LD blocks`).not.toHaveLength(0);
      for (const block of jsonLd) {
        const parsed: unknown = JSON.parse(block);
        expect(parsed, `${route} JSON-LD object`).toEqual(
          expect.objectContaining({
            "@context": "https://schema.org",
            "@type": expect.any(String),
          })
        );
      }

      for (const mediaPath of mediaPaths(html)) {
        const media = await request.get(mediaPath);
        expect(media.status(), `${route} media ${mediaPath}`).toBe(200);
        const body = await media.body();
        expect(
          body.byteLength,
          `${route} media ${mediaPath} bytes`
        ).toBeGreaterThan(0);
        const extension = mediaPath
          .split(/[?#]/)[0]
          ?.split(".")
          .pop()
          ?.toLowerCase();
        const signature = extension ? MEDIA_MAGIC[extension] : undefined;
        if (signature) {
          expect(
            body.subarray(0, 12).toString("latin1"),
            `${mediaPath} signature`
          ).toContain(signature);
        }
      }
    });
  }
});
