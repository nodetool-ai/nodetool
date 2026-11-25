---
layout: page
title: "Google Workspace"
permalink: /google-workspace
description: "Connect a Google account so the agent can search Drive, read and send Gmail, edit Docs and Sheets, and manage Calendar."
---

Connect a Google account and the agent can work in your Drive, Gmail, Docs, Sheets and Calendar. You ask in chat, for example "Summarize the unread mail from this week" or "Add tomorrow's shoot to my calendar."

> **Runs:** cloud, on Google's services. **Needs:** a NodeTool account you sign in to, and a Google account. There is no API key to paste.
{: .callout-note}

Google Workspace needs a login, because the connection is stored with your NodeTool account. A desktop install without a login does not show it. A self-hosted server with a login needs a Google OAuth client first. See [Integrations on Your Server](integrations-hosting.md#google-workspace).

## Connect a Google account

1. Open **Settings → Models & providers**. The **Google Workspace** card sits above the provider list and shows **Not connected**.
2. Click **Connect**. Google's consent screen opens.
3. Approve the access NodeTool asks for. Google sends you back, and the card shows **Connected** with your account name.

Signing in with Google and connecting Google Workspace are separate steps. The login asks only who you are. Access to Drive, Gmail, Docs, Sheets and Calendar is granted when you click **Connect**.

## What the agent can do

| App | The agent can |
|---|---|
| Drive | Search files, read a file's details, read a file as text (Docs, Sheets and Slides come back as text or CSV), create a text file in a folder |
| Gmail | Search mail with Gmail search terms such as `from:alice@example.com is:unread newer_than:7d`, read a message, send a plain-text email with cc and bcc, add or remove labels to archive or mark as read |
| Docs | Read a document, create one, append text to the end |
| Sheets | Read a range such as `Sheet1!A1:D50`, append rows, overwrite a range, create a spreadsheet |
| Calendar | List your calendars, list upcoming events, create an event with attendees, delete an event. Your primary calendar unless you name another |

Every Google action, reading included, reaches your real account. In the *Default* [permission mode](global-chat.md#permission-modes), NodeTool asks before each one. In *Auto* it runs them without asking. Workflows can use the same tools through a Code node. See [Categorize Mails](workflows/categorize-mails.md) for an example.

## Things to try

- "Find the latest invoice PDF in my Drive and tell me the total."
- "Draft a reply to Alice's last email and send it after I confirm."
- "Append today's render costs to the Budget sheet."
- "What's on my calendar Thursday? Block 2–4 pm for color grading."

## Disconnect

Click **Disconnect** on the Google Workspace card. NodeTool deletes the stored Google connection and shows "Disconnected Google Workspace. Use Connect to restore access."

This removes the connection from NodeTool only. To revoke access on Google's side as well, remove NodeTool from your Google account's third-party access page.

## Gmail without a Google login

An install with no login cannot connect Google Workspace. A workflow there can still read and sort Gmail with a Google [app password](https://support.google.com/accounts/answer/185833) instead of a sign-in. Google offers app passwords only on accounts with 2-step verification.

1. Create an app password in your Google account.
2. Open **Settings → Models & providers**, find **Google Mail**, and enter your address and the app password.
3. Add a **Gmail Search**, **Add Label** or **Move To Archive** node to a workflow.

Gmail Search takes plain filters (sender, recipient, subject, body, Gmail labels and a date range) and returns the newest matches first. The date range counts from when a message arrived, not from its `Date` header. Put several labels in the Keywords field separated by commas and a message must carry all of them. It does not understand Gmail search terms such as `from:alice is:unread`. Add Label and Move To Archive act on the `message_id` that Gmail Search returns. These nodes read your real mailbox over IMAP and reach only Gmail, not Drive, Docs, Sheets or Calendar. See the [Gmail Search reference](nodes/lib/mail/gmailsearch.md) and the [settings table](environment-variables.md) for `GOOGLE_MAIL_USER` and `GOOGLE_APP_PASSWORD`.

## When something goes wrong

| What you see | What to do |
|---|---|
| The agent says "No Google account connected" | The connection is missing or expired. Click **Connect** again. |
| The Google Workspace card is missing | This install has no login, or the server has Google Workspace turned off. Ask your admin, or see [Integrations on Your Server](integrations-hosting.md#google-workspace). |
| The connection stops working after about an hour | The server is missing its Google OAuth client. See [Integrations on Your Server](integrations-hosting.md#google-workspace). |

The tool names and how to call them from code are in [Integration Tools](developer/integration-tools.md#google-workspace).
