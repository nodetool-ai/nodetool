#!/usr/bin/env node
// Writes the M1e scene fixtures into native/timeline/fixtures/:
//   scene-groups.json      nested groups, precomposites, a parent cycle,
//                          the scene camera, 2.5D transforms, a matte, a caption
//   scene-easing.json      every easing (named, cubic-bezier, spring, hold),
//                          every preset the native port has, roles, delays,
//                          loops, stepped time, repeaters, echoes, a
//                          source-time curve
//   scene-transitions.json every transition type with directions, colors,
//                          softness and eased progress, the auto dissolve,
//                          and a cut between two groups
//   scene-flex.json        flex groups (Yoga): directions, wrap, justify and
//                          align values, gaps, padding, percent and min/max
//                          sizes, basis, grow, shrink, margins, absolute
//                          children, nested and rotated containers, plain
//                          groups and path shapes as leaves, text leaves with
//                          spacing and alignment, animated text (ticker,
//                          scramble, font size), root anchors and a cycle
// The clips draw synthetic placeholders (shapes and asset-less videos), so the
// fixtures need no media. plan-conformance.mjs checks them with the rest.
//
// Usage: node native/timeline/scripts/make-scene-fixtures.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const SHAPE = { kind: "rect", x: 0.25, y: 0.25, width: 0.5, height: 0.5, fill: "#4a90d9" };

function track(id, index, type = "video") {
  return { id, name: id, type, index, visible: true, locked: false };
}

function clip(id, trackId, startMs, durationMs, extra = {}) {
  return {
    id,
    trackId,
    name: id,
    startMs,
    durationMs,
    mediaType: "shape",
    sourceType: "imported",
    status: "draft",
    locked: false,
    versions: [],
    shapeStyle: SHAPE,
    ...extra
  };
}

function group(id, trackId, startMs, durationMs, extra = {}) {
  const g = clip(id, trackId, startMs, durationMs, { mediaType: "group", ...extra });
  delete g.shapeStyle;
  return g;
}

function xf(x = 0, y = 0, sx = 1, sy = 1, rotation = 0, extra = {}) {
  return { position: { x, y }, scale: { x: sx, y: sy }, rotation, anchor: { x: 0.5, y: 0.5 }, ...extra };
}

function custom(id, role, durationMs, curves, extra = {}) {
  return { id, role, preset: "custom", durationMs, custom: { curves }, ...extra };
}

function curve(property, keyframes) {
  return { property, keyframes };
}

function sequence(id, name, durationMs, tracks, clips, extra = {}) {
  return {
    id,
    projectId: "native-prototype",
    name,
    fps: 30,
    width: 1920,
    height: 1080,
    durationMs,
    tracks,
    clips,
    markers: [],
    createdAt: "2026-10-24T00:00:00.000Z",
    updatedAt: "2026-10-24T00:00:00.000Z",
    ...extra
  };
}

