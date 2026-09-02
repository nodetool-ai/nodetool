// Generates marketing/src/data/blogEntries.generated.ts from the Markdown
// posts in marketing/content/blog/.
//
// Regenerate: npm run gen:blog        Verify: npm run gen:blog -- --check
//
// A post is one file: YAML-ish front matter (flat scalars only, no nesting)
// followed by GitHub-flavored Markdown. Two trailing sections are structured
// data rather than prose and are lifted out of the body:
//
//   ## FAQ        — `### question` headings, each followed by its answer
//   ## Read next  — `- [label](/href) — note` bullets
//
// The FAQ becomes FAQPage JSON-LD on the post page, and "Read next" becomes the
// curated links at its foot. Keeping them in the file means a post is written
// in one place, by anyone, without touching TypeScript; the generator is what
// turns a folder of Markdown into typed data the sitemap and pages read.
//
// The generated module is checked in, so the site builds without this script
// and `seo:check` fails a PR that edits a post without regenerating.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MARKETING = path.resolve(__dirname, "..");
const CONTENT_DIR = path.join(MARKETING, "content/blog");
const OUT_FILE = path.join(MARKETING, "src/data/blogEntries.generated.ts");
const PUBLIC_DIR = path.join(MARKETING, "public");

const CHECK = process.argv.includes("--check");

const TAGS = ["Tutorial", "Comparison", "Deep dive", "Guide", "Cost", "Roundup"];
const ACCENTS = ["blue", "violet", "emerald", "rose", "amber", "cyan"];
const FREQUENCIES = ["weekly", "monthly", "yearly"];
const REQUIRED = [
  "title",
  "description",
  "headline",
  "excerpt",
  "tag",
  "date",
  "author",
  "accent",
  "ogImage",
];

function fail(file, message) {
  console.error(`generate-blog-entries: ${file}: ${message}`);
  process.exit(1);
}

/** Flat `key: value` front matter. Values may be double-quoted JSON strings. */
function parseFrontMatter(file, src) {
  const m = src.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) fail(file, "missing front matter block");
  const data = {};
  for (const line of m[1].split("\n")) {
    if (!line.trim() || line.startsWith("#")) continue;
    const kv = line.match(/^([a-zA-Z]+):\s*(.*)$/);
    if (!kv) fail(file, `unparseable front matter line: ${line}`);
    const [, key, raw] = kv;
    data[key] = raw.startsWith('"') ? JSON.parse(raw) : raw.trim();
  }
  return { data, body: m[2] };
}

