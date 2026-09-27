# Native game artistic roadmap

## Purpose

Give creators bloom, music, ambient motion, scrolling backgrounds, typography,
and lighting without writing a script for each visual detail. Preserve the JSON
document, deterministic simulation, standalone export, and agent playtest model
in the [engine design](builtin-game-engine-design.md).

This is a proposed implementation plan. The first release delivers an effect
chain and bloom. Later phases can ship independently after their prerequisites.
The findings below retain the identifiers from the architecture review.

## Starting points

| Finding | Current implementation | Consequence |
|---|---|---|
| F9 | [The document](../../packages/protocol/src/game.ts) permits one brightness/contrast effect. The GPU package already has [glow](../../packages/gpu/src/shaders/filters/glow/v1/module.ts) and [LUT grading](../../packages/gpu/src/shaders/color/cubeLut/v1/module.ts). | Integrate the existing modules, including their different color-space contracts. |
| F10 | [WebGPU rendering](../../packages/game-renderer/src/webgpu.ts) composites HUD before effects. [Headless capture](../../packages/game-renderer/src/node.ts) has no post-processing. | Define HUD order and capture capability before exposing bloom. |
| F11 | [Frame interpolation](../../packages/game-renderer/src/frame.ts) covers sprite position only. [Canvas2D tinting](../../packages/game-renderer/src/canvas2d.ts) retains a bitmap for each color. | Smooth tweens require more interpolation and bounded tint memory. |
| F12 | [Workspace audio](../../web/src/components/workspace/GameSurface.tsx) and [export audio](../../packages/game-renderer/src/standalone-player.ts) use different playback implementations. | Share audio lifecycle behavior before adding persistent music. |
| F13 | [Asset staging](../../packages/game-nodes/src/nodes/game.ts) copies bytes and selects nearest sampling. [Slot prompts](../../packages/protocol/src/game-slot-prompt.ts) already accept shared style entities. | Add preparation and visual-reference propagation to the existing pipeline. |
| F14 | There is no light component or font asset kind in the document. | Ship embedded fonts and simple point lights separately from advanced lighting. |

## Shared decisions

| Decision | Contract |
|---|---|
| D1 | Visual effects never affect collision, randomness, score, or simulation event order. |
| D2 | Animation and logical audio timing derive from ticks. Rendering interpolates between simulation samples. Hardware audio clocks do not enter snapshots. |
| D3 | Preserve existing documents and one-effect behavior. New fields have explicit defaults. Introduce a version boundary before changing persisted semantics that older engines would misinterpret. |
| D4 | Invalid effect parameters or assets fail validation. An unsupported optional effect may be omitted with a diagnostic. An unsupported required effect fails before play or capture. |
| D5 | Export contains every required asset and works without backend credentials. Browser and headless paths report their capabilities and omissions. |
| D6 | Each phase includes bounded resource use, lifecycle cleanup, authoring guidance, and a reproducible fixture. Performance claims require measurements on a named device and viewport. |

## Delivery order

| Action | Deliverable | Dependency |
|---|---|---|
| A1 | Ordered effects, bloom, HUD compositing, and capture behavior | First release |
| A2 | Asset preparation and shared visual references | Can proceed alongside A1 |
| A3 | Looping music, volume, and shared playback lifecycle | Independent of A1 |
| A4 | Declarative visual animation and interpolation | Independent of A1 |
| A5 | Scrolling layers and parallax | Reuse A4 camera interpolation |
| A6 | Embedded fonts | Extend A2 asset handling |
| A7 | LUT grading | A1 effect chain and asset validation |
| A8 | Ambient light and colored point lights | A1 compositing and capability handling |

A7 can follow A1 immediately when color grading is the priority. It is a separate
change because LUT assets and color conversion need their own validation.

## A1: Effect chain and bloom

Extend `renderEffects` to an ordered, strict union of brightness/contrast and
bloom. Keep existing effect fields valid. Start with a maximum of eight effects,
finite parameter ranges, and rejection of unknown kinds. Expose threshold,
softness, radius, intensity, and the existing `required` capability policy.

Replace the renderer's single-effect API with a chain API. Update the browser
wrapper, workspace player, standalone player, and capture path together. Reuse
the GPU executor and glow recipe. Use reusable intermediate targets, count
scratch allocations in renderer statistics, and release them on resize,
replacement, device loss, and disposal.

