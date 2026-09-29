import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Regression coverage for three authoring traps in
 * `@nodetool-ai/sandbox-timeline`, found while porting the `serein` example
 * (see `scripts/example-timelines/serein.mjs` and the pack's own SKILL.md).
 * Imports `sandbox/index.js` directly, the same way
 * `sandbox-timeline-dts.test.ts` does, so this runs as a plain unit test
 * with no QuickJS guest or CodeAct session in the loop.
 *
 * F1: `clip.animate()` with an auto-detected (or explicit) "out" role must
 * place its window the same way `clip.exit()` does — `at`/`dur` measured
 * from the clip's own start, converted once to the compiler's
 * backward-from-end `delayMs`.
 * F2: `s.text(str, {fill})` must set the text's gradient/colour fill, the
 * same as `style: {fill}`; an unrecognized top-level text option must throw
 * rather than being silently dropped.
 * F3: a `rotation` curve in `enter()`/`exit()`/`animate()`/`loop()` must
 * take degrees, the same unit as the friendly `rotation` option on element
 * creation, converting to radians internally.
 */

const PACK_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "sandbox-packs",
  "sandbox-timeline"
);

async function loadVideo() {
  const mod: any = await import(/* @vite-ignore */ join(PACK_DIR, "sandbox", "index.js"));
  return mod.video as (options: any) => any;
}

describe("sandbox-timeline authoring traps", () => {
  it("F1: animate() with an auto-detected 'out' role plays at clip-local `at`, not `at` counted from the end", async () => {
    const video = await loadVideo();
    const v = video({ width: 100, height: 100, fps: 30 });
    const scene = v.scene("s", 2, (s: any) => {
      const clip = s.text("x", {});
      // opacity 1 -> 0 is exit-shaped: role auto-detects "out". `at: 0.2,
      // dur: 0.3` should play in [0.2s, 0.5s] of this clip's own 2s window,
      // the same as every other role — not backward from the clip's end.
      clip.animate({ opacity: [1, 0] }, { at: 0.2, dur: 0.3 });
    });
    v.series([scene]);
    const clip = v._document.clips.find((c: any) => c.mediaType === "text");
    expect(clip.animations).toHaveLength(1);
    const anim = clip.animations[0];
    expect(anim.role).toBe("out");
    // Compiler formula for role "out": windowEndMs = clipDurationMs - delayMs.
    const expectedWindowEndMs = Math.round(0.2 * 1000 + 0.3 * 1000);
    const expectedDelayMs = clip.durationMs - expectedWindowEndMs;
    expect(anim.delayMs).toBe(Math.max(0, expectedDelayMs));
  });

  it("F1: animate()'s 'out' delay matches exit()'s own delay for the same at/dur", async () => {
    const video = await loadVideo();
    const v = video({ width: 100, height: 100, fps: 30 });
    let animateDelay = 0;
    let exitDelay = 0;
    const scene = v.scene("s", 2, (s: any) => {
      const a = s.text("a", {});
      a.animate({ opacity: [1, 0] }, { at: 0.2, dur: 0.3 });
      animateDelay = a.animations[0].delayMs;
      const b = s.text("b", {});
      b.exit({ to: { opacity: 0 }, at: 0.2, dur: 0.3 });
      exitDelay = b.animations[0].delayMs;
    });
    v.series([scene]);
    expect(animateDelay).toBe(exitDelay);
  });

  it("F2: s.text(str, {fill}) sets textStyle.fill", async () => {
    const video = await loadVideo();
    const v = video({ width: 100, height: 100, fps: 30 });
    const gradient = { type: "linear", angle: 0, stops: [{ offset: 0, color: "#fff" }, { offset: 1, color: "#000" }] };
    const scene = v.scene("s", 1, (s: any) => {
      s.text("hello", { fill: gradient });
    });
    v.series([scene]);
    const clip = v._document.clips.find((c: any) => c.mediaType === "text");
    expect(clip.textStyle.fill).toEqual(gradient);
  });

  it("F2: an unrecognized top-level text() option throws, naming the option", async () => {
    const video = await loadVideo();
    const v = video({ width: 100, height: 100, fps: 30 });
    expect(() => {
      v.scene("s", 1, (s: any) => {
        s.text("hello", { stroke: "#fff" });
      });
    }).toThrow(/stroke/);
  });

  it("F3: a rotation curve in enter()/animate()/loop() takes degrees, converted to radians", async () => {
    const video = await loadVideo();
    const v = video({ width: 100, height: 100, fps: 30 });
    let enterClip: any, animateClip: any, loopClip: any;
    const scene = v.scene("s", 2, (s: any) => {
      enterClip = s.rect(10, 10, "#fff", {});
      enterClip.enter({ from: { rotation: 90 }, at: 0, dur: 0.2 });
      animateClip = s.rect(10, 10, "#fff", {});
      animateClip.animate({ rotation: [0, 180] }, { at: 0, dur: 0.2 });
      loopClip = s.rect(10, 10, "#fff", {});
      loopClip.loop({ rotation: [0, -360] }, 1);
    });
    v.series([scene]);
    const enterCurve = enterClip.animations[0].custom.curves.find((c: any) => c.property === "rotation");
    expect(enterCurve.keyframes[0].value).toBeCloseTo((90 * Math.PI) / 180, 5);
    const animateCurve = animateClip.animations[0].custom.curves.find((c: any) => c.property === "rotation");
    expect(animateCurve.keyframes[1].value).toBeCloseTo((180 * Math.PI) / 180, 5);
    const loopCurve = loopClip.animations[0].custom.curves.find((c: any) => c.property === "rotation");
    expect(loopCurve.keyframes[1].value).toBeCloseTo((-360 * Math.PI) / 180, 5);
  });

  it("F3: the friendly `rotation` option on element creation is unaffected (still degrees -> radians)", async () => {
    const video = await loadVideo();
    const v = video({ width: 100, height: 100, fps: 30 });
    const scene = v.scene("s", 1, (s: any) => {
      s.rect(10, 10, "#fff", { rotation: 45 });
    });
    v.series([scene]);
    const clip = v._document.clips.find((c: any) => c.mediaType === "shape");
    expect(clip.transform.rotation).toBeCloseTo((45 * Math.PI) / 180, 5);
  });
});
