---
title: "Apify"
description: "Add an Apify token so the agent can crawl sites, scrape search results and maps, and pull social and YouTube data."
---

With an Apify token, the agent can run Apify's ready-made scrapers ("actors") on Apify's machines: crawl a site to text, list businesses from Google Maps, read public Reddit or Instagram posts, or fetch YouTube subtitles. You ask in chat and the agent picks the actor.

> **Runs:** cloud, on Apify. **Needs:** an Apify account and an Apify API token. **Cost:** Apify bills each actor run to your Apify account. NodeTool stops a chat turn after 10 runs or 5 USD of Apify spend.
{: .callout-note}

## Set up

1. Create a token on Apify's [Integrations page](https://console.apify.com/account/integrations).
2. In NodeTool, open **Settings → Models & providers**, find **Apify** under **Web search**, click **Connect**, and paste the token.

If the token is missing, the agent answers "No Apify API token is configured" and names the setting.

## What to ask

- "Crawl example.com, up to 20 pages, and summarize what the company sells."
- "Find coffee roasters in Amsterdam on Google Maps and put name, address, rating and website in a table."
- "Get the subtitles of this YouTube video and pull out the five main points: https://youtu.be/…"
- "What are people on r/videography saying about the new camera this week?"

The agent reads each actor's input form before it runs it. Results come back as a preview table in chat. Screenshots and files the actor produces are saved as assets you can open or keep.

## Actors that run without asking

These actors run as soon as the agent picks them:

| Actor | Use it for |
|---|---|
| `apify/website-content-crawler` | Crawl a site and get each page as Markdown. The agent's default for reading pages |
| `apify/cheerio-scraper` | Fast extraction from plain HTML pages |
| `apify/web-scraper` | Extraction from pages that need a browser to render |
| `apify/playwright-scraper` | Pages that need logins, clicks or scrolling. The most expensive of the four page actors |
| `apify/google-search-scraper` | Google search result pages |
| `compass/google-maps-extractor` | Businesses and places from Google Maps |
| `apify/instagram-scraper` | Public Instagram profiles, posts and comments |
| `trudax/reddit-scraper-lite` | Public Reddit posts and comments |
| `apify/screenshot-url` | Screenshots of a page |
| `streamers/youtube-scraper` | YouTube video details, and subtitles where the video has them |

The agent can also search the Apify Store for other actors. Before it runs one that is not in this table, NodeTool asks you to approve it, the same way it asks before other actions that reach outside services. A server admin can change which actors run without asking. See [Integrations on Your Server](integrations-hosting.md#apify).

## Cost control

Each chat turn, workflow run, or Code node run gets its own Apify budget:

| Limit | Default |
|---|---|
| Actor runs | 10 |
| Rows returned per run | 1000 |
| Run time | 300 seconds |
| Apify spend | 5 USD |

When a limit is reached, the agent stops starting runs and tells you which limit it hit. Each run result reports the runs and spend left in the budget. Prices differ a lot between actors, so ask the agent to check an actor's pricing first when you plan a large crawl.

## When something goes wrong

| What you see | What to do |
|---|---|
| "No Apify API token is configured" | Add the token as in [Set up](#set-up). |
| The run succeeds but returns no rows | The input did not match what the actor expects. Ask the agent to read the actor's input schema and try again. |
| The actor is refused | It is not on your server's allowlist. Approve it when asked, or ask your admin to add it. |
| A run is stopped | Stopping the chat or workflow stops the run on Apify too. |

Scraped pages can contain text aimed at your agent. Treat what an actor returns as data, and check its claims before you act on them.

Calling Apify from Code nodes and the full tool reference are in [Integration Tools](developer/integration-tools.md#apify).
