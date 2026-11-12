#!/usr/bin/env node
/**
 * IndexNow submission for nodetool.ai, run by the marketing deploy job.
 *
 * IndexNow tells Bing, Yandex, Naver, Seznam and Yep that URLs changed, so
 * they recrawl without waiting for the sitemap. Bing's index also backs
 * Copilot and ChatGPT search. The key is public by design: the engines verify
 * ownership by fetching https://nodetool.ai/<key>.txt, which lives in public/.
 *
 *   node scripts/indexnow.mjs snapshot <file>   before deploy: save the live sitemap
 *   node scripts/indexnow.mjs submit <file>     after deploy: submit what changed
 *   node scripts/indexnow.mjs submit <file> --dry-run
 *
 * A URL counts as changed when it is new or its <lastmod> differs. When the
 * key file was not live before the deploy (the first run), every URL in the
 * sitemap is submitted once.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const HOST = "nodetool.ai";
export const KEY = "0934bc8569e9dbc09aceed8f71ec394c";
const SITE = `https://${HOST}`;
const ENDPOINT = "https://api.indexnow.org/indexnow";
/** The protocol accepts at most 10,000 URLs per request. */
const BATCH = 10_000;

/** Parse sitemap XML into { loc: lastmod | null }. */
export function parseSitemap(xml) {
  const urls = {};
  for (const block of xml.match(/<url>[\s\S]*?<\/url>/g) ?? []) {
    const loc = block.match(/<loc>([^<]+)<\/loc>/)?.[1]?.trim();
    if (!loc) continue;
    urls[loc] = block.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1]?.trim() ?? null;
  }
  return urls;
}

/** URLs in `after` that are new or whose lastmod changed since `before`. */
export function changedUrls(before, after) {
  return Object.keys(after).filter(
    (loc) => !(loc in before) || before[loc] !== after[loc]
  );
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { "user-agent": "nodetool-indexnow" } });
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res.text();
}

async function keyIsLive() {
  try {
    return (await fetchText(`${SITE}/${KEY}.txt`)).trim() === KEY;
  } catch {
    return false;
  }
}

async function snapshot(file) {
  const urls = parseSitemap(await fetchText(`${SITE}/sitemap.xml`));
  const keyLive = await keyIsLive();
  writeFileSync(file, JSON.stringify({ keyLive, urls }, null, 2));
  console.log(`snapshot: ${Object.keys(urls).length} URLs, key live: ${keyLive}`);
}

async function submit(file, dryRun) {
  const before = JSON.parse(readFileSync(file, "utf8"));
  const after = parseSitemap(await fetchText(`${SITE}/sitemap.xml`));
  const urlList = before.keyLive ? changedUrls(before.urls, after) : Object.keys(after);
  console.log(`submit: ${urlList.length} of ${Object.keys(after).length} URLs${before.keyLive ? " changed" : " (first run)"}`);
  if (urlList.length === 0) return;
  if (!dryRun && !(await keyIsLive())) {
    throw new Error(`${SITE}/${KEY}.txt is not live; IndexNow would reject the key`);
  }
  for (let i = 0; i < urlList.length; i += BATCH) {
    const batch = urlList.slice(i, i + BATCH);
    if (dryRun) {
      console.log(batch.join("\n"));
      continue;
    }
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `${SITE}/${KEY}.txt`, urlList: batch }),
    });
    // 200 and 202 both mean accepted.
    if (res.status !== 200 && res.status !== 202) {
      throw new Error(`IndexNow returned ${res.status}: ${await res.text()}`);
    }
    console.log(`submitted ${batch.length} URLs (HTTP ${res.status})`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, file] = process.argv.slice(2);
  const dryRun = process.argv.includes("--dry-run");
  const run = command === "snapshot" ? snapshot(file) : command === "submit" ? submit(file, dryRun) : null;
  if (!run || !file) {
    console.error("usage: indexnow.mjs snapshot|submit <file> [--dry-run]");
    process.exit(2);
  }
  run.catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
