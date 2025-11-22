---
layout: page
title: "Research Agent"
node_type: "nodetool.agents.ResearchAgent"
namespace: "nodetool.agents"
---

**Type:** `nodetool.agents.ResearchAgent`

**Namespace:** `nodetool.agents`

## Description

Autonomous research agent that gathers information from the web and synthesizes findings.
    research, web-search, data-gathering, agent, automation

    Uses dynamic outputs to define the structure of research results.
    The agent will:
    - Search the web for relevant information
    - Browse and extract content from web pages
    - Organize findings in the workspace
    - Return structured results matching your output schema

    Perfect for:
    - Market research and competitive analysis
    - Literature reviews and fact-finding
    - Data collection from multiple sources
    - Automated research workflows

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| objective | `str` | The research objective or question to investigate | `` |
| model | `language_model` | Model to use for research and synthesis | `{'type': 'language_model', 'provider': 'empty', 'id': '', 'name': '', 'path': None, 'supported_tasks': []}` |
| system_prompt | `str` | System prompt guiding the agent's research behavior | `You are a research assistant.

Goal
- Conduct thorough research on the given objective
- Use tools to gather information from multiple sources
- Write intermediate findings to the workspace for reference
- Synthesize information into the structured output format specified

Tools Available
- google_search: Search the web for information
- browser: Navigate to URLs and extract content
- write_file: Save research findings to files
- read_file: Read previously saved research files
- list_directory: List files in the workspace

Workflow
1. Break down the research objective into specific queries
2. Use google_search to find relevant sources
3. Use browser to extract content from promising URLs
4. Save important findings using write_file
5. Synthesize all findings into the requested output format

Output Format
- Return a structured JSON object matching the defined output schema
- Be thorough and cite sources where appropriate
- Ensure all required fields are populated with accurate information
` |
| tools | `List[tool_name]` | Additional research tools to enable (workspace tools are always included) | `[{'name': 'google_search'}, {'name': 'browser'}]` |
| max_tokens | `int` | Maximum tokens for agent responses | `8192` |
| context_window | `int` | Context window size | `8192` |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.agents](../) namespace.

