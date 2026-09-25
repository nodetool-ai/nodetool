# Serein build: feature coverage

One row for each item in [BRIEF.md](BRIEF.md) section 10. The status says
whether the NodeTool features behind the item worked, worked with a
workaround, or failed. The numbers in the notes point to
[DEFECTS.md](DEFECTS.md). Timeline `1336a629714e`, built by
[build.js](build.js).

The latest [local full validation](runs/2026-09-25-fixed/RESULTS.md) passes
format, all five hard cuts, and the independent picture score. It runs in a
fresh process, so the long-lived server failure in defect 12 remains untested.

## Automatic checks

| Item | Features | Status | Notes |
|---|---|---|---|
| Format 1920×1080, 30/1 fps, 780 frames | `render_timeline` | Worked | G1 passes on the local full export. |
| Hard cuts at 123, 245, 615, 642, 668 | Scene groups on one track, group opacity fades, `transitionIn` on groups | Workaround | The first export found 4 of 5 cuts (13). The local full export finds all five at the exact frames. |

## Checkpoints

| # | Frame | Features | Status | Notes |
|---|---|---|---|---|
| C1 | 40 | Group 3D transform (`rotationX`, `perspective`), `camera2d` depth of field, `repeater`, `dropShadow`, custom curves | Worked in later local export | The first server export drew orange with most cards missing (12). `serein-launch-fixed.mp4` shows the navy wall and counter at 314. Wall cards are leaf clips, not groups (5). The skeleton grid is five repeaters (3). The rotation sign is flipped (6). |
| C2 | 110 | `ticker` with `groupSeparator`, `stylize` glitch, `rgbSplit` adjustment, `effect.<id>.<field>` style tracks | Worked in later local export | The final local export shows the navy wall, counter at 2,847, and a visible RGB split. The wiggle is baked as per-frame curves (2). |
| C3 | 140 | Shape `trimEnd`, spring easing, `glow`, character stagger, screen-blend flash | Workaround | The mark and wordmark are placed by hand, not with a `row` layout (4). |
| C4 | 175 | Group opacity fade, radial `fillStyle` | Worked | |
| C5 | 225 | `scramble` text animator, `text.color` loop, `relative` layout with `fitText`, spinner loop | Worked | |
| C6 | 244 | `effect.sh.offsetY` style track, crossfade | Worked | |
| C7 | 262 | Group springs with a 1.2-frame stagger, board `rotationY` | Worked | |
| C8 | 330 | `ticker` with `prefix`, `fitText` pills, beat `pulse`, word stagger | Workaround | The board tilt holds only as an `out` animation (10). |
| C9 | 420 | `whip` group transition, `shape.height`/`shape.y` style tracks, `wipe` preset | Workaround | The header drop holds only as an `out` animation (10). |
| C10 | 480 | `gradientWipe` with a noise map, `typewriter` with a caret, `row` layout, spring pill | Workaround | A one-millisecond typewriter with a character stagger shows the caret in the final local export (8). The pill moves toward Warm at the checkpoint and holds through an `out` animation (10). |
| C11 | 530 | `followPath` with `orient`, `motionBlur`, `temporalEcho`, `fitText` toast | Workaround | The path is shifted to centre-relative units (9). |
| C12 | 604 | `iris` transition, `ticker` countdown, gradient `fill` on text, `particles` generator, `effect.gf.colorB` | Workaround | Particles need a black `colorA` and two layers (11). |
| C13 | 630 | Wall with a group `blur`, `vignette` adjustment, scale-and-blur slam | Worked | |
| C14 | 655 | `glitch` group transition, gradient text | Worked | |
| C15 | 740 | `lightLeak` generator, `fitText` CTA, gradient tagline | Worked | |
| C16 | 778 | Group opacity fade-out | Worked | |

## Harness

| Item | Status | Notes |
|---|---|---|
| Upload a generated document and read it in the sandbox | Workaround | The document is generated inside one `execute_code` action (1). |
| Preview and render speed | Worked after a fix | Before the fix, one frame took 164 s and the watchdog killed the server (7). |
