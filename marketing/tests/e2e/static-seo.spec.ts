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

function decodeHtml(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function tagText(html: string, tag: string): string[] {
  return [
    ...html.matchAll(
      new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "gi")
    )
  ]
    .map((match) => decodeHtml(match[1] ?? "").replace(/<[^>]+>/g, "").trim())
    .filter(Boolean);
}

function mediaPaths(html: string): string[] {
  const paths: string[] = [];
  for (const tag of html.matchAll(/<(?:img|video|source)\b[^>]*>/gi)) {
    for (const match of tag[0].matchAll(/\b(?:src|poster)=["']([^"']+)["']/gi)) {
      const value = decodeHtml(match[1] ?? "");
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

      const titles = tagText(html, "title");
      expect(titles, `${route} title`).toHaveLength(1);
      expect(titles[0]).toMatch(/NodeTool/i);

      const headings = tagText(html, "h1");
      expect(headings, `${route} h1`).toHaveLength(1);

      const jsonLd = [
        ...html.matchAll(
          /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
        )
      ].map((match) => decodeHtml(match[1] ?? "").trim());
      for (const block of jsonLd) {
        expect(() => JSON.parse(block), `${route} JSON-LD`).not.toThrow();
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
