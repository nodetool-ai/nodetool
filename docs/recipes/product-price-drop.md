# Product Price Drop

Product Price Drop is a normal Application available in the example app catalog.
Installing it imports two pinned JavaScript operations with the Application.
There is no separate Recipe resource or executor.

Supply a stored product image, logo, headline, old price, new price, CTA, and
brand color. Choose a creative direction, run **Plan**, review the exact layer
list, approve it, then run **Build editable ad**. Changing a production input
requires planning and approving again. Planning resets approval.

The plan has a three-second hook and a three-second CTA. Product and logo use
the original stored assets. Copy remains exact text. The brand background is a
shape. Finishing creates the normal editable vertical Timeline, without calling
an image or video generation provider. Render or export through the Timeline.

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
ChoiceCards, and Approval bindings. It is a component test rather than a full
browser installation test. The actual Timeline validator mechanically checks
asset identity, copy, declared transforms and provenance. It does not claim
pixel-level semantic recognition of every rendered object.