Record the actual color encoding of uploaded images and render targets.
Convert between linear and sRGB where modules require it. Relabeling a texture
is not a conversion. Preserve premultiplied alpha through the chain. The first
bloom implementation uses the existing 8-bit recipe and makes no HDR claim.

For new bloom chains, composite world content, then effects, then HUD. Preserve
legacy brightness/contrast output with an explicit compatibility policy.
Make the choice visible in the schema when both orders are supported.

Keep Canvas2D capture available and report omitted optional effects. Add an
explicit GPU capture mode that uses the same effect implementation as the
browser, with deterministic resource teardown. Required effects must never
produce a silently degraded capture. Include culling margins or overscan so
bright objects just outside the viewport can contribute visible glow.

Acceptance criteria:

- A1.1: Existing documents validate and retain their prior rendering behavior.
- A1.2: Two noncommuting effects produce different pixels when their order is
  reversed. An empty chain matches the existing path without effect targets.
- A1.3: A bright sprite produces a halo outside its opaque bounds. Transparent
  edges retain correct alpha, and HUD text stays unaffected in the new mode.
- A1.4: Unsupported optional effects produce a visible diagnostic. Required
  effects fail in fallback, capture, and device-loss scenarios.
- A1.5: Repeated resize and chain replacement do not accumulate targets.
  Browser and GPU capture agree within an explicit pixel tolerance.
- A1.6: Record frame time and target memory for effects disabled and enabled,
  including the configured maximum chain. Set default radius and quality from
  that evidence before shipping.

## A2: Prepare generated assets

Extend staging with explicit preparation settings for alpha trimming, target
size, crop policy, pivot, sampling, and optional mirror tiling. Preserve original
dimensions and crop offsets so trimming does not shift placement. Verify how
pivots are consumed by each renderer before exposing new pivot behavior.

Transform bytes before calculating their digest. Bind the prepared asset to
those exact bytes and validate decoded dimensions. Preserve the existing
installation digest check. Share one selected style image across generation
calls using supported provider inputs, building on the existing style entity.
Record the reference and preparation settings in provenance.

Acceptance criteria:

- A2.1: Repeating preparation with identical inputs and settings produces the
  same output digest. Changed output bytes cannot pass the old digest check.
- A2.2: Trimming preserves the sprite's intended anchor. Mirror tiling has no
  visible seam under the selected sampling mode.
- A2.3: Linear sampling survives staging, installation, and standalone export.
- A2.4: Inspect the generation request to verify the shared image reference is
  supplied. Do not treat matching prompt text as proof of visual consistency.

## A3: Music and audio lifecycle

Move browser playback behavior into a shared module used by both players.
Extend the audio contract with stable voice identity, start/stop, loop, volume,
and fades. Define scene-owned music and its logical start tick. Retain one-shot
events for effects and allow overlapping voices within a documented voice cap.

Pause suspends playback. Reset stops voices and starts the entry scene's music
once. Scene replacement stops departing scene voices. Save/load restores logical
music position without replaying old one-shot events. Derive resume offset from
ticks and decoded duration. Browser gesture requirements and decoding failures
produce actionable status messages.

Acceptance criteria:

- A3.1: Workspace and standalone players pass the same lifecycle scenarios.
- A3.2: Pause, reset, load, and repeated scene changes never duplicate music.
- A3.3: Gain and fade scheduling are tested through the playback boundary.
  A browser test verifies playback after a user gesture.
- A3.4: Snapshots and headless tests verify logical music state. They do not
  assert identical samples across audio devices.

## A4: Declarative visual animation

Add bounded visual tracks for rotation, scale, opacity, and tint, with tick
duration, delay, repeat, ping-pong, and a small easing union. Add a constant
rotation-rate option for continuous spins. Evaluate tracks from entity age,
including authored entities after scene entry and spawned instances after load.

Tracks affect visuals only. Use a documented composition order: authored value,
track result, explicit script override, then lifetime fade/scale. Scripts keep
their existing collision and position semantics. Reject conflicting tracks on
the same property unless composition is explicitly represented.

Interpolate visual properties and the camera in the shared frame path. Retain
unwrapped rotation for deliberate full turns. Reset interpolation across
teleports and scene changes. Bound Canvas2D tint caching before enabling tint
animation, and apply the same color interpolation convention to every backend.

Acceptance criteria:

