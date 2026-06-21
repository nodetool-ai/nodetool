---
layout: page
title: "Live Browser Agent"
node_type: "nodetool.agents.LiveBrowserAgent"
namespace: "nodetool.agents"
---

**Type:** `nodetool.agents.LiveBrowserAgent`

**Namespace:** `nodetool.agents`

## Description

Drives your real, logged-in Chrome via the Nodetool browser extension.
    Automates media-generation UIs, saves generated images/videos as assets, and uploads assets into sites.
    skills, browser, live, automation, extension, media

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `language_model` | Model used to plan and drive the live browser session. | `{"type":"language_model","provider":"empty","id...` |
| prompt | `str` | What to do in the live browser (natural language). | `` |
| timeout_seconds | `int` | Maximum runtime for the agent session. | `300` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| text | `str` |  |
| chunk | `chunk` |  |

## Related Nodes

Browse other nodes in the [nodetool.agents](./) namespace.
