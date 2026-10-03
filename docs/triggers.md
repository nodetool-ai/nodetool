---
layout: page
title: "Triggers"
description: "Run a workflow on a schedule, when a file changes, when a webhook arrives, or by hand."
---

A trigger starts a workflow run when something happens, so you do not have to press **Run**. You add a trigger node to the graph, save the workflow, and arm the trigger. From then on the NodeTool server starts one run for every event.

> **Quick Access:** Add a trigger node from the node menu, save the workflow, then click the bolt button in the floating toolbar and turn on **Workflow active**.

---

## What a trigger is

Each trigger node in a workflow becomes a trigger registration when you save. The registration is what the server watches. It records whether the trigger is armed, when it last fired, the last error, and how many runs it has started.

Saving never arms a trigger. A new registration starts off, and an existing one keeps the state you last set. Arming is always something you do on purpose.

When an event arrives, the server starts a separate run of the workflow and hands the event to the trigger node, which passes it to the nodes connected to its outputs. Each event is one run. Triggered runs have no editor open, so they run headlessly in the server and appear in your run history like any other job.

A triggered run also receives three parameters. An Input node with a matching name picks them up, and a workflow without such nodes ignores them.

| Parameter | Value |
|-----------|-------|
| `last_fired_at` | When this trigger last fired, or null |
| `now` | The time the run started, as an ISO 8601 string |
| `is_first_run` | True until one run has completed successfully |

## Trigger nodes

The nodes live in the `nodetool.triggers` namespace. Interval, file watch, webhook, and manual triggers create registrations. The Wait node is not a trigger and is listed here because it sits in the same group.

### Interval Trigger

Fires on a fixed interval. It is the schedule trigger.

| Setting | Default | What it does |
|---------|---------|--------------|
| Interval Seconds | 60 | Seconds between runs |
| Initial Delay Seconds | 0 | Delay before the first run |
| Emit On Start | On | When on, the first run is due as soon as the trigger is armed after the initial delay. When off, the first run waits one full interval |
| Max Events | 0 | Applies only when the node runs inside the editor. The scheduler ignores it |
| Include Drift Compensation | On | Applies only when the node runs inside the editor. The scheduler ignores it |

Outputs: `tick`, `elapsed_seconds`, `interval_seconds`, `timestamp`, `source`, `event_type`.

The server schedules each run from the previous one, so a slow or stopped server shifts the next run instead of catching up on missed ones. The scheduler checks for due triggers every 5 seconds, so timing is accurate to a few seconds, not to the millisecond. An interval has no fixed clock times. To run at 09:00 every day you need a different approach, such as an external scheduler calling a webhook.

### File Watch Trigger

Fires when a file or folder changes.

| Setting | Default | What it does |
|---------|---------|--------------|
| Path | `.` | File or folder to watch. A relative path resolves against the server's working directory, so use an absolute path |
| Recursive | Off | Also watch subfolders |
| Patterns | `*` | File names to include, such as `*.csv`. Matching uses the file name only. `*` matches any run of characters and `?` matches one character |
| Ignore Patterns | none | File names to skip. These are checked before Patterns |
| Events | created, modified, deleted, moved | Which event types start a run |
| Debounce Seconds | 0.5 | Ignores a repeat event for the same path within this window |
| Max Events | 0 | Applies only when the node runs inside the editor |

Outputs: `event`, `path`, `dest_path`, `is_directory`, `timestamp`.

The server watches the path on its own machine, so the folder must exist there. If the path does not exist, the trigger stays quiet and the popover shows `Watch path does not exist`. The server's file watcher reports `created`, `modified`, and `deleted`. It does not report `moved` events, and `dest_path` is empty. The server does not see changes made while it is not running.

### Webhook Trigger

Fires when an HTTP request arrives at the trigger's URL. The node has no settings. Saving the workflow creates the URL token and a shared secret, and the popover shows both. They stay the same across later saves.

