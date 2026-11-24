---
title: "SerpAPI"
description: "Add a SerpAPI key so the agent can search Google Scholar, Maps, Shopping, Jobs, Flights, YouTube and other engines."
---

With a SerpAPI key, the agent can search more than plain web results: Google Scholar citations, Google Maps listings with hours and ratings, Shopping prices, job postings, flights, YouTube, Amazon, Bing, Yelp and the app stores. You ask in chat and the agent picks the engine.

> **Runs:** cloud, on SerpAPI. **Needs:** a SerpAPI account and API key. **Cost:** each search uses one search from your SerpAPI plan.
{: .callout-note}

## Set up

1. Copy your key from SerpAPI's [API key page](https://serpapi.com/manage-api-key).
2. In NodeTool, open **Settings → Models & providers**, find **SerpAPI** under **Web search**, click **Connect**, and paste the key.

If the key is missing, the agent answers "No SerpAPI key is configured" and names the setting.

## What to ask

- "Find the most cited papers on diffusion video models since 2023 on Google Scholar."
- "List vegan restaurants near Kreuzberg, Berlin on Google Maps with opening hours and rating."
- "Compare prices for the Sony ZV-E10 on Google Shopping."
- "Find remote motion designer jobs posted this week."
- "How many SerpAPI searches do I have left this month?"

Before it searches an engine it has not used in the chat, the agent looks up that engine's parameters. A wrong parameter is caught before the search runs, so it does not use up a search.

## SerpAPI search and web search

The agent has two ways to search:

| | Web search | SerpAPI search |
|---|---|---|
| What it returns | Titles, links and snippets for a plain web query | The engine's own fields: citation counts, hours, prices, apply links, flight times |
| Which service | The provider picked under **Settings → Integrations → Search provider** (SerpAPI by default, or Brave, DataForSEO, Apify, OpenAI or Gemini) | SerpAPI only |
| Needs | That provider's key | A SerpAPI key |

The agent uses web search for ordinary questions and SerpAPI search when it needs one engine's data. Both read the same SerpAPI key.

## When something goes wrong

| What you see | What to do |
|---|---|
| "No SerpAPI key is configured" | Add the key as in [Set up](#set-up). |
| SerpAPI refuses searches | Your plan may be used up. Ask the agent how many searches are left this month. |
| The agent reports that the engine catalog is unavailable | NodeTool reads the list of engines and their parameters from SerpAPI's website. If that page cannot be read, SerpAPI search stops working until it can. Plain web search still works. |

Calling SerpAPI from Code nodes and the full tool reference are in [Integration Tools](developer/integration-tools.md#serpapi).
