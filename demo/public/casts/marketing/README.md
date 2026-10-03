# Accepted marketing footage

These are the homepage's source renders before the motion finishing pass.
They were copied from `marketing/public/`, not downloaded or regenerated.

- `hero-project.mp4` is the accepted projector campaign restored by commit
  `7888e134b825d656a454e1855bb3a3ec42bc7d83`.
- `conversation-project.mp4` is the published SCRAPHEART conversation demo.
- `surface-storyboard.mp4`, `surface-script.mp4`, `surface-timeline.mp4`,
  `surface-sketch.mp4`, and `surface-3d.mp4` are the published editor loops.
- `surface-game.mp4` is a recording of the game editor with the shipped Kindle
  example, captured from the seeded journey backend at 1920 × 1080 and 30 fps.
  The page clock advanced one frame per screenshot, so play runs at game
  speed. The capture browser had no WebGPU, so the game renders through its
  Canvas 2D path and the fallback notice row was hidden.

Keep these sources separate from the delivery files. The
[finishing catalog](../../../src/marketing/catalog.ts) specifies the source
windows and crops. The [render command](../../../README.md#published-marketing-demos-demosrcmarketing)
rebuilds the delivery formats and posters.