function groupsFixture() {
  const tracks = [0, 1, 2, 3, 4, 5].map((i) => track(`t${i}`, i)).concat([track("ta", 6, "audio")]);
  const clips = [
    group("g_root", "t0", 0, 8000, {
      transform: xf(200, -100, 0.8, 0.8, 0.2),
      opacity: 0.9,
      animations: [custom("g_root_in", "in", 1000, [curve("offsetX", [{ t: 0, value: -300 }, { t: 1, value: 0, easing: "easeOutBack" }])])]
    }),
    group("g_mid", "t0", 500, 6500, {
      parentId: "g_root",
      transform: { ...xf(-150, 80, 1.2, 0.9, -0.3), anchor: { x: 0.25, y: 0.75 } },
      animations: [{ id: "g_mid_spin", role: "loop", preset: "rotate", durationMs: 2000 }]
    }),
    group("g_leaf", "t1", 1000, 5000, { parentId: "g_mid", blendMode: "multiply", opacity: 0.7, transform: xf(60, 40) }),
    group("g_cut", "t1", 2000, 4000, {
      parentId: "g_root",
      transitionIn: { type: "crossfade", durationMs: 800, easing: "easeInOut" },
      transform: xf(0, 0, 1.1, 1.1)
    }),
    group("g_3d", "t2", 0, 8000, { transform: xf(-300, 120, 1, 1, 0, { depthPx: 300, rotationY: 25, perspective: 1200 }) }),
    group("g_a", "t2", 0, 8000, { parentId: "g_b", transform: xf(10, 10) }),
    group("g_b", "t2", 0, 8000, { parentId: "g_a", transform: xf(-10, -10) }),
    clip("c_leaf", "t3", 1000, 4000, { parentId: "g_leaf", transform: xf(0, 0, 0.5, 0.5, 0.1) }),
    clip("c_mid_video", "t3", 2000, 5000, {
      mediaType: "video",
      parentId: "g_mid",
      width: 1280,
      height: 720,
      transform: xf(-200, 0, 0.6, 0.6),
      fadeInMs: 400,
      fadeOutMs: 600,
      fadeOutShape: "sCurve"
    }),
    clip("c_cut_a", "t4", 2000, 4000, {
      parentId: "g_cut",
      animations: [{ id: "c_cut_a_pop", role: "in", preset: "pop", durationMs: 600 }]
    }),
    clip("c_cut_b", "t5", 2500, 3000, { parentId: "g_cut", transform: xf(300, 200, 0.4, 0.4) }),
    clip("c_3d", "t4", 0, 8000, { parentId: "g_3d", transform: xf(100, 50, 0.5, 0.5, 0, { depthPx: -200 }) }),
    clip("c_camera", "t5", 0, 2400, { transform: xf(400, -200, 0.3, 0.3, 0, { depthPx: 150, rotationX: 30, perspective: 900 }) }),
    clip("c_no_transform", "t5", 6000, 2000),
    clip("c_cycle", "t3", 6000, 2000, { parentId: "g_a" }),
    clip("c_missing_parent", "t4", 0, 1000, { parentId: "no_such_group" }),
    clip("c_matted", "t2", 2000, 4000, { matte: { sourceClipId: "m_source", mode: "alpha" } }),
    clip("m_source", "t1", 3000, 1000, { hidden: true }),
    // Two precompositing groups with the same track, start and depth: the
    // surfaces keep the order the walk found them in (z_tie first), not the
    // lexical order of their ids.
    group("z_tie", "t5", 2400, 1000, { blendMode: "screen" }),
    group("a_tie", "t5", 2400, 1000, { blendMode: "screen" }),
    clip("z_tie_child", "t0", 2400, 1000, { parentId: "z_tie", transform: xf(-500, 300, 0.2, 0.2) }),
    clip("a_tie_child", "t3", 2400, 1000, { parentId: "a_tie", transform: xf(500, 300, 0.2, 0.2) }),
    clip("c_caption", "ta", 0, 8000, {
      mediaType: "audio",
      caption: {
        words: [
          { word: "one", startMs: 100, endMs: 500 },
          { word: "two", startMs: 600, endMs: 900 },
          { word: "three", startMs: 3000, endMs: 3500 }
        ]
      }
    })
  ];
  return sequence("seq-scene-groups", "Scene groups", 8000, tracks, clips, {
    camera2d: {
      position: { x: 50, y: -20 },
      depthPx: 0,
      focalLengthPx: 1000,
      keyframes: [
        { timeMs: 0, position: { x: 0, y: 0 }, depthPx: 0 },
        { timeMs: 4000, position: { x: 120, y: 60 }, depthPx: 150, aperturePx: 20 },
        { timeMs: 8000, position: { x: 200, y: 100 }, depthPx: 300 }
      ]
    }
  });
}