Outputs: `body`, `headers`, `query`, `method`, `path`, `timestamp`, `source`, `event_type`. See [Calling a webhook](#calling-a-webhook).

### Manual Trigger

Fires only when you click **Fire now** in the trigger popover, or when something calls the `triggers.fire` procedure. Use it to start a workflow by hand from the popover, or as a stand-in while you build another trigger.

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
3. Save the workflow. A trigger registration exists only after a save, and a changed setting takes effect only after the next save.
4. Click the bolt button in the floating toolbar. It appears only when the graph contains at least one trigger node.
5. Turn on **Workflow active** to arm every trigger, or turn on **Enabled** for one trigger.

Until you save, the switch is off and the popover says to save the workflow first.

Removing a trigger node and saving deletes its registration, including a webhook's token and secret. Adding the node again creates new ones.

The toolbar button reads **Triggers: active**, **partly active**, or **inactive** to screen readers, with the extra note `last run failed` or `disabled automatically` when that applies. In the popover, the header badge shows the same state:

| Badge | Meaning |
|-------|---------|
| Active | Every trigger in the workflow is armed |
| Partly active | Some are armed. Turning on **Workflow active** arms the rest |
| Inactive | None are armed |
| Not registered | The workflow has no saved registrations yet |
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
- **Expiry.** A registration with an expiry time turns off once that time passes.
- **Run limit.** A registration with a maximum number of runs turns off after it reaches that number of successful runs.

Neither the expiry nor the run limit can be set from the editor. Failures are the case you will meet.

A trigger that was disarmed this way shows **Stopped** in the popover with the reason and the line `Turn it back on to retry.` Turning it on clears the failure count and the reason, so the trigger starts fresh. If the cause is not fixed, it stops again after 5 more failures.

## The trigger popover

Click the bolt button in the toolbar to open it. It lists one block for each trigger node, labeled **Webhook**, **Schedule**, **File watch**, or **Manual**.

| Item | What it shows |
|------|---------------|
| Status badge | **Active**, **Inactive**, or **Stopped** (disarmed by the server) |
| **Enabled** | Arms or disarms this one trigger |
| Schedule line | For an interval trigger, `Runs every 5m — next in 4m`. `due now` means the next run is waiting for the scheduler's next check |
| Last fired | The local date and time of the last event, or `Never` |
| Stopped reason | Why the server disarmed the trigger |
| Last error | The message from the most recent failure. A later successful run clears it |
| Webhook URL and secret | Webhook triggers only. Each has a copy button, and the secret is hidden until you click the eye button |
| **Fire now** | Starts one run immediately. Disabled until the trigger is armed |

An error in the toggle or in **Fire now** appears as a notification, for example `Could not fire trigger: Trigger is not active`.

**Fire now** sends an empty event payload. It is the quickest way to test the rest of the graph. To test a webhook with real data, send a request to its URL.

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

## Where triggers run

Triggers run inside the NodeTool server process, so the server must be running for any of them to fire. Nothing fires while the server is stopped.

- **Desktop.** The server runs on your computer, so file watch triggers see your own folders. The webhook URL points at that local server, so an outside service can reach it only if you expose the port.
- **Self-hosted.** The server watches folders on the machine it runs on, which inside a container is the container's filesystem. Mount the folder into the container. See [Self-Hosted Deployment](self-hosted-deployment.md).

On restart, a webhook or file event that the server stored but had not yet run starts its run. A missed interval tick does not repeat. The trigger fires once when the server comes back, then continues from there.

To turn trigger handling off for a process, set `NODETOOL_DISABLE_TRIGGERS=1`. The process then starts no dispatcher, scheduler, or file watcher, and it does not serve the webhook route, so webhook requests return `404`. Use it when a second server shares the same database and should not run triggers too. See [Configuration](configuration.md).

You can test a triggered workflow from the command line without arming anything. `nodetool debug` and `nodetool run` accept `--trigger-event` to deliver one event to a trigger node. See [CLI](cli.md).

The mobile app has a Triggers screen for monitoring. See [Mobile App](mobile-app.md).

## Troubleshooting

**The bolt button is missing.** The graph has no interval, file watch, webhook, or manual trigger node. The Wait node does not count.

**The switch is off and says to save first.** The workflow has no registrations. Save it.

**Nothing fires.**
- Check that the trigger shows **Active**, not **Inactive**.
- Check that the server is running and that `NODETOOL_DISABLE_TRIGGERS` is not set on it.
- Save the workflow after changing a property. The server uses the last saved settings.

**An interval trigger fires right after I arm it.** A schedule is measured from when the registration was created or last fired. If that moment is more than one interval ago, the next run is already due and starts at the scheduler's next check. Turn off **Emit On Start** and set **Initial Delay Seconds** to shape the first run.

**A file trigger stays silent.** Read the last error. `Watch path does not exist` means the path is missing on the server's machine. Also check that the file name matches **Patterns** and not **Ignore Patterns**, that **Recursive** is on for files in subfolders, and that the event type is in **Events**. Rapid repeat changes to one file count once within the debounce window.

**A webhook call returns an error.** `404` means the token is wrong, or triggers are disabled on that server. `401` means the secret is missing or wrong. `410` means the trigger is not armed. `413` and `429` are the limits above.

**A webhook call returns `"duplicate": true`.** The request matched an earlier one, so no new run started. Change the body or the `x-webhook-id`.

**The trigger shows Stopped.** Read **Last error**, fix the cause in the workflow, save, and turn the trigger back on.

**The bolt is red but the trigger is armed.** The latest run failed. The trigger keeps running and stops after 5 failures in a row.

**I clicked Fire now and nothing happened.** A run started, but the graph may have failed. Check the run history and the **Last error** line.
