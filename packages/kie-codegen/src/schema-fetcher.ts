import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const DEFAULT_LLMS_URL = "https://docs.kie.ai/llms.txt";

export interface KieDocsEntry {
  category: string;
  title: string;
  url: string;
  summary: string;
}

export class KieSchemaFetcher {
  private readonly cacheDir: string;
  private readonly llmsUrl: string;

  constructor(cacheDir = join(process.cwd(), ".codegen-cache"), llmsUrl = DEFAULT_LLMS_URL) {
    this.cacheDir = cacheDir;
    this.llmsUrl = llmsUrl;
  }

  private cachePath(key: string): string {
    const hash = createHash("sha256").update(key).digest("hex").slice(0, 16);
    return join(this.cacheDir, `${hash}.md`);
  }

  private async fetchText(url: string, useCache: boolean): Promise<string> {
    const path = this.cachePath(url);
    if (useCache) {
      try {
        return await readFile(path, "utf8");
      } catch {
        // Cache miss.
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    let response: Response;
    try {
      response = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }
    const text = await response.text();
    await mkdir(this.cacheDir, { recursive: true });
    await writeFile(path, text, "utf8");
    return text;
  }

  async fetchLlms(useCache = true): Promise<string> {
    return this.fetchText(this.llmsUrl, useCache);
  }

  async fetchDocsPage(url: string, useCache = true): Promise<string> {
    return this.fetchText(url, useCache);
  }

  parseLlmsEntries(text: string): KieDocsEntry[] {
    const entries: KieDocsEntry[] = [];
    let inApiDocs = false;
    for (const line of text.split(/\r?\n/)) {
      if (line.trim() === "## API Docs") {
        inApiDocs = true;
        continue;
      }
      if (inApiDocs && line.startsWith("## ")) {
        break;
      }
      if (!inApiDocs || line.includes("docs.kie.ai/cn/")) {
        continue;
      }

      const match = line.match(/^- (.+?) \[(.+?)\]\((https:\/\/docs\.kie\.ai\/[^)]+\.md)\):\s*(.*)$/);
      if (!match) {
        continue;
      }
      entries.push({
        category: match[1].trim(),
        title: match[2].trim(),
        url: match[3].trim(),
        summary: match[4].trim()
      });
    }
    return entries;
  }
}
