// The shipped example compositions, as data.
//
// A composition is a group clip plus its children with named parameters —
// `packages/timeline/src/composition.ts` is the model. The catalogue covers the five
// text tiers `packages/system-skills/caption-titles/SKILL.md` locks: T1 title
// and end card, T2 lower third, T3 captions, T4 callouts, T5 CTA, plus a logo
// sting built on the T1 tier.
//
// Everything is authored against a 1920x1080 reference. Font sizes are sequence
// pixels, so each tier is stated here as a fraction of that height and rounded
// once; `transform.position` is an offset in the same pixels from the frame
// centre, positive y downward.
//
// Children are listed back to front, and each declares a template track — a
// name, not a document id. Two clips overlapping on one track auto-dissolve
// into each other, so a plate and the text over it must sit on tracks of their
// own; `insert_composition` maps each template track onto a document track,
// front-most first so it lands on top.

const REF_W = 1920;
const REF_H = 1080;

/** The five text tiers, as fractions of frame height. */
export const TEXT_TIERS = {
  title: 0.11,
  lowerThird: 0.056,
  caption: 0.046,
  callout: 0.039,
  cta: 0.061,
  /** The secondary line under a T1 or T2 element. */
  sub: 0.034
};

const px = (fraction) => Math.round(fraction * REF_H);

/** A frame-relative point as the offset `transform.position` takes. */
const at = (xFrac, yFrac) => ({
  position: {
    x: Math.round((xFrac - 0.5) * REF_W),
    y: Math.round((yFrac - 0.5) * REF_H)
  },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 }
});

// Authored text and shapes are `imported`: nothing generates them, and
// `generated` with no workflow or prompt behind it is a validator warning.
const clip = (over) => ({
  sourceType: "imported",
  status: "generated",
  locked: false,
  versions: [],
  ...over
});

const shape = (id, track, startMs, durationMs, shapeStyle, over = {}) =>
  clip({
    id,
    trackId: track,
    name: id,
    startMs,
    durationMs,
    mediaType: "shape",
    shapeStyle,
    ...over
  });

const text = (id, track, startMs, durationMs, textStyle, over = {}) =>
  clip({
    id,
    trackId: track,
    name: id,
    startMs,
    durationMs,
    mediaType: "text",
    textStyle,
    ...over
  });

const anim = (id, role, preset, durationMs, over = {}) => ({
  id,
  role,
  preset,
  durationMs,
  ...over
});

const group = (name, durationMs, track = "Plate") =>
  clip({
    id: "group",
    trackId: track,
    name,
    startMs: 0,
    durationMs,
    mediaType: "group"
  });

