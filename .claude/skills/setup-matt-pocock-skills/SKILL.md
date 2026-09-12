---
name: setup-matt-pocock-skills
description: "Configure repository issue-tracker, triage-label, and domain-document conventions when setup or reconfiguration is requested."
disable-model-invocation: true
---

# Setup engineering skills

Configure the requested tracker and domain-document conventions while preserving
existing setup. This skill runs when setup is requested, not as a prerequisite
to ordinary engineering work.

## Inspect existing configuration

Read root `AGENTS.md`, `docs/agents/`, domain glossaries and ADR locations, and
Git remotes. Inspect tracker labels when tracker access is available. Existing
choices and explicit user preferences take precedence over template defaults.

If a consequential choice remains unresolved, ask about that choice while
preparing the rest. Do not reconfirm existing tracker, labels, or document layout.
Do not create remote labels or issues unless the setup request authorizes them.

## Write the configuration

Load only the template for the chosen tracker:

- [GitHub](issue-tracker-github.md)
- [GitLab](issue-tracker-gitlab.md)
- [Local Markdown](issue-tracker-local.md)

For another tracker, document its actual available operations. Preserve existing
label mappings and PR discovery preferences. Use [triage-labels.md](triage-labels.md)
only when triage is in scope, and [domain.md](domain.md) for domain-document setup.
Create `docs/agents/issue-tracker.md`, `docs/agents/triage-labels.md`, and
`docs/agents/domain.md` only as needed for the requested configuration.

Put repository instructions in `AGENTS.md`. A sibling `CLAUDE.md` contains only
`@AGENTS.md`, following the [repository rule](../../../AGENTS.md). Update an
existing Agent skills section in place, linking to the relevant configuration.
Preserve unrelated guidance. Link any new area `AGENTS.md` from the root or an
already reachable area instruction file.

Complete reversible local edits without an extra draft approval. When a remaining
external operation needs authorization, present its exact target and changes
only after preparing the local configuration.

## Verify and deliver

Check configuration links and run `npm run check:agents-docs` after instruction
file changes. Read back any authorized tracker mutations. Report the configured
tracker, document locations, and any operation that could not be completed.