/** Split the body at its top-level `## ` headings, keeping order. */
function splitSections(body) {
  const lines = body.split("\n");
  const sections = [];
  let current = { heading: null, lines: [] };
  for (const line of lines) {
    const h = line.match(/^## (.+)$/);
    if (h) {
      sections.push(current);
      current = { heading: h[1].trim(), lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  sections.push(current);
  return sections;
}

function parseFaq(file, text) {
  const faqs = [];
  for (const block of text.split(/^### /m).slice(1)) {
    const nl = block.indexOf("\n");
    const question = block.slice(0, nl).trim();
    const answer = block.slice(nl + 1).trim().replace(/\s*\n\s*\n\s*/g, " ").replace(/\n/g, " ");
    if (!question || !answer) fail(file, `FAQ entry without a question or answer: ${question}`);
    faqs.push({ question, answer });
  }
  return faqs;
}

function parseRelated(file, text) {
  const related = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const m = line.match(/^- \[([^\]]+)\]\(([^)]+)\)\s+—\s+(.+)$/);
    if (!m) fail(file, `unparseable "Read next" line: ${line}`);
    related.push({ label: m[1], href: m[2], note: m[3].trim() });
  }
  return related;
}

function parsePost(file) {
  const slug = path.basename(file, ".md");
  const { data, body } = parseFrontMatter(file, fs.readFileSync(file, "utf8"));
  for (const key of REQUIRED) {
    if (!data[key]) fail(file, `front matter is missing "${key}"`);
  }
  if (!TAGS.includes(data.tag)) fail(file, `unknown tag "${data.tag}" (one of ${TAGS.join(", ")})`);
  if (!ACCENTS.includes(data.accent)) fail(file, `unknown accent "${data.accent}"`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date)) fail(file, `date must be YYYY-MM-DD`);
  if (data.updated && !/^\d{4}-\d{2}-\d{2}$/.test(data.updated)) fail(file, `updated must be YYYY-MM-DD`);
  if (!fs.existsSync(path.join(PUBLIC_DIR, data.ogImage))) fail(file, `ogImage "${data.ogImage}" is not in public/`);
  const changeFrequency = data.changeFrequency ?? "monthly";
  if (!FREQUENCIES.includes(changeFrequency)) fail(file, `unknown changeFrequency "${changeFrequency}"`);

  const sections = splitSections(body);
  const faqSection = sections.find((s) => s.heading === "FAQ");
  const relatedSection = sections.find((s) => s.heading === "Read next");
  if (!faqSection) fail(file, 'missing "## FAQ" section');
  if (!relatedSection) fail(file, 'missing "## Read next" section');

  const bodyMd = sections
    .filter((s) => s.heading !== "FAQ" && s.heading !== "Read next")
    .map((s) => (s.heading ? `## ${s.heading}\n${s.lines.join("\n")}` : s.lines.join("\n")))
    .join("\n")
    .trim();
  if (/^# /m.test(bodyMd)) fail(file, "body must start at H2 — the page owns the H1");

  const faqs = parseFaq(file, faqSection.lines.join("\n"));
  const related = parseRelated(file, relatedSection.lines.join("\n"));
  if (faqs.length === 0) fail(file, "FAQ section is empty");
  if (related.length === 0) fail(file, '"Read next" section is empty');

  return {
    route: `/blog/${slug}`,
    title: data.title,
    description: data.description,
    priority: data.priority ? Number(data.priority) : 0.7,
    changeFrequency,
    indexable: data.indexable !== "false",
    slug,
    headline: data.headline,
    excerpt: data.excerpt,
    tag: data.tag,
    date: data.date,
    ...(data.updated ? { updated: data.updated } : {}),
    author: data.author,
    accent: data.accent,
    ogImage: data.ogImage,
    bodyMd,
    faqs,
    related,
  };
}

const files = fs
  .readdirSync(CONTENT_DIR)
  .filter((f) => f.endsWith(".md"))
  .sort();
if (files.length === 0) fail(CONTENT_DIR, "no posts found");

const posts = files.map((f) => parsePost(path.join(CONTENT_DIR, f)));

const seen = new Set();
for (const p of posts) {
  if (seen.has(p.slug)) fail(p.slug, "duplicate slug");
  seen.add(p.slug);
}

const header = `// AUTO-GENERATED by marketing/scripts/generate-blog-entries.mjs — do not edit by hand.
// Source: marketing/content/blog/*.md   Regenerate: npm run gen:blog

import type { BlogPost } from "./blogEntries";

export const generatedBlogPosts: BlogPost[] = `;

const out = `${header}${JSON.stringify(posts, null, 2)};\n`;

if (CHECK) {
  const current = fs.existsSync(OUT_FILE) ? fs.readFileSync(OUT_FILE, "utf8") : "";
  if (current !== out) {
    console.error(
      `generate-blog-entries: ${path.relative(MARKETING, OUT_FILE)} is stale — run npm run gen:blog`,
    );
    process.exit(1);
  }
  console.log(`generate-blog-entries: ${posts.length} posts, generated module up to date`);
} else {
  fs.writeFileSync(OUT_FILE, out);
  console.log(`generate-blog-entries: wrote ${posts.length} posts to ${path.relative(MARKETING, OUT_FILE)}`);
}
