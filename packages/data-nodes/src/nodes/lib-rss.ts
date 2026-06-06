import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import { tagAsServer } from "@nodetool-ai/nodes-utils";

function decodeEntities(value: string): string {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function stripCdata(value: string): string {
  return value.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "");
}

function firstTag(block: string, tagNames: string[]): string {
  for (const tag of tagNames) {
    const rx = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i");
    const m = block.match(rx);
    if (m) return decodeEntities(stripCdata(m[1].trim()));
  }
  return "";
}

function parseDateTime(value: string): Record<string, unknown> {
  const d = value ? new Date(value) : new Date();
  const dt = Number.isNaN(d.getTime()) ? new Date() : d;
  const offsetMin = -dt.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return {
    year: dt.getFullYear(),
    month: dt.getMonth() + 1,
    day: dt.getDate(),
    hour: dt.getHours(),
    minute: dt.getMinutes(),
    second: dt.getSeconds(),
    millisecond: dt.getMilliseconds(),
    tzinfo: dt.toString().match(/\(([^)]+)\)$/)?.[1] ?? "",
    utc_offset: `${sign}${hh}${mm}`
  };
}

function feedLink(block: string): string {
  // RSS 2.0: <link>https://example.com/post</link>
  const textLink = firstTag(block, ["link"]);
  if (textLink) return textLink;
  // Atom: <link href="https://example.com/post" rel="alternate" /> — the URL
  // is in the href attribute, not the element text. Prefer rel="alternate",
  // then a link with no rel, then the first link.
  const linkTags = [...block.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]);
  const preferred =
    linkTags.find((tag) => /rel=["']alternate["']/i.test(tag)) ??
    linkTags.find((tag) => !/\brel=/i.test(tag)) ??
    linkTags[0];
  if (preferred) {
    const href = preferred.match(/\bhref=["']([^"']+)["']/i);
    if (href) return decodeEntities(href[1]);
  }
  // Last resort: Atom <id> often holds the canonical URL.
  return firstTag(block, ["id"]);
}

function feedAuthor(block: string): string {
  const raw = firstTag(block, ["author", "dc:creator"]);
  if (!raw) return "";
  // Atom wraps the author in <author><name>...</name></author>; firstTag
  // returns the inner markup, so extract <name> when present.
  const name = firstTag(raw, ["name"]);
  return name || raw;
}

function parseFeedItems(xml: string): Array<Record<string, unknown>> {
  const blocks = [
    ...xml.matchAll(/<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi)
  ].map((m) => m[2]);
  return blocks.map((block) => {
    const publishedRaw = firstTag(block, ["published", "pubDate", "updated"]);
    return {
      title: firstTag(block, ["title"]),
      link: feedLink(block),
      published: parseDateTime(publishedRaw),
      summary: firstTag(block, ["summary", "description", "content"]),
      author: feedAuthor(block)
    };
  });
}

function feedMetaBlock(xml: string): string {
  const channel = xml.match(/<channel(?:\s[^>]*)?>([\s\S]*?)<\/channel>/i);
  if (channel) return channel[1];
  const feed = xml.match(/<feed(?:\s[^>]*)?>([\s\S]*?)<\/feed>/i);
  if (feed) return feed[1];
  return xml;
}

export class FetchRSSFeedLibNode extends BaseNode {
  static readonly nodeType = "lib.rss.FetchRSSFeed";
  static readonly title = "Fetch RSS Feed";
  static readonly description =
    "Fetches and parses an RSS feed from a URL.\n    rss, feed, network\n\n    Use cases:\n    - Monitor news feeds\n    - Aggregate content from multiple sources\n    - Process blog updates";
  static readonly metadataOutputTypes = {
    title: "str",
    link: "str",
    published: "datetime",
    summary: "str",
    author: "str",
    items: "list"
  };

  static readonly inlineFields = ["url"];
  static readonly inputFields = [];
  @prop({
    type: "str",
    default: "",
    title: "Url",
    description: "URL of the RSS feed to fetch"
  })
  declare url: any;

  async process(): Promise<Record<string, unknown>> {
    const url = String(this.url ?? "");
    const res = await fetch(url);
    const xml = await res.text();
    const results = parseFeedItems(xml);
    return {
      title: results[0]?.title ?? "",
      link: results[0]?.link ?? "",
      published: results[0]?.published ?? {},
      summary: results[0]?.summary ?? "",
      author: results[0]?.author ?? "",
      items: results
    };
  }

  async *genProcess(): AsyncGenerator<Record<string, unknown>> {
    const url = String(this.url ?? "");
    const res = await fetch(url);
    const xml = await res.text();
    const results = parseFeedItems(xml);

    for (const item of results) {
      yield item;
    }

    yield { items: results };
  }
}

export class ExtractFeedMetadataLibNode extends BaseNode {
  static readonly nodeType = "lib.rss.ExtractFeedMetadata";
  static readonly title = "Extract Feed Metadata";
  static readonly description =
    "Extracts metadata from an RSS feed.\n    rss, metadata, feed\n\n    Use cases:\n    - Get feed information\n    - Validate feed details\n    - Extract feed metadata";
  static readonly metadataOutputTypes = {
    output: "dict"
  };
  static readonly inlineFields = ["url"];
  static readonly inputFields = [];

  @prop({
    type: "str",
    default: "",
    title: "Url",
    description: "URL of the RSS feed"
  })
  declare url: any;

  async process(): Promise<Record<string, unknown>> {
    const url = String(this.url ?? "");
    const res = await fetch(url);
    const xml = await res.text();

    const meta = feedMetaBlock(xml);
    const title = firstTag(meta, ["title"]);
    const description = firstTag(meta, ["description", "subtitle"]);
    const link = firstTag(meta, ["link"]);
    const language = firstTag(meta, ["language"]);
    const updated = firstTag(meta, ["updated", "lastBuildDate"]);
    const generator = firstTag(meta, ["generator"]);
    const entryCount = parseFeedItems(xml).length;

    return {
      output: {
        title,
        description,
        link,
        language,
        updated,
        generator,
        entry_count: entryCount
      }
    };
  }
}

export const LIB_RSS_NODES = tagAsServer([
  FetchRSSFeedLibNode,
  ExtractFeedMetadataLibNode
]);