const EASINGS = [
  "linear", "easeIn", "easeOut", "easeInOut", "easeOutBack", "easeOutElastic", "easeOutBounce", "easeInExpo",
  "easeOutExpo", "easeInOutExpo", "easeInQuint", "easeOutQuint", "easeInOutQuint", "easeInCirc", "easeOutCirc",
  "easeInOutCirc", "hold", "cubic-bezier(0.65,0,0.35,1)", "cubic-bezier(0.16,1,0.3,1)", "cubic-bezier(0.5,-0.4,0.5,1.4)",
  "spring(190,18,1)", "spring(100,20,1)", "spring(100,40,1)", "spring(260,14,1)", "notAnEasing(1)"
];

const PRESETS = [
  ["fade", "in"], ["fade", "out"], ["slide", "in", { direction: "up", distance: 0.2 }], ["slide", "out", { direction: "right" }],
  ["pop", "in"], ["pop", "out", { overshoot: 1.2 }], ["spin", "in", { turns: 0.5 }], ["wipe", "in", { direction: "down" }],
  ["blur", "in"], ["colorFade", "out"], ["pulse", "emphasis"], ["flash", "emphasis"],
  ["shake", "emphasis", { intensity: 0.05, frequency: 6, seed: 7, fadeInMs: 100, fadeOutMs: 100 }],
  ["bounce", "emphasis"], ["squash", "emphasis"], ["kenBurns", "loop", { zoom: 0.3, direction: "out" }],
  ["float", "loop", { seed: 3, frequency: 2 }], ["float", "loop"], ["breathe", "loop"], ["rotate", "loop", { direction: "ccw" }],
  ["hueShift", "loop"], ["typewriter", "in"], ["spin", "loop"]
];

