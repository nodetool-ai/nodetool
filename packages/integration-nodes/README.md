# @nodetool-ai/integration-nodes

External-API integration nodes for [NodeTool](https://nodetool.ai).

Connect visual AI workflows to the outside world: HTTP and GraphQL requests, AWS
S3, Supabase, Notion, Twilio, email, Discord and Telegram, Google search via
SerpApi, Apify web scrapers, and ComfyUI workflows.

## Install

```bash
npm install @nodetool-ai/integration-nodes
```

## Nodes

**HTTP** (`lib.http.*`) — `GetText`, `GetJSON`, `GetBytes`, `Post`, `Put`,
`Patch`, `Delete`.

**GraphQL** (`lib.graphql.*`) — `Query`, `QueryWithAuth`, `Introspection`,
`BatchQuery`.

**S3** (`lib.s3.*`) — `ListBuckets`, `ListObjects`, `GetObject`, `PutObject`,
`DeleteObject`, `CopyObject`, `GetPresignedUrl`.

**Supabase** (`lib.supabase.*`) — `Select`, `Insert`, `Update`, `Delete`,
`Upsert`, `RPC`.

**Notion** (`lib.notion.*`) — `Search`, `GetPage`, `GetPageContent`,
`CreatePage`, `UpdatePage`, `QueryDatabase`.

**Twilio** (`lib.twilio.*`) — `SendSMS`, `SendWhatsApp`, `GetMessages`,
`Lookup`.

**Mail** (`lib.mail.*`) — `SendEmail`, `GmailSearch`, `AddLabel`,
`MoveToArchive`.

**Google Workspace** (`lib.google.*`) — `DriveSearch`, `DriveReadFile`,
`DriveCreateFile`, `GmailSearch`, `GmailSend`, `GmailModifyLabels`, `DocsRead`,
`DocsCreate`, `DocsAppend`, `SheetsRead`, `SheetsAppend`, `SheetsUpdate`,
`CalendarListEvents`, `CalendarCreateEvent`. These take no API key — they use
the access token from the user's Google sign-in, so they appear only on servers
that have a login (see Configuration below).

**Messaging** (`messaging.*`) — Discord and Telegram bot triggers and senders:
`discord.DiscordBotTrigger`, `discord.DiscordSendMessage`,
`telegram.TelegramBotTrigger`, `telegram.TelegramSendMessage`.

**Search** (`search.google.*`) — SerpApi-backed Google search:
`GoogleSearch`, `GoogleNews`, `GoogleImages`, `GoogleFinance`, `GoogleJobs`,
`GoogleLens`, `GoogleMaps`, `GoogleShopping`.

**Apify** (`apify.scraping.*`) — `ApifyWebScraper`,
`ApifyGoogleSearchScraper`, `ApifyInstagramScraper`, `ApifyAmazonScraper`,
`ApifyYouTubeScraper`, `ApifyTwitterScraper`, `ApifyLinkedInScraper`.

**Other** — `lib.comfy.RunWorkflow`, `lib.comfy.RunWorkflowOnWorker`,
`kie.dynamic_schema.KieAI`, `lib.secret.GetSecret`.

## Configuration

Set the keys for the services you use in NodeTool's secret store (Settings → API
Keys) or as environment variables:

- S3: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
- Supabase: `SUPABASE_URL`, `SUPABASE_KEY`
- Notion: `NOTION_API_KEY`
- Twilio: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`
- Mail: `GOOGLE_APP_PASSWORD`
- Search: `SERPAPI_API_KEY`
- Apify: `APIFY_API_TOKEN`
- KIE: `KIE_API_KEY`
- Discord: `DISCORD_BOT_TOKEN`
- Telegram: `TELEGRAM_BOT_TOKEN`

The `lib.google.*` nodes are the exception: they authenticate with the Google
token from the Supabase Google login, which the web app posts to
`POST /api/oauth/google/session`. They are hidden when the server runs without a
login (Local mode); set `NODETOOL_GOOGLE_WORKSPACE=1` to force them on, and
`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` so the server can refresh the
one-hour Google access token.

## Links

- [NodeTool](https://nodetool.ai)
- [GitHub](https://github.com/nodetool-ai/nodetool)
