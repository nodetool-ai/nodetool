import { BaseNode, prop } from "@nodetool/node-sdk";

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

function parseFeedItems(xml: string): Array<Record<string, unknown>> {
  const blocks = [
    ...xml.matchAll(/<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi)
  ].map((m) => m[2]);
  return blocks.map((block) => {
    const publishedRaw = firstTag(block, ["published", "pubDate", "updated"]);
    return {
      title: firstTag(block, ["title"]),
      link: firstTag(block, ["link", "id"]),
      published: parseDateTime(publishedRaw),
      summary: firstTag(block, ["summary", "description", "content"]),
      author: firstTag(block, ["author", "dc:creator"])
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
    author: "str"
  };
  static readonly exposeAsTool = true;

  static readonly isStreamingOutput = true;
  @prop({
    type: "str",
    default: "",
    title: "Url",
    description: "URL of the RSS feed to fetch"
  })
  declare url: any;

  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async *genProcess(): AsyncGenerator<Record<string, unknown>> {
    const url = String(this.url ?? "");
    const res = await fetch(url);
    const xml = await res.text();
    for (const item of parseFeedItems(xml)) {
      yield item;
    }
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

export const LIB_RSS_NODES = [
  FetchRSSFeedLibNode,
  ExtractFeedMetadataLibNode
] as const;