function easingFixture() {
  const tracks = [];
  const clips = [];
  let row = 0;
  const add = (c) => {
    tracks.push(track(`e${row}`, row));
    clips.push({ ...c, trackId: `e${row}` });
    row += 1;
  };
  EASINGS.forEach((easing, i) => {
    add(clip(`ease_${i}`, "", 0, 4000, {
      transform: xf(-800 + (i % 8) * 220, -400 + Math.floor(i / 8) * 250, 0.15, 0.15),
      animations: [
        custom(`ease_${i}_in`, "in", 1500, [
          curve("offsetY", [{ t: 0, value: 300 }, { t: 0.6, value: -40, easing }, { t: 1, value: 0, easing }]),
          curve("scale", [{ t: 0.2, value: 0.2 }, { t: 1, value: 1, easing }])
        ], { delayMs: 200 }),
        custom(`ease_${i}_out`, "out", 1000, [curve("opacity", [{ t: 0, value: 1 }, { t: 1, value: 0, easing }])])
      ]
    }));
  });
  PRESETS.forEach(([preset, role, params], i) => {
    add(clip(`preset_${i}`, "", 0, 5000, {
      transform: xf(-800 + (i % 8) * 220, 200 + Math.floor(i / 8) * 150, 0.12, 0.12, 0.3),
      animations: [{ id: `preset_${i}_a`, role, preset, durationMs: 1200, delayMs: role === "loop" ? -300 : 400, ...(params ? { params } : {}) }]
    }));
  });
  // An animation easing override, a keyframed emphasis over the whole clip,
  // replace channels (position, anchor), a disabled animation, rotationX/Y.
  add(clip("override", "", 500, 3000, {
    transform: xf(0, 0, 0.3, 0.3, 0, { rotationX: 10 }),
    animations: [
      custom("override_a", "in", 800, [curve("rotation", [{ t: 0, value: -1 }, { t: 1, value: 0 }])], { easing: "easeOutExpo" }),
      custom("keyed", "emphasis", 100, [
        curve("positionX", [{ t: 0, value: -500 }, { t: 0.5, value: 300, easing: "spring(170,17,1)" }, { t: 1, value: 0 }]),
        curve("anchorY", [{ t: 0, value: 0.2 }, { t: 1, value: 0.8, easing: "easeInOut" }]),
        curve("rotationY", [{ t: 0, value: 0 }, { t: 1, value: 40 }])
      ], { params: { keyframed: true } }),
      custom("off", "in", 500, [curve("opacity", [{ t: 0, value: 0 }, { t: 1, value: 1 }])], { enabled: false })
    ]
  }));
  // Stepped time at 8 fps.
  add(clip("stepped", "", 0, 4000, {
    transform: xf(500, 0, 0.2, 0.2),
    steppedTime: { fps: 8 },
    animations: [custom("stepped_a", "loop", 1000, [curve("rotation", [{ t: 0, value: 0 }, { t: 1, value: 6.283 }])])]
  }));
  // Media identity and the source clock: a generated clip shows its asset;
  // stepped time also steps the source time a decoder seeks to.
  add(clip("asset_video", "", 0, 3000, {
    mediaType: "video",
    status: "generated",
    currentAssetId: "0123456789abcdef0123456789abcdef",
    inPointMs: 500,
    transform: xf(-300, -350, 0.2, 0.2)
  }));
  add(clip("stepped_video", "", 200, 3000, {
    mediaType: "video",
    status: "stale",
    currentAssetId: "fedcba9876543210fedcba9876543210",
    steppedTime: { fps: 6 },
    speedMultiplier: 0.75,
    transform: xf(300, -350, 0.2, 0.2)
  }));
  // A repeater grid with a time step and a color step, and an echo.
  add(clip("repeated", "", 300, 3000, {
    transform: xf(-600, 300, 0.1, 0.1),
    repeater: { count: 6, columns: 3, positionStep: { x: 120, y: 0 }, rowStep: { x: 0, y: 120 }, timeStepMs: 150, colorStep: { hueDegrees: 30 } },
    animations: [{ id: "repeated_pop", role: "in", preset: "pop", durationMs: 500 }]
  }));
  add(clip("echoed", "", 200, 3000, {
    transform: xf(600, -300, 0.1, 0.1),
    opacity: 0.8,
    temporalEcho: { copies: 3, intervalMs: 120, opacityDecay: 0.6 },
    animations: [custom("echoed_a", "loop", 900, [curve("offsetX", [{ t: 0, value: -200 }, { t: 0.5, value: 200 }, { t: 1, value: -200 }])])]
  }));
  // A curve on the source clock: in point and speed move it.
  add(clip("sourced", "", 1000, 3000, {
    mediaType: "video",
    inPointMs: 2000,
    speedMultiplier: 1.5,
    transform: xf(0, 350, 0.2, 0.2),
    animations: [{
      id: "sourced_a",
      role: "emphasis",
      preset: "custom",
      durationMs: 3000,
      custom: { timeBase: "source", curves: [curve("scale", [{ t: 0, sourceMs: 2000, value: 0.5 }, { t: 0, sourceMs: 5000, value: 1.5, easing: "easeInOut" }, { t: 0, sourceMs: 6000, value: 1 }])] }
    }]
  }));
  // A staggered text animation folds no motion at block level; a typewriter.
  add(clip("staggered", "", 0, 3000, {
    mediaType: "text",
    textStyle: { text: "three short words", fontFamily: "Inter", fontSizePx: 64, color: "#ffffff" },
    animations: [{ id: "stag", role: "in", preset: "slide", durationMs: 400, stagger: { unit: "word", offsetMs: 120 } },
      { id: "stag_op", role: "in", preset: "fade", durationMs: 400, stagger: { unit: "character", offsetMs: 30, from: "center" } }]
  }));
  return sequence("seq-scene-easing", "Scene easing and presets", 5000, tracks, clips);
}

