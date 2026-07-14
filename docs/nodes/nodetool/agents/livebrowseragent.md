---
layout: page
title: "Live Browser Agent"
node_type: "nodetool.agents.LiveBrowserAgent"
namespace: "nodetool.agents"
---

**Type:** `nodetool.agents.LiveBrowserAgent`

**Namespace:** `nodetool.agents`

## Description

Control your own logged-in Chrome through the Nodetool browser extension.
    agent, browser, live, automation, extension, media

    Use cases:
    - Automate media-generation websites
    - Save generated images and videos as assets
    - Upload your assets into other sites

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
