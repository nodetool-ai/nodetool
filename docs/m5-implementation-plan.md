# M5 implementation plan — agent and UI disclosure

Task breakdown for milestone M5 of
[sandbox-package-design.md](sandbox-package-design.md). The one-line
prompt tier and the CodeAct session allowlist shipped with M1; M5 is
the documentation layer on top: full SKILL.md retrieval under the
trust rules, package-picker rendering, and Package Manager consent
language. It lands only after the untrusted-content policy below is
wired exactly as designed — quoting is risk reduction, not isolation,
so the policy is about *when* the agent sees pack docs, not how they
are delimited.

> **Landed.** All five tasks shipped together; see the M5 checkpoint in
> [sandbox-package-design.md](sandbox-package-design.md) for what is where.

## Task 1 — Full SKILL.md parsing at discovery

M0 validates only size and minimal frontmatter shape. Hoist the
existing `AgentSkill` parser (`packages/agents/src/agent.ts`) so
node-sdk can call it — per the design, format and parser are the
existing skill machinery, moved to where discovery lives (the
agents package depends on node-sdk, so the shared parser moves down
the dependency order, likely into node-sdk itself or protocol,
mirroring how `code-analysis.ts` serves both). Discovery output
gains the parsed skill (title, description, body) per pack; parse
failures stay warning-grade — a frontmatter typo must never disable
working modules. A pack exposing several specifiers carries one
skill with a section per module.

## Task 2 — Trust-scoped disclosure paths

- **Trusted pack** (on the pack-loader allowlist): its skill registers
  through the normal skill system and can be injected like any other
  skill.
- **Untrusted pack**: the body is never injected. The agent sees it
  only as **untrusted tool output**, and only after the package has
  been chosen for the session (on the CodeAct session allowlist from
  M1). A new tool — `get_sandbox_package_docs(specifier)` — serves the
  body wrapped as untrusted content, refusing specifiers not on the
  session allowlist.
- The ambient one-line tier stays exactly what M1 shipped:
  manifest-derived, strict length and character limits, never
  arbitrary pack text. M5 adds no third tier.

## Task 3 — Code node package picker

The Code node property panel gets the package picker: session-installed
sandbox packs with their one-liners, and the rendered SKILL.md on
selection (same file the agent retrieves; rendering is for the human).
The picker writes `SandboxModuleDeclaration`s onto the node's
`packages` property (M1's shape), stamping `resolvedPackVersion` and
`contentDigest` from the catalog summary. The consent wording is the
design's: "runs inside your workflows with the node's capabilities" —
never "no trust needed". UI per repo rules: ui_primitives only, design
tokens, catalog data over the existing `packs.sandboxModules` tRPC
surface (extended with the rendered skill body by opaque request, not
ambient in the summaries).

## Task 4 — Package Manager consent language

Settings → Packages already shows mode chips and the trust-and-rebuild
action (M0). M5 adds the sandbox-consent sentence to sandbox-only and
hybrid packs, the per-module one-liners, and the SKILL.md view. Install
flow wording states what importing means at the moment of install, per
the trust model.

## Task 5 — Drift tests and prompt-budget guard

The M1 drift tests pin the one-line tier. M5 adds: the disclosure
tool's output is wrapped as untrusted content (string-pinned, like the
existing prompt drift tests); the one-liner derivation enforces its
length/charset limits against adversarial manifest fixtures (control
characters, prompt-injection phrases in `description` — the limits are
the defense, the test proves them); and skill registration for a
trusted pack does not leak into a session where the pack is not
allowlisted.

## Sequencing

Task 1 → 2 (parser before disclosure), then 3 and 4 in parallel (both
consume Task 2's surfaces), Task 5 throughout. Depends on M1 (session
allowlist, declarations); benefits from M2 (a picker-declared pack
should run in the browser) but does not require it.

## Exit criteria

- A trusted fixture pack's skill registers; the same pack untrusted
  yields docs only via the tool, only when session-allowed, wrapped as
  untrusted output.
- The picker produces valid stamped declarations and shows the consent
  wording.
- Adversarial manifest fixtures cannot place uncapped or unfiltered
  text into any always-on prompt tier.
- `npm run check` green.
