import { BaseNode, prop } from "@nodetool/node-sdk";
import * as cheerio from "cheerio";
import { convert } from "html-to-text";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";

export class BaseUrlLibNode extends BaseNode {
  static readonly nodeType = "lib.beautifulsoup.BaseUrl";
            static readonly title = "Base Url";
            static readonly description = "Extract the base URL from a given URL.\n    url parsing, domain extraction, web utilities\n\n    Use cases:\n    - Get domain name from full URLs\n    - Clean up URLs for comparison\n    - Extract root website addresses\n    - Standardize URL formats";
        static readonly metadataOutputTypes = {
    output: "str"
  };
  
  @prop({ type: "str", default: "", title: "URL", description: "The URL to extract the base from" })
  declare url: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const url = String(inputs.url ?? this.url ?? "");
    if (!url) {
      throw new Error("URL must not be empty");
    }
    const parsed = new URL(url);
    return { output: `${parsed.protocol}//${parsed.host}` };
  }
}

export class ExtractLinksLibNode extends BaseNode {
  static readonly nodeType = "lib.beautifulsoup.ExtractLinks";
            static readonly title = "Extract Links";
            static readonly description = "Extract all links from HTML content with type classification.\n    extract, links, urls, web scraping, html\n\n    Use cases:\n    - Analyze website structure and navigation\n    - Discover related content and resources\n    - Build sitemaps and link graphs\n    - Find internal and external references\n    - Collect URLs for further processing";
        static readonly metadataOutputTypes = {
    href: "str",
    text: "str",
    type: "str"
  };
  
          static readonly isStreamingOutput = true;
  @prop({ type: "str", default: "", title: "Html", description: "The HTML content to extract links from." })
  declare html: any;

  @prop({ type: "str", default: "", title: "Base Url", description: "The base URL of the page, used to determine internal/external links." })
  declare base_url: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const html = String(inputs.html ?? this.html ?? "");
    const baseUrl = String(inputs.base_url ?? this.base_url ?? "");
    const $ = cheerio.load(html);
    const rows: string[][] = [];

    $("a[href]").each((_, el) => {
      const href = $(el).attr("href") ?? "";
      const text = $(el).text().trim();
      const linkType =
        href.startsWith(baseUrl) || href.startsWith("/")
          ? "internal"
          : "external";
      rows.push([href, text, linkType]);
    });

    return {
      output: {
        columns: [
          { name: "href", data_type: "string" },
          { name: "text", data_type: "string" },
          { name: "type", data_type: "string" },
        ],
        data: rows,
      },
    };
  }
}

export class ExtractImagesLibNode extends BaseNode {
  static readonly nodeType = "lib.beautifulsoup.ExtractImages";
            static readonly title = "Extract Images";
            static readonly description = "Extract images from HTML content.\n    extract, images, src\n\n    Use cases:\n    - Collect images from web pages\n    - Analyze image usage on websites\n    - Create image galleries";
        static readonly metadataOutputTypes = {
    image: "image"
  };
  
          static readonly isStreamingOutput = true;
  @prop({ type: "str", default: "", title: "Html", description: "The HTML content to extract images from." })
  declare html: any;

  @prop({ type: "str", default: "", title: "Base Url", description: "The base URL of the page, used to resolve relative image URLs." })
  declare base_url: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const html = String(inputs.html ?? this.html ?? "");
    const baseUrl = String(inputs.base_url ?? this.base_url ?? "");
    const $ = cheerio.load(html);
    const images: Array<{ uri: string; type: string }> = [];

    $("img[src]").each((_, el) => {
      const src = $(el).attr("src") ?? "";
      const fullUrl = new URL(src, baseUrl || undefined).href;
      images.push({ uri: fullUrl, type: "image" });
    });

    return { output: images };
  }
}

export class ExtractAudioLibNode extends BaseNode {
  static readonly nodeType = "lib.beautifulsoup.ExtractAudio";
            static readonly title = "Extract Audio";
            static readonly description = "Extract audio elements from HTML content.\n    extract, audio, src\n\n    Use cases:\n    - Collect audio sources from web pages\n    - Analyze audio usage on websites\n    - Create audio playlists";
        static readonly metadataOutputTypes = {
    audio: "audio"
  };
  
          static readonly isStreamingOutput = true;
  @prop({ type: "str", default: "", title: "Html", description: "The HTML content to extract audio from." })
  declare html: any;

  @prop({ type: "str", default: "", title: "Base Url", description: "The base URL of the page, used to resolve relative audio URLs." })
  declare base_url: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const html = String(inputs.html ?? this.html ?? "");
    const baseUrl = String(inputs.base_url ?? this.base_url ?? "");
    const $ = cheerio.load(html);
    const audioList: Array<{ uri: string; type: string }> = [];

    $("audio, audio source").each((_, el) => {
      const src = $(el).attr("src");
      if (src) {
        const fullUrl = new URL(src, baseUrl || undefined).href;
        audioList.push({ uri: fullUrl, type: "audio" });
      }
    });

    return { output: audioList };
  }
}

