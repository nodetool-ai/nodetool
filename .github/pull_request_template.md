## What changed

<!-- One paragraph. What the diff does, and why — not a file list. -->

## Verification

<!-- Commands you ran, with their result. Paste the failing output for any
     check you inverted to prove it can fail. -->

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run test` and `npm run test:packages` (or the packages
      `nodetool affected` names)
- [ ] `npm run dev:nodetool -- harness gate --base main`

## Agent capabilities

Skip this section if the diff adds no capability and changes no capability's
declared contract (name, description, input schema, permission category,
`needsToolCallId`).

- [ ] `npm run capabilities:check` passes
- [ ] Every added or re-declared capability names an eval case or a suite in
      `packages/cli/src/harness/capability-table.ts`, or carries a gap note
      saying what a check for it would look like

## New checks

Skip this section if the diff adds no check, rule, or audit.

- [ ] The check was inverted once and observed failing; the failing command is
      in **Verification** above
- [ ] An audit asserts it found its targets, so it cannot pass by matching
      nothing
