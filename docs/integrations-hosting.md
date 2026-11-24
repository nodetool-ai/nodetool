---
layout: page
title: "Integrations on Your Server"
permalink: /integrations-hosting
description: "Server settings for Google Workspace, the Telegram bridge, and Apify on a self-hosted NodeTool server."
---

Settings an admin sets on a self-hosted NodeTool server so its users can use Google Workspace, the Telegram bot and Apify. Users connect their own accounts and keys afterwards, as described on each integration's page. All variables go in the server's environment. See [Configuration](configuration.md) for the full list and [Self-Hosted](self-hosted-deployment.md) for running the server.

## Google Workspace

User guide: [Google Workspace](google-workspace.md).

Google Workspace uses the Google access token that a Supabase Google login returns, so it needs a server with a login:

| Server | Google Workspace |
|---|---|
| Supabase auth (`SUPABASE_URL` and `SUPABASE_KEY` set) | On |
| Local mode, no login | Off |
| Local server using a hosted Supabase project | Off until you set `NODETOOL_GOOGLE_WORKSPACE=1` |

| Variable | Purpose |
|---|---|
| `NODETOOL_GOOGLE_WORKSPACE` | `1` or `true` turns the integration on, `0` or `false` turns it off. Unset, the server follows its auth mode |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | The OAuth client you set up for the Google provider in Supabase. Supabase does not refresh Google tokens, so without these a user's connection stops working about an hour after they connect |

An SSO (OIDC) login carries no Google token, so Google Workspace stays off on SSO servers. See [Authentication](authentication.md) and [Supabase](supabase-deployment.md).

## Telegram bot

User guide: [Telegram Bot](telegram-bot.md). The server needs `NODETOOL_INTEGRATION_TOKEN`, and the bridge runs as its own process. The steps are in [Run the bridge (self-hosting)](telegram-bot.md#run-the-bridge-self-hosting).

## Apify

User guide: [Apify](apify-integration.md). Each user adds their own Apify token. These variables set which actors the agent may run and how much one run may spend.

| Variable | Default | Purpose |
|---|---|---|
| `NODETOOL_APIFY_MODE` | `discovery` | Which actors may run. See the table below. An unknown value falls back to `discovery` |
| `NODETOOL_APIFY_ALLOWED_ACTORS` | none | Comma-separated actor ids added to the shipped list of actors that run without asking |
| `NODETOOL_APIFY_MAX_RUNS` | 10 | Actor runs per chat turn, workflow run, or Code node run |
| `NODETOOL_APIFY_MAX_ITEMS` | 1000 | Dataset rows returned per run |
| `NODETOOL_APIFY_MAX_RUN_SECONDS` | 300 | Time limit per run |
| `NODETOOL_APIFY_MAX_MEMORY_MB` | 4096 | Memory per run on Apify |
| `NODETOOL_APIFY_MAX_COST_USD` | 5 | Apify spend per chat turn, workflow run, or Code node run |

| Mode | Store search | Which actors run |
|---|---|---|
| `disabled` | Off | None |
| `allowlist` | Shipped list only | The shipped list plus `NODETOOL_APIFY_ALLOWED_ACTORS` |
| `discovery` | Whole store | The allowlist directly, any other actor after the user approves it |
| `unrestricted` | Whole store | Any actor, without asking |

The shipped list is in the user guide under [Actors that run without asking](apify-integration.md#actors-that-run-without-asking). Requests for an actor outside the allowlist in `allowlist` mode are refused with the list of allowed actors.

Before a run starts, NodeTool refuses actor inputs that point at private or internal addresses (loopback, private ranges, cloud metadata). The check does not cover DNS rebinding, since Apify resolves the names. A server reachable from the internet should still not expose internal services by public hostname.
