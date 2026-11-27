---
layout: page
title: "Triggers"
description: "Run a workflow at set times, at a fixed interval, when a file changes, when a webhook arrives, when new mail arrives, or by hand."
---

Each trigger starts a workflow automatically in the background when its event happens. The editor does not need to be open. Add the node, save the workflow, then click the bolt button in the floating toolbar and turn on **Workflow active**.

| Node | Fires when |
|---|---|
| Schedule Trigger | A cron expression matches, in a timezone you choose |
| Interval Trigger | A fixed number of seconds passes |
| File Watch Trigger | A file or folder changes on the server |
| Webhook Trigger | An HTTP request reaches `/api/webhooks/{token}` |
| Email Trigger | New mail arrives in a Gmail folder |
| Manual Trigger | You click **Fire now**, or something calls the [API](api-reference.md) |

---

## What a trigger is

Saving the workflow records each trigger node. NodeTool tracks whether the trigger is on, when it last fired, the last error, and how many runs it has started. Saving never turns a trigger on. A new trigger starts off, and an existing one keeps the state you last set.

When an event arrives, the server starts a separate run and gives the event to the trigger node, which passes it to the nodes on its outputs. Triggered runs happen in the background and appear in your run history like any other job.

A triggered run also receives three parameters. An Input node with a matching name picks them up, and a workflow without such nodes ignores them.

| Parameter | Value |
|-----------|-------|
| `last_fired_at` | When this trigger last fired, or null |
| `now` | The time the run started, as a timestamp |
| `is_first_run` | True until one run has completed successfully |

## Trigger nodes

Schedule, interval, file watch, webhook, email, and manual triggers start runs. The Wait node is not a trigger. It is listed here because it sits in the same node group. The Discord and Telegram bot trigger nodes are not in the table above either. They listen only while a workflow that contains them is running, and you cannot arm them to start runs in the background.

### Schedule Trigger

Fires at clock times, such as every weekday at 08:00 Berlin time.

| Setting | Default | What it does |
|---------|---------|--------------|
| Cron Expression | `0 8 * * 1-5` | Five fields: minute, hour, day of month, month, day of week |
| Timezone | `UTC` | The IANA timezone the expression is read in, such as `Europe/Berlin` or `America/New_York` |
| Max Events | 0 | Applies only when the node runs inside the editor. The scheduler ignores it |

Outputs: `scheduled_at` (the slot this run is for, as a UTC timestamp), `timestamp` (when the run started), `source`, `event_type`.

| Expression | Fires |
|------------|-------|
| `0 8 * * 1-5` | Every weekday at 08:00 |
| `*/15 * * * *` | Every 15 minutes |
| `30 18 1 * *` | On the 1st of each month at 18:30 |
| `0 9,17 * * 1` | Mondays at 09:00 and 17:00 |

Fields accept numbers, lists (`1,15`), ranges (`1-5`), steps (`*/10`), and month and weekday names (`MON-FRI`). When both day of month and day of week are set, either one matching is enough, as in standard cron. Six-field expressions with seconds and `@daily` style shortcuts are not accepted.

An expression or timezone that cannot schedule anything is rejected. `nodetool validate` and the check before a run report it on the node. A save that contains one leaves the trigger off and shows `Schedule not armed: ...` as the **Last error**. Arming it fails with the same message.

The scheduler reads the expression on the wall clock of the timezone, so 08:00 stays 08:00 when daylight saving time starts or ends.

| Situation | What happens |
|-----------|--------------|
| The time does not exist (clocks jump forward) | Fires at the first instant after the gap. `30 2 * * *` fires at 03:00 on the night 02:00 is skipped |
| The time occurs twice (clocks go back) | Fires once, on its first occurrence |
| The server was stopped through one or more slots | Fires once when it is back, then continues from the next slot. Missed slots do not repeat |
| You arm the trigger or change its expression | Counting starts then. A slot that passed earlier does not fire |

The scheduler checks for due triggers every 5 seconds, so a run starts within a few seconds of the slot. Inside the editor, the node waits for each upcoming slot and emits one event for it. It does not emit on start.

### Interval Trigger

| Setting | Default | What it does |
|---------|---------|--------------|
| Interval Seconds | 60 | Seconds between runs |
| Initial Delay Seconds | 0 | Delay before the first run |
| Emit On Start | On | When on, the first run is due as soon as the trigger is armed after the initial delay. When off, the first run waits one full interval |
| Max Events | 0 | Applies only when the node runs inside the editor. The scheduler ignores it |
| Include Drift Compensation | On | Keeps the spacing even when a run takes time. Applies only when the node runs inside the editor. Armed triggers ignore it |

Outputs: `tick`, `elapsed_seconds`, `interval_seconds`, `timestamp`, `source`, `event_type`.