function transitionsFixture() {
  const types = [
    { type: "crossfade", durationMs: 600 },
    { type: "crossfade", durationMs: 600, easing: "spring(200,12,1)" },
    { type: "dipToColor", durationMs: 800, color: "#ff0000" },
    { type: "wipe", durationMs: 600, direction: "up", softness: 0.2 },
    { type: "wipe", durationMs: 600, direction: "sideways" },
    { type: "push", durationMs: 700, direction: "right", easing: "easeOutExpo" },
    { type: "push", durationMs: 700, direction: "down" },
    { type: "slide", durationMs: 700, direction: "left" },
    { type: "whip", durationMs: 500, direction: "up", blur: 30 },
    { type: "zoom", durationMs: 600 },
    { type: "zoomBlur", durationMs: 600, easing: "cubic-bezier(0.16,1,0.3,1)" },
    { type: "glitch", durationMs: 500 },
    { type: "gradientWipe", durationMs: 600, direction: "left", map: "radial" },
    { type: "iris", durationMs: 600, softness: 0.3 },
    { type: "lightLeak", durationMs: 600, color: "#ffaa00" },
    { type: "spiral", durationMs: 600 },
    { type: "crossfade", durationMs: 0 }
  ];
  const tracks = [];
  const clips = [];
  types.forEach((tr, i) => {
    tracks.push(track(`x${i}`, i));
    const y = -450 + i * 55;
    clips.push(clip(`out_${i}`, `x${i}`, 0, 2000, { transform: xf(-200, y, 0.2, 0.05) }));
    clips.push(clip(`in_${i}`, `x${i}`, 1500, 2000, { transform: xf(200, y, 0.2, 0.05), transitionIn: tr }));
  });
  // The auto dissolve: overlap with no transitionIn.
  tracks.push(track("auto", types.length));
  clips.push(clip("auto_a", "auto", 0, 2000, { mediaType: "video" }));
  clips.push(clip("auto_b", "auto", 1200, 2000, { mediaType: "video", width: 800, height: 800 }));
  // A cut between two sibling groups, which precomposites both.
  tracks.push(track("gx", types.length + 1));
  tracks.push(track("gc", types.length + 2));
  clips.push(group("ga", "gx", 0, 2000, { transform: xf(0, 300, 0.5, 0.5) }));
  clips.push(group("gb", "gx", 1500, 2000, { transform: xf(0, 300, 0.5, 0.5, 0.4), transitionIn: { type: "push", durationMs: 800, direction: "left" } }));
  clips.push(clip("ga_child", "gc", 0, 2000, { parentId: "ga" }));
  clips.push(clip("gb_child", "gc", 1500, 2000, { parentId: "gb" }));
  return sequence("seq-scene-transitions", "Scene transitions", 3500, tracks, clips);
}

function text(id, trackId, startMs, durationMs, textStyle, extra = {}) {
  const t = clip(id, trackId, startMs, durationMs, { mediaType: "text", textStyle: { color: "#ffffff", fontSizePx: 48, ...textStyle }, ...extra });
  delete t.shapeStyle;
  return t;
}

