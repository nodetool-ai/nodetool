# Card and port presentation contract

This change follows the actual bodies in `PromptComposerBody.tsx`,
`ResizeImageBody.tsx`, `BlurBody.tsx`, `ContentCardBody.tsx`, `NodeOutputs.tsx`
and `NumberProperty.tsx`, using `WindowParityFixture.json` as the comparison.

- A port without a rendered web handle has no native dot, wire paint, wire
  selection shape or handle hit target. Canonical ports and edges remain intact,
  including metadata, save/reopen and undo. Dynamic Prompt variables, image
  handles, ordinary generic handles and Agent control ports remain interactive.
- The absolutely positioned output column does not enlarge a generic card.
  Get Metadata remains 72 logical pixels tall, with outputs centered at 46,
  74, 102, 130 and 158. Its graphics bounds include the overflowing handles.
- Integer Input places its value editor below the Value label. The fixture
  measures 94 logical pixels tall, with its 28-pixel field at y=55, as the
  compact surface in `NumberField.tsx` specifies. Authored width and supported height remain
  respected rather than being replaced with fixture dimensions.
- Content-card previews begin at 47 logical pixels, including the body's
  vertical padding. Agent handles retain their 46/74/102/130 centers and the
  fixture's overall 217-pixel height. Equal-layer cards follow document order,
  so the later caption Preview covers the earlier width Preview at overlap.

Acceptance uses native geometry, pointer, canonical save/undo tests and matched
whole-window captures at 1440×900 and 1024×700 in both themes. It does not claim
platform desktop acceptance. The part 2 bodies, Set Variable names and the
drop zone file picker followed later and are recorded in the
[comparison](parity.md#bespoke-bodies-for-part-2). SC1–SC3 and F42 are unchanged.

## Image-viewer integration

`WorkflowGraphModel::canvasResultRect(NodeId) const` supplies the card-local
result container used by the raster/text painter before image aspect fitting.
It gives playback priority, then the bespoke padded result area, then the generic
result band above progress. Collapsed and non-card items return an empty rect.
Authored sizes remain part of the calculation. Disabled cards retain their
painted result geometry, so viewer activation must check `bypassed(id)` if it
should reject them. No media presenter or viewer implementation is owned here.
