---
name: to-spec
description: "Turn an existing discussion into an actionable spec. Draft locally or publish to the configured tracker as requested."
disable-model-invocation: true
---

This skill takes the current conversation context and codebase understanding and produces a spec. Do NOT interview the user — just synthesize what you already know.

Use the configured tracker and existing labels when publication is requested.
If the destination is missing, finish a local draft before asking where to publish.
Do not run repository setup as a prerequisite to drafting the spec.

## Process

1. Explore the repo to understand the current state of the codebase, if you haven't already. Use the project's domain glossary vocabulary throughout the spec, and respect any ADRs in the area you're touching.

2. Identify test boundaries that detect the acceptance criteria, preferring existing
public interfaces. Use the spec and repository conventions to make routine choices.
Record unresolved behavior as an open question, without inventing requirements.

3. Write a concise spec using the relevant sections below. Publish when the user's
request or prior context authorizes it. A draft-only request ends with the draft.
Use the configured `ready-for-agent` label only when the spec is ready to implement.
Return the file path or published issue link.

<spec-template>

## Problem Statement

The problem that the user is facing, from the user's perspective.

## Solution

The solution to the problem, from the user's perspective.

## User Stories

List the distinct actor goals and acceptance criteria needed for the agreed scope.
Combine duplicates. Include observable success and failure behavior where relevant.
Do not expand the feature to make the list longer.

## Implementation Decisions

A list of implementation decisions that were made. This can include:

- The modules that will be built/modified
- The interfaces of those modules that will be modified
- Technical clarifications from the developer
- Architectural decisions
- Schema changes
- API contracts
- Specific interactions

Include stable module or interface references when they help implementation.
Link to the source of a decision instead of copying unrelated code.

Exception: if a prototype produced a snippet that encodes a decision more precisely than prose can (state machine, reducer, schema, type shape), inline it within the relevant decision and note briefly that it came from a prototype. Trim to the decision-rich parts — not a working demo, just the important bits.

## Testing Decisions

A list of testing decisions that were made. Include:

- Observable acceptance criteria and the test boundary that detects each
- Which modules will be tested
- Prior art for the tests (i.e. similar types of tests in the codebase)

## Out of Scope

A description of the things that are out of scope for this spec.

## Further Notes

Any further notes about the feature.

</spec-template>