The server schedules each run from the previous one, so a slow or stopped server shifts the next run instead of catching up on missed ones. The scheduler checks for due triggers every 5 seconds, so timing is accurate to a few seconds, not to the millisecond. An interval has no fixed clock times. To run at 09:00 every day, use a [Schedule Trigger](#schedule-trigger).

### File Watch Trigger

Fires when a file or folder changes.

| Setting | Default | What it does |
|---------|---------|--------------|
| Path | `.` | File or folder to watch. A relative path is read from the folder the server was started in, so use a full path |
| Recursive | Off | Also watch subfolders |
| Patterns | `*` | File names to include, such as `*.csv`. Matching uses the file name only. `*` matches any run of characters and `?` matches one character |
| Ignore Patterns | none | File names to skip. These are checked before Patterns |
| Events | created, modified, deleted, moved | Which event types start a run |
| Debounce Seconds | 0.5 | Waits briefly to avoid running twice on rapid file saves. A repeat event for the same file inside this window is ignored |
| Max Events | 0 | Applies only when the node runs inside the editor |

Outputs: `event`, `path`, `dest_path` (the new location of a moved file), `is_directory`, `timestamp`.

The server watches the path on its own machine, so the folder must exist there. If the path does not exist, the trigger stays quiet and the popover shows `Watch path does not exist`. The server's file watcher reports `created`, `modified`, and `deleted`. It does not report `moved` events, and `dest_path` is empty. The server does not see changes made while it is not running.

### Webhook Trigger

Fires when an HTTP request arrives at the trigger's URL. The node has no settings. Saving the workflow creates the URL token and a shared secret, and the popover shows both. They stay the same across later saves.

Outputs: `body`, `headers`, `query`, `method`, `path`, `timestamp`, `source`, `event_type`. See [Calling a webhook](#calling-a-webhook).

### Email Trigger

Fires when new mail arrives in a Gmail folder. It reads the folder over IMAP with a Google [app password](google-workspace.md#gmail-without-a-google-login), so it works on an install with no Google sign-in. Enter `GOOGLE_MAIL_USER` and `GOOGLE_APP_PASSWORD` in **Settings → Models & providers**. Only `imap.gmail.com` is supported.

| Setting | Default | What it does |
|---------|---------|--------------|
| Folder | `INBOX` | The folder to watch |
| From Address | empty | Only mail from this sender starts a run |
| Subject | empty | Only mail whose subject contains this text starts a run |
| Poll Interval Seconds | 60 | Seconds between checks. At least 30, because Gmail limits how often an account may log in |
| Max Messages Per Check | 10 | Most runs one check starts. Mail beyond that waits for the next check, so nothing is skipped |

Outputs: `email` (the whole message as a dict), `message_id`, `subject`, `sender`, `date`, `body`, `source`, `event_type`. The body is decoded to plain text and cut at 10,000 characters. Attachments are not passed on.

The server checks the folder on the same schedule as an interval trigger and starts one run for each new message. A check that finds nothing starts no run. The server remembers where the last check stopped, so a restart neither runs the workflow again for old mail nor skips mail that arrived while the server was down.

- **The first check starts no run.** It records where the folder ends, so arming the trigger does not run the workflow once for every message already there. Only mail that arrives after that starts a run.
- **A paused trigger catches up.** Turning the trigger off and on again starts runs for the mail that arrived while it was off, up to **Max Messages Per Check** at a time. To skip that mail, change a setting and save, which clears the position and takes a new baseline.
- **Changing a setting starts over.** Saving the workflow with a different folder, sender, subject, or interval clears the position. Mail that arrived between the last check and the save does not start a run.
- **Last fired shows the last check.** The popover time is when the server last looked at the folder, whether or not it found mail.
- **A failed check counts as a failure.** A wrong app password or a network error shows as `Poll failed: ...` in **Last error**. After 5 failed checks in a row the trigger stops. See [Automatic disarm](#automatic-disarm).
- **Gmail renumbers a folder rarely.** When it does, the trigger takes a new baseline and mail that arrived during the change does not start a run.

Treat the message as untrusted input. Anyone can send you mail, so do not hand `body` to an agent that has tools with side effects unless you want strangers to steer it.

To reply, add a **Send Email** node. It sends through `smtp.gmail.com` with the same app password.

### Manual Trigger

Fires only when you click **Fire now** in the trigger popover, or when something calls the [API](api-reference.md) to fire it.

| Setting | Default | What it does |
|---------|---------|--------------|
| Name | `manual_trigger` | Emitted on the `source` output |
| Max Events | 0 | Applies only while the node listens in a running workflow |
| Timeout Seconds | empty | Applies only while the node listens in a running workflow |

Outputs: `data`, `timestamp`, `source`, `event_type`.

### Wait

Pauses a workflow for a fixed delay and passes its input through unchanged. It is a normal node, not a trigger, so it has no popover entry and starts no runs.

| Setting | Default | What it does |
|---------|---------|--------------|
| Timeout Seconds | 0 | Seconds to wait. 0 means no wait |
| Input | empty | Value to pass through |

Outputs: `data`, `resumed_at`, `waited_seconds`.

## Add a trigger and arm it

1. Open the workflow and add a trigger node from the node menu.
2. Set its properties and connect its outputs to the rest of the graph.
3. Save the workflow. The server only knows about a trigger after a save, and a changed setting takes effect only after the next save.
4. Click the bolt button in the floating toolbar. It appears only when the graph contains at least one trigger node.
5. Turn on **Workflow active** to arm every trigger, or turn on **Enabled** for one trigger.

Until you save, the switch is off and the popover says to save the workflow first.

Removing a trigger node and saving deletes the trigger, including a webhook's token and secret. Adding the node again creates new ones.

The toolbar button reads **Triggers: active**, **partly active**, or **inactive** to screen readers, with the extra note `last run failed` or `disabled automatically` when that applies. In the popover, the header badge shows the same state:

| Badge | Meaning |
|-------|---------|
| Active | Every trigger in the workflow is armed |
| Partly active | Some are armed. Turning on **Workflow active** arms the rest |
| Inactive | None are armed |
| Not registered | The workflow has no saved triggers yet |
| Unavailable | The status could not be loaded. Check the connection to the server |

## The bolt badge

A bolt appears next to a workflow's name in the workflow list when that workflow has an armed trigger or a trigger that stopped by itself. Hover it for the explanation.

| Bolt | Tooltip | Meaning |
|------|---------|---------|
| Green | `Trigger armed` or `<n> triggers armed` | Listening, and the last run did not fail |
| Red | `Trigger armed, last run failed: ...` | Armed, but the most recent run ended in an error |
| Red | `Disabled after 5 consecutive failures.`, or an expiry or run-limit message | The server turned the trigger off |

A workflow with no armed or stopped triggers shows no bolt.

### Automatic disarm

The server disarms a trigger by itself in three cases.

- **Failures.** After 5 failed runs in a row, the trigger turns off. A successful run resets the count.
- **Expiry.** A trigger with an expiry time turns off once that time passes.
- **Run limit.** A trigger with a maximum number of runs turns off after it reaches that number of successful runs.

Neither the expiry nor the run limit can be set from the editor.

A trigger that was disarmed this way shows **Stopped** in the popover with the reason and the line `Turn it back on to retry.` Fix the cause in the workflow, save, and turn the trigger on. That clears the failure count and the reason. If the cause is not fixed, it stops again after 5 more failures.

## The trigger popover

Click the bolt button in the toolbar to open it. It lists one block for each trigger node, labeled **Webhook**, **Schedule**, **File watch**, or **Manual**.

| Item | What it shows |
|------|---------------|
| Status badge | **Active**, **Inactive**, or **Stopped** (disarmed by the server) |
| **Enabled** | Arms or disarms this one trigger |
| Schedule line | For an interval trigger, `Runs every 5m — next in 4m`. For a schedule trigger, `Cron 0 8 * * 1-5 (Europe/Berlin) — next in 14h 5m`. `due now` means the next run is waiting for the scheduler's next check. A schedule trigger that is off shows no next run |
| Last fired | The local date and time of the last event, or `Never` |
| Stopped reason | Why the server disarmed the trigger |
| Last error | The message from the most recent failure. A later successful run clears it |
| Webhook URL and secret | Webhook triggers only. Each has a copy button, and the secret is hidden until you click the eye button |
| **Fire now** | Starts one run immediately. Disabled until the trigger is armed |

An error in the toggle or in **Fire now** appears as a notification, for example `Could not fire trigger: Trigger is not active`.

**Fire now** sends an empty event payload. To test a webhook with real data, send a request to its URL.

## Calling a webhook

Copy the **Webhook URL** and the secret from the popover. The URL has the form `/api/webhooks/{token}` on your server. Send the secret in the `x-webhook-secret` header.

```bash
curl -X POST "http://localhost:7777/api/webhooks/YOUR_TOKEN" \
  -H "x-webhook-secret: YOUR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"order_id": 41, "status": "paid"}'
```

```json
{
  "status": "accepted",
  "input_id": "webhook:YOUR_TOKEN:9f2c…",
  "duplicate": false
}
```

The trigger node outputs the request as `body`, `headers`, `query`, and `method`. A body that is not JSON arrives as a plain string. The secret is removed from `headers` before anything is stored.

The route has no session. Anyone with both the URL and the secret can start runs, so treat the secret like a password and send requests over HTTPS when the server is reachable from the internet.

The route enforces these limits:

| Limit | Value |
|-------|-------|
| Body size | 1 MiB, larger bodies get `413` |
| Rate | 120 requests per minute for the route, over which `429` is returned |
| Retries | Send `x-webhook-id` to make a retry count once. Without it, an identical body in the same minute counts once |

The `404`, `401`, and `410` responses, and the idempotency rules, are described in [Triggering a Workflow by Webhook](api-reference.md#triggering-a-workflow-by-webhook).

## Use n8n with NodeTool

n8n and NodeTool can start each other's workflows over HTTP.

- **n8n calls NodeTool.** Save a workflow with a Webhook Trigger and arm it. In n8n, add an HTTP Request node with the method `POST`, the trigger's webhook URL, and the header `x-webhook-secret` set to the secret from the popover. The JSON body arrives on the trigger's `body` output. See [Calling a webhook](#calling-a-webhook).
- **NodeTool calls n8n.** Add a Code node and `fetch` the URL of an n8n Webhook node, with the method and body the n8n node expects. See [JavaScript Sandbox](javascript-sandbox.md). The Code node's `fetch` refuses loopback and private network addresses, so the n8n URL must be a public one.

## Where triggers run

Triggers run inside the NodeTool server process. Nothing fires while the server is stopped.

- **Desktop.** The server runs on your computer, so file watch triggers see your own folders. The webhook URL points at that local server, so an outside service can reach it only if you expose the port.
- **Self-hosted.** The server watches folders on the machine it runs on, which inside a container is the container's filesystem. Mount the folder into the container. See [Self-Hosted Deployment](self-hosted-deployment.md).

On restart, a webhook or file event that the server stored but had not yet run starts its run. A missed interval tick or schedule slot does not repeat. The trigger fires once when the server comes back, then continues from there.

A server administrator can turn triggers off for one server with `NODETOOL_DISABLE_TRIGGERS=1`. That server runs no triggers and webhook requests to it return `404`. Use it when a second server shares the same database and should not run triggers too. See [Configuration](configuration.md).

You can test a triggered workflow from the command line without arming anything. `nodetool workflows run` accepts `--trigger-event` to deliver one event to a trigger node. See [CLI](cli.md).

The mobile app has no Triggers screen. Manage triggers on desktop or web.

## Troubleshooting

**The bolt button is missing.** The graph has no schedule, interval, file watch, webhook, email, or manual trigger node. The Wait node does not count.

**Nothing fires.**
- Check that the trigger shows **Active**, not **Inactive**.
- Check that the server is running and that `NODETOOL_DISABLE_TRIGGERS` is not set on it.
- Save the workflow after changing a property. The server uses the last saved settings.

**A schedule trigger shows `Schedule not armed`.** The last save contained a cron expression or timezone that cannot schedule. Fix the node, save, and turn the trigger on. See [Schedule Trigger](#schedule-trigger) for the accepted fields.

**A schedule trigger fires at the wrong hour.** The expression is read in the node's **Timezone**, which defaults to `UTC`. Set it to your own zone, such as `Europe/Berlin`.

**An interval trigger fires right after I arm it.** A schedule is measured from when the trigger was created or last fired. If that moment is more than one interval ago, the next run is already due and starts at the scheduler's next check. Turn off **Emit On Start** and set **Initial Delay Seconds** to shape the first run.

**A file trigger stays silent.** Read the last error. `Watch path does not exist` means the path is missing on the server's machine. Also check that the file name matches **Patterns** and not **Ignore Patterns**, that **Recursive** is on for files in subfolders, and that the event type is in **Events**. Rapid repeat changes to one file count once within the debounce window.

**A webhook call returns an error.** `404` means the token is wrong, or triggers are disabled on that server. `401` means the secret is missing or wrong. `410` means the trigger is not armed. `413` and `429` are the limits above.

**A webhook call returns `"duplicate": true`.** The request matched an earlier one, so no new run started. Change the body or the `x-webhook-id`.

**An email trigger stays silent.** Read the last error. `Poll failed: Invalid credentials` means the app password or address in settings is wrong. `GOOGLE_MAIL_USER and GOOGLE_APP_PASSWORD must be configured` means a setting is missing. Also check that the folder is the one the mail lands in, that **From Address** and **Subject** match, and that the mail arrived after the first check. Mail already in the folder when you armed the trigger never starts a run.

**The trigger shows Stopped.** Read **Last error** and see [Automatic disarm](#automatic-disarm).

**I clicked Fire now and nothing happened.** A run started, but the graph may have failed. Check the run history and the **Last error** line.