function flexFixture() {
  const tracks = [track("f0", 0), track("f1", 1), track("f2", 2), track("f3", 3)];
  const flex = (layout) => ({ layout: { display: "flex", ...layout } });
  const rect = (w, h, extra = {}) => ({ shapeStyle: { kind: "rect", width: w, height: h, fill: "#4a90d9" }, ...extra });
  const clips = [
    // Row: wrap, space-between, padding object, percent width, gaps.
    group("row", "f0", 0, 4000, { transform: xf(-300, -200), ...flex({ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between",
      alignItems: "center", alignContent: "space-around", gap: 12, rowGap: 20, padding: { top: 10, left: 30, right: 5 }, width: "60%", height: 400 }) }),
    clip("row_a", "f1", 0, 4000, { parentId: "row", ...rect(0.1, 0.1), flexItem: { grow: 1, basis: 100 } }),
    clip("row_b", "f1", 0, 4000, { parentId: "row", ...rect(0.2, 0.05), flexItem: { shrink: 2, basis: "30%", margin: { left: 8, top: 4 } } }),
    clip("row_c", "f1", 0, 4000, { parentId: "row", shapeStyle: { kind: "ellipse", width: 0.15, height: 0.15, fill: "#d94a4a" }, flexItem: { alignSelf: "flex-end", width: "25%" } }),
    clip("row_d", "f1", 0, 4000, { parentId: "row", ...rect(0.3, 0.1), flexItem: { position: "absolute", inset: { top: 5, right: 7 } } }),
    clip("row_e", "f1", 0, 4000, { parentId: "row", ...rect(0.05, 0.05), transform: xf(40, 30), flexItem: { position: "absolute" } }),
    text("row_t", "f1", 0, 4000, { text: "Wrapped title over a few words", fontSizePx: 40, letterSpacingPx: 2, lineHeight: 1.4, align: "left" },
      { parentId: "row", flexItem: { basis: "40%" } }),
    // Column: space-evenly, baseline, min/max, a nested row rotated, a plain group leaf, path leaves.
    group("col", "f0", 0, 4000, { transform: xf(400, 50, 0.9, 0.9, 0.1, { anchor: { x: 0, y: 0 } }), ...flex({ flexDirection: "column",
      justifyContent: "space-evenly", alignItems: "baseline", padding: 16, minWidth: 300, maxWidth: "40%", minHeight: 500 }) }),
    group("col_n", "f2", 0, 4000, { parentId: "col", transform: xf(0, 0, 1, 1, 0.3), ...flex({ justifyContent: "flex-end", alignItems: "stretch",
      columnGap: 9, width: "80%", maxHeight: 200 }), flexItem: { margin: 6 } }),
    clip("col_n1", "f3", 0, 4000, { parentId: "col_n", ...rect(0.08, 0.2) }),
    text("col_n2", "f3", 0, 4000, { text: "Right\naligned", align: "right", verticalAlign: "top" }, { parentId: "col_n" }),
    group("col_p", "f2", 0, 4000, { parentId: "col", transform: xf(10, 0) }),
    clip("col_p1", "f3", 0, 4000, { parentId: "col_p", ...rect(0.1, 0.1), transform: xf(-50, 20, 1.2, 1.2, 0.4) }),
    clip("col_p2", "f3", 0, 4000, { parentId: "col_p", ...rect(0.05, 0.2), transform: xf(80, -40) }),
    clip("col_path", "f2", 0, 4000, { parentId: "col", shapeStyle: { kind: "path", d: "M0.1 0.1 L0.3 0.12 Q0.4 0.3 0.25 0.35 A0.05 0.08 30 1 0 0.12 0.2 Z", fill: "#888888" } }),
    clip("col_path2", "f2", 0, 4000, { parentId: "col", shapeStyle: { kind: "path", d: "m 0.5 0.5 h 0.1 v 0.1 c 0.02 0.05 -0.05 0.05 -0.1 0 s -0.02 -0.1 0 -0.1 t 0.05 0.02 z", width: 0.2, height: 0.1, fill: "#888888" }, flexItem: { height: 60 } }),
    clip("col_v", "f2", 0, 4000, { parentId: "col", mediaType: "video", width: 1280, height: 720, flexItem: { width: 240, height: 135 } }),
    // Animated text: a ticker, a scramble and a font-size track move their siblings.
    group("anim", "f0", 0, 4000, { transform: xf(0, 350), ...flex({ flexDirection: "row", justifyContent: "space-around", alignItems: "flex-end", gap: 24 }) }),
    text("anim_tick", "f1", 0, 4000, { text: "0" }, { parentId: "anim", animations: [{ id: "tick", role: "in", preset: "custom", durationMs: 2000,
      delayMs: 200, easing: "easeOutExpo", custom: { curves: [] }, textAnimator: { kind: "ticker", from: 0, to: 1234567.5, decimals: 0, groupSeparator: ",", prefix: "$", padTo: 4 } }] }),
    text("anim_tick2", "f1", 0, 4000, { text: "0" }, { parentId: "anim", animations: [{ id: "tick2", role: "in", preset: "custom", durationMs: 1500,
      custom: { curves: [] }, textAnimator: { kind: "ticker", from: -3, to: 2.5, decimals: 2, suffix: " %" } }] }),
    text("anim_scr", "f1", 0, 4000, { text: "DECODE ME" }, { parentId: "anim", animations: [{ id: "scr", role: "in", preset: "custom", durationMs: 900,
      easing: "easeOut", custom: { curves: [] }, textAnimator: { kind: "scramble", seed: 4, charset: "#%&@" } }] }),
    text("anim_size", "f1", 0, 4000, { text: "Grow" }, { parentId: "anim", animations: [{ id: "size", role: "in", preset: "custom", durationMs: 1200,
      custom: { curves: [curve("opacity", [{ t: 0, value: 1 }, { t: 1, value: 1 }])] }, styleTracks: [
        { target: "text.fontSizePx", keyframes: [{ t: 0, value: 20 }, { t: 0.6, value: 90, easing: "easeOutBack" }, { t: 1, value: 64 }] },
        { target: "text.letterSpacingPx", keyframes: [{ t: 0, value: 12 }, { t: 1, value: 0, easing: "easeIn" }] },
        { target: "text.lineHeight", keyframes: [{ t: 0, value: 2 }, { t: 1, value: 1.1 }] }] }] }),
    clip("anim_box", "f1", 0, 4000, { parentId: "anim", ...rect(0.05, 0.05), flexItem: { grow: 1, height: 30 } }),
    // Overflow: children with no `shrink` shrink (the CSS default of 1).
    group("tight", "f0", 0, 4000, { transform: xf(500, -400), ...flex({ flexDirection: "row", width: 200, height: 80 }) }),
    clip("tight_a", "f1", 0, 4000, { parentId: "tight", ...rect(0.1, 0.05), flexItem: { width: 150 } }),
    clip("tight_b", "f1", 0, 4000, { parentId: "tight", ...rect(0.1, 0.05), flexItem: { width: 150, margin: 5 } }),
    text("tight_t", "f1", 0, 4000, { text: "A long caption that cannot fit", fontSizePx: 24 }, { parentId: "tight" }),
    // A flex root inside a plain group, and a parent cycle (no root at all).
    group("outer", "f0", 0, 4000, { transform: xf(-500, 300, 0.5, 0.5) }),
    group("inner", "f2", 0, 4000, { parentId: "outer", transform: xf(100, 0), ...flex({ flexDirection: "column", gap: 4, height: "30%" }) }),
    clip("inner_a", "f3", 0, 4000, { parentId: "inner", ...rect(0.1, 0.03), flexItem: { grow: 2 } }),
    clip("inner_b", "f3", 0, 4000, { parentId: "inner", ...rect(0.1, 0.03), flexItem: { grow: 1 } }),
    group("cyc_a", "f2", 0, 4000, { parentId: "cyc_b", ...flex({}) }),
    group("cyc_b", "f2", 0, 4000, { parentId: "cyc_a", ...flex({}) }),
    clip("cyc_c", "f3", 0, 4000, { parentId: "cyc_a", ...rect(0.1, 0.1) })
  ];
  return sequence("seq-scene-flex", "Scene flex layout", 4000, tracks, clips);
}

const out = path.join(root, "fixtures");
for (const [name, doc] of [
  ["scene-groups.json", groupsFixture()],
  ["scene-easing.json", easingFixture()],
  ["scene-transitions.json", transitionsFixture()],
  ["scene-flex.json", flexFixture()]
]) {
  fs.writeFileSync(path.join(out, name), `${JSON.stringify(doc, null, 2)}\n`);
  console.log(`wrote fixtures/${name}: ${doc.clips.length} clips`);
}