- A4.1: Save/resume matches continuous playback at delay, loop, and ping-pong
  boundaries, including spawned entities.
- A4.2: Intermediate render fractions produce intermediate visual values and
  camera positions without changing simulation snapshots.
- A4.3: Script overrides and lifetime effects follow the documented order.
- A4.4: A long tint animation has bounded cache memory.

## A5: Scrolling backgrounds

Add a visual layer component with per-axis parallax, scroll rate, repeat/mirror
mode, and origin. Define parallax zero as screen-fixed and one as world-fixed.
Compute scroll from ticks and interpolate it with the same camera sample as
sprites. Keep repeating layers independent of collision and entity spawning.

Acceptance criteria:

- A5.1: Camera motion, zoom, and viewport resize preserve the documented
  parallax behavior in all render backends.
- A5.2: Repeat boundaries have no seams, including negative offsets and long
  sessions. Atlas frames cannot sample neighboring frames.
- A5.3: Save/resume and arbitrary-tick captures reproduce layer positions
  without a script per layer.

## A6: Embedded fonts

Add a font asset kind and logical font reference on HUD labels. Extend export
validation and load the same bytes through browser font loading and the
headless canvas font registry. Wait for required fonts before first capture or
play. Use stable family identifiers to avoid collisions between games.

Acceptance criteria:

- A6.1: An exported game loads its font offline with the existing CSP policy.
- A6.2: Required missing or invalid fonts fail clearly. Optional fallback is
  reported and does not depend on load timing.
- A6.3: Browser and headless text use matching metrics within a declared
  tolerance. Do not promise identical font rasterization across platforms.

## A7: LUT grading

Add a LUT effect referencing a content-addressed asset. Initially use the packed
2D layout expected by the existing cube LUT module. Validate dimensions against
cube size, opaque data, intensity, and domain bounds. Preserve lookup values
during image loading and export. Add explicit color conversion around the
module and retain bloom-before-grade as an authoring preset, not a forced order.

Acceptance criteria:

- A7.1: An identity LUT preserves test colors within a declared tolerance.
- A7.2: Invalid dimensions and missing assets fail before rendering.
- A7.3: Grading works offline and respects chain order, alpha, and HUD policy.

## A8: Basic 2D lighting

Add scene ambient light and point lights with position, color, intensity,
radius, and falloff. Render a bounded light set into a reusable light texture,
then multiply it over world color. Apply post-processing afterward and HUD
last. Define an unlit/emissive sprite option so glows can remain visible in dark
scenes. Use the same required/optional capability policy as effects.

Acceptance criteria:

- A8.1: Multiple colored lights combine predictably without affecting gameplay.
- A8.2: Emissive sprites, HUD, camera movement, and scene replacement follow
  the documented compositing and lifecycle rules.
- A8.3: Validate light-count limits and measure target memory and frame time
  at the configured maximum.

## Verification and delivery

Use public document, session, renderer, staging, and export boundaries. Extend
[frame tests](../../packages/game-renderer/tests/frame.test.ts),
[GPU effect tests](../../packages/game-renderer/tests/webgpu-effect.test.ts),
[export tests](../../packages/game-renderer/tests/build.test.ts),
[session tests](../../packages/game-runtime/tests/session.test.ts), and
[asset node tests](../../packages/game-nodes/tests/native-game-nodes.test.ts).
Reuse the GPU package's recipe, alpha, and color-grading tests for module
contracts. New assertions must fail on deliberately invalid fixtures.

Each phase supplies a small deterministic game fixture, browser verification,
and headless coverage where supported. Include device loss, scene replacement,
and disposal in tests for persistent resources. Measure software-adapter
correctness separately from hardware performance.

For code changes, build packages first, then run the
[mandatory repository checks](../../AGENTS.md#mandatory-post-change-verification).
Update [CLI guidance](../cli.md) and the
[native game skill](../../packages/system-skills/native-game/SKILL.md) when their
contracts change. Keep each action reviewable independently and split shared
protocol changes from later features when necessary.

## Deferred scope

Custom document shaders, HDR bloom, normal maps, shadow casting, positional
audio, and generated frame-consistent sprite sheets require separate designs.
Multiply/screen sprite blending remains a separate renderer extension. Shared
script storage, a collision spatial grid, and same-tick script reactions belong
to the simulation roadmap and are not prerequisites for these artistic tools.
