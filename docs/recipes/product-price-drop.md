# Product Price Drop

Product Price Drop is a normal Application available in the example app catalog.
Installing it imports two pinned JavaScript operations with the Application.
This vertical slice follows [epic #5979](https://github.com/nodetool-ai/nodetool/issues/5979)
and the foundations in PRs [#5988](https://github.com/nodetool-ai/nodetool/pull/5988),
[#5989](https://github.com/nodetool-ai/nodetool/pull/5989),
[#5990](https://github.com/nodetool-ai/nodetool/pull/5990), and
[#5991](https://github.com/nodetool-ai/nodetool/pull/5991).
Broader design-frame review, shared operations, finishing and compilation work
is tracked in issues [#5984](https://github.com/nodetool-ai/nodetool/issues/5984),
[#5985](https://github.com/nodetool-ai/nodetool/issues/5985),
[#5986](https://github.com/nodetool-ai/nodetool/issues/5986), and
[#5987](https://github.com/nodetool-ai/nodetool/issues/5987).
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
Finishing updates the layers identified by board, shot, and graphics-element
identity. Manual placement edits survive. Manual replacement of protected
sources or copy causes an explicit conflict instead of silently overwriting it.

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
the original Recipe manifest survives. Run it with:

```bash
npm run test:journeys --workspace=web -- recipe-builder.spec.ts
```

The actual Timeline validator mechanically checks
asset identity, copy, declared transforms and provenance. It does not claim
pixel-level semantic recognition of every rendered object.
