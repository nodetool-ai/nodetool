---
layout: page
title: "Google Workspace and Email"
permalink: /google-workspace
description: "Connect a Google account so agents and Code nodes can use Drive, Gmail, Docs, Sheets and Calendar, or read Gmail over IMAP with an app password."
---

NodeTool reaches Gmail in two separate ways. The **Google Workspace** integration signs in with your Google account and gives agents 20 tools for Drive, Gmail, Docs, Sheets and Calendar. The **email tools** read a Gmail mailbox over IMAP with an app password and work on any install, including a local one.

| | Google Workspace | Email tools |
|---|---|---|
| Tools | 20 (`google_*` and `gmail_*`) | 3 (`search_email`, `archive_email`, `add_label_to_email`) |
| Credential | Google sign-in with OAuth scopes | Gmail address and app password |
| Available on | Installs with a login, or when forced on | Every install |
| Set up in | Settings, Models & providers | Settings, Models & providers, Services & Advanced |

## Which installs have Google Workspace

The integration authenticates with the Google access token that a Supabase Google login returns. There is no API key to paste. A local install has no login, so the tools and the connect card are hidden there.

| Install | Google Workspace |
|---|---|
| Supabase auth mode (hosted, or a server with `SUPABASE_URL` and `SUPABASE_KEY` set) | On |
| Local mode, no login | Off |
| Local server pointed at a hosted Supabase project | Off until you set `NODETOOL_GOOGLE_WORKSPACE=1` |

`NODETOOL_GOOGLE_WORKSPACE` accepts `1` or `true` to force the integration on and `0` or `false` to force it off. When it is unset, the server follows its auth mode. See [Configuration](configuration.md) and [Authentication](authentication.md).

A server that runs the integration also needs `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, the same OAuth client you configured for the Google provider in Supabase. Supabase does not refresh Google tokens, so without these the connection stops working about an hour after you connect.

## Connect a Google account

1. Open **Settings** and go to **Models & providers**.
2. Find the **Google Workspace** card at the top. It shows a **Not connected** chip.
3. Click **Connect**. NodeTool sends you to Google's consent screen.
4. Approve the requested access. Google returns you to NodeTool, and the card shows **Connected** with the account name.

Connecting is a separate step from signing in. Gmail and Drive are restricted Google scopes, so the login screen asks for identity only. You grant Workspace access when you click **Connect**.

The consent screen requests these scopes:

| Scope | Used for |
|---|---|
| `drive` | Drive search, read, and file creation |
| `gmail.modify` | Reading Gmail, changing labels |
| `gmail.send` | Sending email |
| `documents` | Google Docs |
| `spreadsheets` | Google Sheets |
| `calendar` | Google Calendar |

The server stores the token as an OAuth credential for your account, one per Google account. Token status routes return metadata only and never the token itself.

If a tool reports `No Google account connected`, the credential is missing or has expired. Click **Connect** again.

## What agents can do

The tools are available to the chat agent and to the MCP agent tools on servers where the integration is on. Code nodes and code actions call them as functions of the `google` module, for example `gmail_search` from `@nodetool-ai/sandbox-nodetool/google`. See [Categorize Mails](workflows/categorize-mails.md) for a workflow that does this.

Every tool belongs to the `external` permission category because each one acts on a third-party service. A failure comes back as an `error` result, not a thrown exception, so an agent can reconnect or try another file and continue.

### Tool list

| Tool | What it does |
|---|---|
| `google_drive_search` | Search Drive with a plain phrase or Drive query syntax. Up to 100 files |
| `google_drive_get_file` | Get name, MIME type, size, owners and link for a file |
| `google_drive_read_file` | Read a file as text. Docs, Sheets and Slides export to plain text or CSV |
| `google_drive_create_file` | Create a text file, optionally in a folder (default is the My Drive root) |
| `gmail_search` | Search with Gmail query syntax such as `from:alice@example.com is:unread newer_than:7d`. Up to 50 messages with subject, sender, date and body |
| `gmail_get_message` | Fetch one message by id |
| `gmail_send_message` | Send a plain-text email with `to`, `subject`, `body`, optional `cc` and `bcc` |
| `gmail_modify_labels` | Add or remove labels on a message. Remove `INBOX` to archive and `UNREAD` to mark read |
| `gmail_list_labels` | List label ids and names |
| `google_docs_read` | Read a document's title and text |
| `google_docs_create` | Create a document, optionally with starting text. Returns the id and URL |
| `google_docs_append` | Append text to the end of a document |
| `google_sheets_read` | Read an A1 range such as `Sheet1!A1:D50` |
| `google_sheets_append` | Append rows below the last populated row of a range |
| `google_sheets_update` | Overwrite a range with new values |
| `google_sheets_create` | Create a spreadsheet, optionally seeded with rows from A1. Returns the id and URL |
| `google_calendar_list_calendars` | List calendar ids and names |
| `google_calendar_list_events` | List events in a time window, soonest first. Times are RFC3339 and the start defaults to now. Up to 250 events |
| `google_calendar_create_event` | Create an event with a summary, start, end, and optional description, location and attendees |
| `google_calendar_delete_event` | Delete an event by id |

Calendar tools use your primary calendar unless you pass a `calendar_id`.

## Email tools over IMAP

The email tools do not use the Google sign-in. They log in to `imap.gmail.com` on port 993 with a Gmail address and an app password, so they work on a local install with no login.

To set them up:

1. Turn on 2-step verification for the Google account, then create an [app password](https://support.google.com/accounts/answer/185833).
2. Open **Settings**, go to **Models & providers**, and open the **Google Mail** entry in the **Services & Advanced** section.
3. Enter the address in **Email address** and the password in **App password**.

You can also set `GOOGLE_MAIL_USER` and `GOOGLE_APP_PASSWORD` as environment variables. The stored value is read first. Both are required.

| Tool | Parameters | What it does |
|---|---|---|
| `search_email` | `subject`, `text`, `since_hours_ago` (default 6), `max_results` (default 50) | Search the inbox, newest first. Returns `message_id`, `subject`, `sender` and `body` |
| `archive_email` | `message_ids` | Move messages to `[Gmail]/All Mail`, which removes them from the inbox |
| `add_label_to_email` | `message_id`, `label` | Add a label to a message |

The `message_id` values these tools return are IMAP UIDs. They are not the message ids that `gmail_*` tools use, so do not pass one to the other.

## Disconnect

Click **Disconnect** on the Google Workspace card. NodeTool deletes your stored Google credentials from the server and shows "Disconnected Google Workspace. Use Connect to restore access." The Google tools then return `No Google account connected` until you connect again.

Disconnecting removes the credential on the NodeTool server only. To revoke the grant on Google's side, remove NodeTool from your Google account's third-party access page.

For the HTTP routes behind the card (`/api/oauth/google/*`) see [API Reference](api-reference.md).
