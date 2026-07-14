---
layout: page
title: "Browser Agent"
node_type: "nodetool.agents.BrowserAgent"
namespace: "nodetool.agents"
---

**Type:** `nodetool.agents.BrowserAgent`

**Namespace:** `nodetool.agents`

## Description

Browse the web to fetch pages, extract data, and automate navigation from a prompt.
    agent, browser, web, scrape, extraction, automation

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `language_model` | Model used for free-form browsing tasks. | `{"type":"language_model","provider":"empty","id...` |
| prompt | `str` | Prompt for browser navigation/extraction. | `` |
| timeout_seconds | `int` | Maximum runtime for agent execution. | `150` |
| max_output_chars | `int` | Maximum serialized output chars before truncation. | `180000` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| text | `str` |  |

## Related Nodes

Browse other nodes in the [nodetool.agents](./) namespace.