const MOTION_COMPOSITIONS = [
  {
    slug: "title-slam",
    name: "Title slam",
    description: "An exponential title entrance with a settling scale and accent rule.",
    group: group("Title slam", 3000),
    children: [
      shape("Rule", "Accent", 0, 3000, {
        kind: "rect", fill: "#B5FF55", x: 0.35, y: 0.64, width: 0.3, height: 0.012
      }, { animations: [anim("slam-rule", "in", "slide", 420, {
        delayMs: 140, easing: "easeOutExpo", params: { direction: "right", distance: 0.12 }
      })] }),
      text("Title", "Text", 0, 3000, {
        text: "MAKE IT MOVE", fontFamily: "Space Grotesk", fontSizePx: 142,
        fontWeight: 600, color: "#FFFFFF", align: "center", maxWidthFrac: 0.85
      }, { animations: [
        anim("slam-in", "in", "pop", 480, { easing: "easeOutExpo", params: { overshoot: 1.04 } }),
        anim("slam-out", "out", "fade", 250)
      ] })
    ],
    params: {
      title: { type: "string", default: "MAKE IT MOVE", path: "/1/textStyle/text" },
      accentColor: { type: "color", default: "#B5FF55", path: "/0/shapeStyle/fill" }
    }
  },
  {
    slug: "word-cards",
    name: "Word cards",
    description: "Three typographic cards entering four frames apart at 30 fps.",
    group: group("Word cards", 3200),
    children: ["MAKE", "IT", "MOVE"].map((word, index) => text(
      `Word${index + 1}`, `Word${index + 1}`, 0, 3200,
      { text: word, fontFamily: "Space Grotesk", fontSizePx: 80, fontWeight: 600,
        color: "#101418", align: "center", maxWidthFrac: 0.25,
        background: { color: "#B5FF55", paddingPx: 32, radiusPx: 16 } },
      { transform: at(0.21 + index * 0.29, 0.5), animations: [
        anim(`word-${index}-in`, "in", "pop", 460, {
          delayMs: index * 4000 / 30, easing: "spring(180,18,1)"
        }),
        anim(`word-${index}-out`, "out", "fade", 250)
      ] }
    )),
    params: Object.fromEntries(["MAKE", "IT", "MOVE"].map((word, index) => [
      `word${index + 1}`, { type: "string", default: word, path: `/${index}/textStyle/text` }
    ]))
  },
  {
    slug: "window-frame",
    name: "Window frame",
    description: "A rounded product window with a title bar and an editable content plate.",
    group: group("Window frame", 5000),
    children: [
      shape("Frame", "Frame", 0, 5000, {
        kind: "rect", fill: "#282D38", x: 0.14, y: 0.13, width: 0.72, height: 0.74,
        cornerRadius: 0.024, stroke: "#667084", strokeWidthPx: 2
      }),
      shape("Content", "Content", 0, 5000, {
        kind: "rect", fill: "#101418", x: 0.155, y: 0.225, width: 0.69, height: 0.62,
        cornerRadius: 0.014
      }),
      text("Title", "Title", 0, 5000, {
        text: "Your product", fontFamily: "Inter", fontSizePx: 32, fontWeight: 500,
        color: "#D2D9E5", align: "center", maxWidthFrac: 0.5
      }, { transform: at(0.5, 0.177) })
    ],
    params: {
      title: { type: "string", default: "Your product", path: "/2/textStyle/text" },
      contentColor: { type: "color", default: "#101418", path: "/1/shapeStyle/fill" },
      frameColor: { type: "color", default: "#282D38", path: "/0/shapeStyle/fill" }
    }
  },
  {
    slug: "number-ticker",
    name: "Number ticker",
    description: "A formatted numeric counter with an exponential finish and a caption.",
    group: group("Number ticker", 3500),
    children: [
      text("Value", "Value", 0, 3500, {
        text: "00", fontFamily: "JetBrains Mono", fontSizePx: 160,
        fontWeight: 600, color: "#B5FF55", align: "center", maxWidthFrac: 0.8
      }, { transform: at(0.5, 0.44), animations: [anim("ticker", "emphasis", "custom", 1600, {
        easing: "easeOutExpo", textAnimator: { kind: "ticker", from: 0, to: 100, decimals: 0, padTo: 2, suffix: "%" }
      })] }),
      text("Label", "Label", 0, 3500, {
        text: "Made by you", fontFamily: "Inter", fontSizePx: 40,
        fontWeight: 500, color: "#FFFFFF", align: "center", maxWidthFrac: 0.8
      }, { transform: at(0.5, 0.62) })
    ],
    params: {
      value: { type: "number", default: 100, path: "/0/animations/0/textAnimator/to" },
      suffix: { type: "string", default: "%", path: "/0/animations/0/textAnimator/suffix" },
      label: { type: "string", default: "Made by you", path: "/1/textStyle/text" }
    }
  }
];

