# Product Price Drop

Product Price Drop is a normal Application available in the example app catalog.
Installing it imports two pinned JavaScript operations with the Application.
The Recipe is compiled from its manifest through the
[shared plan/finish operations and compiler](shared-operations.md). Tracking:
[epic #5979](https://github.com/nodetool-ai/nodetool/issues/5979), PRs
[#5988](https://github.com/nodetool-ai/nodetool/pull/5988),
[#5989](https://github.com/nodetool-ai/nodetool/pull/5989),
[#5990](https://github.com/nodetool-ai/nodetool/pull/5990),
[#5991](https://github.com/nodetool-ai/nodetool/pull/5991), and issues
[#5984](https://github.com/nodetool-ai/nodetool/issues/5984),
[#5985](https://github.com/nodetool-ai/nodetool/issues/5985),
[#5986](https://github.com/nodetool-ai/nodetool/issues/5986),
[#5987](https://github.com/nodetool-ai/nodetool/issues/5987).

Supply a stored product image, logo, headline, old price, new price, CTA, and
brand color. Choose a creative direction, run **Plan**, review the composed cut
and exact layer list, approve it, then run **Build editable ad**. Planning
resets approval, so changing a production input requires planning and approving again.

The plan has a three-second hook and a three-second CTA. Product and logo use
the original stored assets. Copy remains exact text. The brand background is a
shape. Finishing creates the normal editable vertical Timeline without calling
an image or video generation provider. Use **Open editable timeline** on the result to render or export there.

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
runs the sandbox scripts, creates a layered Timeline, renders it, reopens it,
and repeats finishing after a manual placement edit and a price change. To keep
the render and sampled frames:

```bash
PRICE_DROP_PROOF_DIR=/tmp/recipe-price-drop-proof \
  npm run test --workspace=packages/websocket -- tests/product-price-drop.test.ts
```

The frontend interaction test exercises the Recipe's input, ChoiceCards, and
Approval bindings. The Playwright Recipe builder journey edits the title in the
App Builder through Puck, saves, reloads and confirms the Recipe manifest
survives. It then uploads both assets, fills every protected input, plans,
reviews the composed preview, approves, builds, verifies the inline preview, and
opens the editable Timeline. It also changes the live script heads to prove that
operations still execute their pinned versions. Run it with:

```bash
npm run test:journeys --workspace=web -- recipe-builder.spec.ts
```

The Timeline validator checks asset identity, copy, declared transforms and
provenance. It does not recognize rendered objects at the pixel level.

`finish_storyboard` also accepts `strategy: "agentic"` in a provider-backed
agent session, or with an explicit `model: {provider, id}` in a Mini App
operation or headless script. An explicit model is used exactly, with no
silent fallback. The default remains deterministic and needs no model.
The bounded invocation requests medium effort with extended thinking disabled.
The model still authors composition and performs mandatory pixel review.
The opt-in pass receives the whole board, preservation rules and editable
scaffold. A new agentic cut must author editable layout or motion before
submission. Read-only, no-op and metadata-only edits do not satisfy this
requirement. An existing cut may stay unchanged after visual review. The
authoring check proves a composition change and the visual review assesses
its quality. Agentic reruns reuse accepted layer presentation and refresh
Storyboard-owned source identity, exact copy, protected colors and timing.
Typography and permitted manual placement survive input changes. Existing
layer names stay user-owned. Manual typography, opacity or animation changes
produce an explicit conflict before model dispatch. Retained
presentation must pass the current production policy before model dispatch.
The review renders design references derived from the expected Storyboard
revision and compares composited cut frames with them. The references show
content, hierarchy and intent, not approved layout.
The deterministic layout fits each image of known pixel size between the copy
above and below it. Before visual review, a layout check renders each layer
alone at every shot's hold frame. That is the frame after the last entrance
and before the first exit. The check returns copy that overlaps or crowds
another layer, or reaches the frame edge, to the author. Copy wholly inside an
image or plate passes as an overlay. The reviewer receives the collisions the
references themselves contain, and a candidate that repeats one fails. Each
hold frame is labeled in the review.
The agent uses existing Timeline operations and cannot invoke media generation
or replace accepted media. A batch that changes an accepted layer's start or
duration is rejected and rolled back. Motion delay and duration belong in
Timeline animations within that window. Policy, structural and layout checks run before visual
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
silently weakening source fidelity. A visual review checks sampled frames, not every frame. The returned review report
contains frame hashes, timecodes and derived-reference fingerprints.
Agentic results report the provider's measured cost delta as `costUsd`.
Normal JS script execution scopes both imported capability calls and native
`nodetool` aliases to the script deadline. Finishing checks that signal before
provider calls and the final save. Returning from the script also revokes
unawaited finishing calls without cancelling the caller's processing context.
