# Product Price Drop

Product Price Drop is a normal Application available in the example app catalog.
Installing it imports two pinned JavaScript operations with the Application.
This vertical slice follows [epic #5979](https://github.com/nodetool-ai/nodetool/issues/5979)
and the foundations in PRs [#5988](https://github.com/nodetool-ai/nodetool/pull/5988),
[#5989](https://github.com/nodetool-ai/nodetool/pull/5989),
[#5990](https://github.com/nodetool-ai/nodetool/pull/5990), and
[#5991](https://github.com/nodetool-ai/nodetool/pull/5991).
The Recipe is compiled from its manifest through the
[shared plan/finish operations and compiler](shared-operations.md), corresponding
to issues [#5985](https://github.com/nodetool-ai/nodetool/issues/5985) and
[#5987](https://github.com/nodetool-ai/nodetool/issues/5987).
Design-frame review and finishing work is tracked in issues
[#5984](https://github.com/nodetool-ai/nodetool/issues/5984) and
[#5986](https://github.com/nodetool-ai/nodetool/issues/5986).
There is no separate Recipe resource or executor.

Supply a stored product image, logo, headline, old price, new price, CTA, and
brand color. Choose a creative direction, run **Plan**, review the exact layer
list, approve it, then run **Build editable ad**. Changing a production input
requires planning and approving again. Planning resets approval.

The plan has a three-second hook and a three-second CTA. Product and logo use
the original stored assets. Copy remains exact text. The brand background is a
shape. Finishing creates the normal editable vertical Timeline, without calling
an image or video generation provider. Use **Open editable timeline** on the result to enter the normal Timeline editor
and render or export there.

Rerunning the plan updates the existing shots by their stable semantic labels.
Planning reads the linked Timeline revision, so manual placement edits made
before planning can be reconciled. An edit after planning produces a revision
conflict and requires a new plan.
Finishing updates the layers identified by board, shot, and graphics-element
identity. Manual placement edits survive. Manual replacement of protected
sources or copy causes an explicit conflict instead of silently overwriting it.
Finishing preserves unrelated Timeline metadata. Existing global camera,
code-authored source, or media tracking returns an explicit conflict because
this finishing slice cannot reconcile those features.
Ordinary Storyboard assembly refuses to replace finished semantic layers. Use
`finish_storyboard` to update them through the same reconciliation rules.

The operation's source permissions come from the Recipe manifest's preservation
rules. Both the Recipe and its executable scripts ship in the normal Application
bundle. Rebuild it with:

```bash
node scripts/build-example-apps.mjs --app product-price-drop --skip-validate
node scripts/build-example-apps.mjs --app product-price-drop --check
```

The integration fixture installs the bundle, saves a UI-only document edit,
runs its actual sandbox scripts, creates a layered Timeline, renders through
the existing compositor and encoder, reopens it, and repeats finishing after a
manual placement edit and a price change. To preserve the render and sampled
frames for inspection:

```bash
PRICE_DROP_PROOF_DIR=/tmp/recipe-price-drop-proof \
  npm run test --workspace=packages/websocket -- tests/product-price-drop.test.ts
```

The frontend interaction test exercises the same Recipe's normal input,
ChoiceCards, and Approval bindings. The Playwright Recipe builder journey opens
the real App Builder, edits its title through Puck, saves, reloads and confirms
the original Recipe manifest survives. It then uploads both assets, fills every
protected input, plans, approves, builds, verifies the inline preview, and opens
the editable Timeline. It also changes the live script heads to prove that
operations still execute their pinned versions. Run it with:

```bash
npm run test:journeys --workspace=web -- recipe-builder.spec.ts
```

The actual Timeline validator mechanically checks
asset identity, copy, declared transforms and provenance. It does not claim
pixel-level semantic recognition of every rendered object.

`finish_storyboard` also accepts `strategy: "agentic"` in a provider-backed
agent session, or with an explicit `model: {provider, id}` in a Mini App
operation or headless script. An explicit model is used exactly, with no
silent fallback. The default remains deterministic and needs no model.
The opt-in pass receives the whole board, preservation rules and editable
scaffold. It renders design references derived from the expected Storyboard
revision and compares actual composited cut frames with those references.
These are derived references, not a separate historical pixel approval.
The agent uses existing Timeline operations and cannot invoke media generation
or replace accepted media. Policy and structural checks run before visual
review. Findings require a changed draft and another render and review, with
at most three candidates. An unreviewed, unresolved, cancelled or stale cut
is not saved.

Additional decorative layers need explicit stable semantic names within a shot.
Rerunning an addition with that name reuses its existing identity. Use
`set_clip_params` to change it. Extra layers carry board, shot and element
provenance. Manual edits or deletion of agent-owned decorative layers produce
an explicit conflict on rebuild. Existing manual placement edits to source
layers retain the deterministic materializer's preservation behavior.
Protected layers cannot inherit an unproven group transform. Unsupported
protected animation, mask or effect paths fail policy validation rather than
silently weakening source fidelity. A visual review checks sampled frames,
not every frame or perfect visual equivalence. The returned review report
contains frame hashes, timecodes and derived-reference fingerprints.
Agentic results report the provider's measured cost delta as `costUsd`.
Normal JS script execution scopes both imported capability calls and native
`nodetool` aliases to the script deadline. Finishing checks that signal before
provider calls and the final save. Returning from the script also revokes
unawaited finishing calls without cancelling the caller's processing context.