export const EXAMPLE_COMPOSITIONS = [
  ...MOTION_COMPOSITIONS,
  {
    slug: "title-card",
    name: "Title card",
    description:
      "A full-frame opening title over a solid ground, with a secondary line. T1.",
    durationMs: 4000,
    group: group("Title card", 4000),
    children: [
      shape("Ground", "Plate", 0, 4000, {
        kind: "rect",
        fill: "#0B0B0F",
        x: 0,
        y: 0,
        width: 1,
        height: 1
      }),
      text(
        "Title",
        "Text",
        200,
        3600,
        {
          text: "Title",
          fontSizePx: px(TEXT_TIERS.title),
          color: "#FFFFFF",
          align: "center",
          maxWidthFrac: 0.78,
          fontWeight: 600
        },
        {
          transform: at(0.5, 0.47),
          animations: [
            anim("title-card-title-in", "in", "slide", 600, {
              params: { direction: "up", distance: 0.04 }
            }),
            anim("title-card-title-out", "out", "fade", 400)
          ]
        }
      ),
      text(
        "Subtitle",
        "Subtext",
        500,
        3300,
        {
          text: "Subtitle",
          fontSizePx: px(TEXT_TIERS.sub),
          color: "#C7CCD6",
          align: "center",
          maxWidthFrac: 0.66
        },
        {
          transform: at(0.5, 0.58),
          animations: [
            anim("title-card-sub-in", "in", "fade", 500, { delayMs: 250 }),
            anim("title-card-sub-out", "out", "fade", 400)
          ]
        }
      )
    ],
    params: {
      title: { type: "string", default: "Title", path: "/1/textStyle/text" },
      subtitle: {
        type: "string",
        default: "Subtitle",
        path: "/2/textStyle/text"
      },
      backgroundColor: {
        type: "color",
        default: "#0B0B0F",
        path: "/0/shapeStyle/fill"
      },
      textColor: { type: "color", default: "#FFFFFF", path: "/1/textStyle/color" }
    }
  },

  {
    slug: "lower-third",
    name: "Lower third",
    description:
      "A name and role on an accent bar in the lower left. T2 — arrives after a person does and holds a few seconds.",
    durationMs: 3500,
    group: group("Lower third", 3500),
    children: [
      shape("Bar", "Plate", 0, 3500, {
        kind: "rect",
        fill: "#0A84FF",
        x: 0.1,
        y: 0.7,
        width: 0.42,
        height: 0.16,
        cornerRadius: 0.008
      }),
      text(
        "Name",
        "Text",
        150,
        3350,
        {
          text: "Name",
          fontSizePx: px(TEXT_TIERS.lowerThird),
          color: "#FFFFFF",
          align: "center",
          maxWidthFrac: 0.36,
          fontWeight: 600
        },
        {
          transform: at(0.31, 0.745),
          animations: [
            anim("lower-third-name-in", "in", "slide", 450, {
              params: { direction: "right", distance: 0.05 }
            }),
            anim("lower-third-name-out", "out", "fade", 350)
          ]
        }
      ),
      text(
        "Role",
        "Subtext",
        250,
        3250,
        {
          text: "Role",
          fontSizePx: px(TEXT_TIERS.sub),
          color: "#EAF3FF",
          align: "center",
          maxWidthFrac: 0.36
        },
        {
          transform: at(0.31, 0.815),
          animations: [
            anim("lower-third-role-in", "in", "fade", 400, { delayMs: 150 }),
            anim("lower-third-role-out", "out", "fade", 350)
          ]
        }
      )
    ],
    params: {
      name: { type: "string", default: "Name", path: "/1/textStyle/text" },
      role: { type: "string", default: "Role", path: "/2/textStyle/text" },
      accentColor: {
        type: "color",
        default: "#0A84FF",
        path: "/0/shapeStyle/fill"
      },
      textColor: { type: "color", default: "#FFFFFF", path: "/1/textStyle/color" }
    }
  },

  {
    slug: "caption-bar",
    name: "Caption bar",
    description:
      "One caption line on a dark scrim across the lower frame. T3 — one idea per frame.",
    durationMs: 2500,
    group: group("Caption bar", 2500),
    children: [
      shape(
        "Scrim",
        "Plate",
        0,
        2500,
        {
          kind: "rect",
          fill: "#000000",
          x: 0.12,
          y: 0.775,
          width: 0.76,
          height: 0.13,
          cornerRadius: 0.01
        },
        { opacity: 0.65 }
      ),
      text(
        "Caption",
        "Text",
        0,
        2500,
        {
          text: "Caption line",
          fontSizePx: px(TEXT_TIERS.caption),
          color: "#FFFFFF",
          align: "center",
          maxWidthFrac: 0.7
        },
        {
          transform: at(0.5, 0.84),
          animations: [
            anim("caption-bar-in", "in", "fade", 250),
            anim("caption-bar-out", "out", "fade", 250)
          ]
        }
      )
    ],
    params: {
      text: {
        type: "string",
        default: "Caption line",
        path: "/1/textStyle/text"
      },
      scrimColor: {
        type: "color",
        default: "#000000",
        path: "/0/shapeStyle/fill"
      },
      textColor: { type: "color", default: "#FFFFFF", path: "/1/textStyle/color" }
    }
  },

  {
    slug: "callout",
    name: "Callout",
    description:
      "A small plate in the upper right that names what is on screen. T4.",
    durationMs: 3000,
    group: group("Callout", 3000),
    children: [
      shape("Plate", "Plate", 0, 3000, {
        kind: "rect",
        fill: "#111827",
        x: 0.58,
        y: 0.18,
        width: 0.34,
        height: 0.14,
        cornerRadius: 0.016
      }),
      text(
        "Callout",
        "Text",
        100,
        2900,
        {
          text: "Callout",
          fontSizePx: px(TEXT_TIERS.callout),
          color: "#FFFFFF",
          align: "center",
          maxWidthFrac: 0.28
        },
        {
          transform: at(0.75, 0.25),
          animations: [
            anim("callout-in", "in", "pop", 400, { params: { overshoot: 0.2 } }),
            anim("callout-out", "out", "fade", 300)
          ]
        }
      )
    ],
    params: {
      text: { type: "string", default: "Callout", path: "/1/textStyle/text" },
      plateColor: {
        type: "color",
        default: "#111827",
        path: "/0/shapeStyle/fill"
      },
      textColor: { type: "color", default: "#FFFFFF", path: "/1/textStyle/color" }
    }
  },

  {
    slug: "cta-end-card",
    name: "CTA end card",
    description:
      "The closing card: one instruction over a full-frame ground, underlined in the accent colour. T5 — one CTA, at the end.",
    durationMs: 4000,
    group: group("CTA end card", 4000),
    children: [
      shape("Ground", "Plate", 0, 4000, {
        kind: "rect",
        fill: "#0B0B0F",
        x: 0,
        y: 0,
        width: 1,
        height: 1
      }),
      shape(
        "Underline",
        "Accent",
        400,
        3600,
        {
          kind: "rect",
          fill: "#FF375F",
          x: 0.4,
          y: 0.615,
          width: 0.2,
          height: 0.012
        },
        {
          animations: [
            anim("cta-underline-in", "in", "slide", 500, {
              delayMs: 200,
              params: { direction: "right", distance: 0.06 }
            })
          ]
        }
      ),
      text(
        "CTA",
        "Text",
        200,
        3800,
        {
          text: "Try it free",
          fontSizePx: px(TEXT_TIERS.cta),
          color: "#FFFFFF",
          align: "center",
          maxWidthFrac: 0.7,
          fontWeight: 600
        },
        {
          transform: at(0.5, 0.52),
          animations: [
            anim("cta-text-in", "in", "fade", 400),
            anim("cta-text-out", "out", "fade", 400)
          ]
        }
      )
    ],
    params: {
      text: { type: "string", default: "Try it free", path: "/2/textStyle/text" },
      accentColor: {
        type: "color",
        default: "#FF375F",
        path: "/1/shapeStyle/fill"
      },
      backgroundColor: {
        type: "color",
        default: "#0B0B0F",
        path: "/0/shapeStyle/fill"
      },
      textColor: { type: "color", default: "#FFFFFF", path: "/2/textStyle/color" }
    }
  },

  {
    slug: "logo-sting",
    name: "Logo sting",
    description:
      "A wordmark resolving out of a blur over a solid ground, with an accent rule. T1 tier, used as a bumper.",
    durationMs: 3000,
    group: group("Logo sting", 3000),
    children: [
      shape("Ground", "Plate", 0, 3000, {
        kind: "rect",
        fill: "#05070A",
        x: 0,
        y: 0,
        width: 1,
        height: 1
      }),
      shape(
        "Rule",
        "Accent",
        600,
        2400,
        {
          kind: "rect",
          fill: "#FFD60A",
          x: 0.42,
          y: 0.575,
          width: 0.16,
          height: 0.01
        },
        {
          animations: [
            anim("logo-sting-rule-in", "in", "slide", 500, {
              params: { direction: "right", distance: 0.05 }
            })
          ]
        }
      ),
      text(
        "Wordmark",
        "Text",
        0,
        3000,
        {
          text: "BRAND",
          fontSizePx: px(TEXT_TIERS.title),
          color: "#FFFFFF",
          align: "center",
          maxWidthFrac: 0.7,
          letterSpacingPx: 10,
          fontWeight: 600
        },
        {
          transform: at(0.5, 0.46),
          animations: [
            anim("logo-sting-word-in", "in", "blur", 600, {
              params: { amount: 0.06 }
            }),
            anim("logo-sting-word-out", "out", "fade", 400)
          ]
        }
      )
    ],
    params: {
      wordmark: { type: "string", default: "BRAND", path: "/2/textStyle/text" },
      accentColor: {
        type: "color",
        default: "#FFD60A",
        path: "/1/shapeStyle/fill"
      },
      backgroundColor: {
        type: "color",
        default: "#05070A",
        path: "/0/shapeStyle/fill"
      },
      textColor: { type: "color", default: "#FFFFFF", path: "/2/textStyle/color" }
    }
  }
];

/** The reference frame every composition above is authored against. */
export const COMPOSITION_CANVAS = { width: REF_W, height: REF_H };