export class ExtractVideosLibNode extends BaseNode {
  static readonly nodeType = "lib.beautifulsoup.ExtractVideos";
            static readonly title = "Extract Videos";
            static readonly description = "Extract videos from HTML content.\n    extract, videos, src\n\n    Use cases:\n    - Collect video sources from web pages\n    - Analyze video usage on websites\n    - Create video playlists";
        static readonly metadataOutputTypes = {
    video: "video"
  };
  
          static readonly isStreamingOutput = true;
  @prop({ type: "str", default: "", title: "Html", description: "The HTML content to extract videos from." })
  declare html: any;

  @prop({ type: "str", default: "", title: "Base Url", description: "The base URL of the page, used to resolve relative video URLs." })
  declare base_url: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const html = String(inputs.html ?? this.html ?? "");
    const baseUrl = String(inputs.base_url ?? this.base_url ?? "");
    const $ = cheerio.load(html);
    const videos: Array<{ uri: string; type: string }> = [];

    $("video, video source, iframe").each((_, el) => {
      const src = $(el).attr("src");
      if (src) {
        const fullUrl = new URL(src, baseUrl || undefined).href;
        videos.push({ uri: fullUrl, type: "video" });
      }
    });

    return { output: videos };
  }
}

export class ExtractMetadataLibNode extends BaseNode {
  static readonly nodeType = "lib.beautifulsoup.ExtractMetadata";
            static readonly title = "Extract Metadata";
            static readonly description = "Extract metadata from HTML content.\n    extract, metadata, seo\n\n    Use cases:\n    - Analyze SEO elements\n    - Gather page information\n    - Extract structured data";
        static readonly metadataOutputTypes = {
    title: "str",
    description: "str",
    keywords: "str"
  };
  
  @prop({ type: "str", default: "", title: "Html", description: "The HTML content to extract metadata from." })
  declare html: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const html = String(inputs.html ?? this.html ?? "");
    const $ = cheerio.load(html);

    const title = $("title").first().text() || null;
    const description =
      $('meta[name="description"]').attr("content") ?? null;
    const keywords =
      $('meta[name="keywords"]').attr("content") ?? null;

    return { title, description, keywords };
  }
}

export class HTMLToTextLibNode extends BaseNode {
  static readonly nodeType = "lib.beautifulsoup.HTMLToText";
            static readonly title = "Convert HTML to Text";
            static readonly description = "Converts HTML to plain text by removing tags and decoding entities using BeautifulSoup.\n    html, text, convert\n\n    Use cases:\n    - Cleaning HTML content for text analysis\n    - Extracting readable content from web pages\n    - Preparing HTML data for natural language processing";
        static readonly metadataOutputTypes = {
    output: "str"
  };
  
  @prop({ type: "str", default: "", title: "HTML" })
  declare text: any;

  @prop({ type: "bool", default: true, title: "Preserve Line Breaks", description: "Convert block-level elements to newlines" })
  declare preserve_linebreaks: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const html = String(inputs.text ?? this.text ?? "");
    const preserveLinebreaks = Boolean(
      inputs.preserve_linebreaks ?? this.preserve_linebreaks ?? true
    );

    const text = convert(html, {
      wordwrap: preserveLinebreaks ? 130 : false,
      preserveNewlines: preserveLinebreaks,
    });

    return { output: text };
  }
}

export class WebsiteContentExtractorLibNode extends BaseNode {
  static readonly nodeType = "lib.beautifulsoup.WebsiteContentExtractor";
            static readonly title = "Website Content Extractor";
            static readonly description = "Extract main content from a website, removing navigation, ads, and other non-essential elements.\n    scrape, web scraping, content extraction, text analysis\n\n    Use cases:\n    - Clean web content for further analysis\n    - Extract article text from news websites\n    - Prepare web content for summarization";
        static readonly metadataOutputTypes = {
    output: "str"
  };
  
  @prop({ type: "str", default: "", title: "Html Content", description: "The raw HTML content of the website." })
  declare html_content: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const htmlContent = String(
      inputs.html_content ?? this.html_content ?? ""
    );

    const dom = new JSDOM(htmlContent);
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (article) {
      return { output: (article.textContent ?? "").replace(/\s+/g, " ").trim() };
    }

    // Fallback: strip tags manually like the Python version
    const $ = cheerio.load(htmlContent);
    $("script, style, nav, sidebar, footer, header").remove();

    const main =
      $("article").first().text() ||
      $("main").first().text() ||
      $('[id*="content"]').first().text() ||
      $('[class*="content"]').first().text() ||
      $("body").text();

    return { output: (main || "No main content found").replace(/\s+/g, " ").trim() };
  }
}

export const LIB_BEAUTIFULSOUP_NODES = [
  BaseUrlLibNode,
  ExtractLinksLibNode,
  ExtractImagesLibNode,
  ExtractAudioLibNode,
  ExtractVideosLibNode,
  ExtractMetadataLibNode,
  HTMLToTextLibNode,
  WebsiteContentExtractorLibNode,
] as const;
