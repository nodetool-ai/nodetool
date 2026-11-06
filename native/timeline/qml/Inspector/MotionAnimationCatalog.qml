pragma Singleton
// Preset descriptors from packages/timeline/src/animation/presets.ts.
// The keyframes oracle checks this catalog against the TypeScript source.
import QtQuick
QtObject {
    readonly property var labels: {
  "presets": {
    "fade": "Fade",
    "typewriter": "Typewriter",
    "slide": "Slide",
    "pop": "Pop",
    "spin": "Spin",
    "wipe": "Wipe",
    "blur": "Blur",
    "colorFade": "Color fade",
    "pulse": "Pulse",
    "flash": "Flash",
    "shake": "Shake",
    "bounce": "Bounce",
    "squash": "Squash",
    "kenBurns": "Ken Burns",
    "float": "Float",
    "breathe": "Breathe",
    "rotate": "Rotate",
    "hueShift": "Hue shift",
    "orbit": "Orbit",
    "followPath": "Follow path"
  },
  "descriptions": {
    "fade": "Fade opacity between 0 and 1.",
    "typewriter": "Reveal text one whole character at a time, left to right.",
    "slide": "Slide in from a direction (opacity fades in with it).",
    "pop": "Scale up past 1 then settle, with a fade in.",
    "spin": "Rotate into place while fading in.",
    "wipe": "Reveal the clip with a directional wipe.",
    "blur": "Fade in while sharpening from a blur.",
    "colorFade": "Fade between two colors.",
    "pulse": "Scale up and back for a soft heartbeat.",
    "flash": "Brief brightness spike and back to normal.",
    "shake": "Jitter around the clip's position.",
    "bounce": "Hop up and land with a bounce.",
    "squash": "Squash wider and shorter, then spring back to shape.",
    "kenBurns": "Slow zoom and drift across the whole clip (one shot).",
    "float": "Drift gently around the clip's position.",
    "breathe": "Slow scale in and out (loops seamlessly).",
    "rotate": "Continuous rotation, one turn per cycle.",
    "hueShift": "Cycle the hue through the whole color wheel, one turn per cycle.",
    "orbit": "Move around a circular path.",
    "followPath": "Follow an authored SVG path."
  },
  "params": {
    "direction": "Direction",
    "distance": "Distance",
    "overshoot": "Overshoot",
    "degrees": "Degrees",
    "softness": "Softness",
    "amount": "Amount",
    "frequency": "Frequency",
    "intensity": "Intensity",
    "amplitude": "Amplitude",
    "seed": "Seed",
    "zoom": "Zoom",
    "driftX": "Drift X",
    "driftY": "Drift Y",
    "turns": "Turns",
    "orient": "Orient to path",
    "d": "Path data",
    "pathX": "Path X",
    "pathY": "Path Y",
    "pathWidth": "Path width",
    "pathHeight": "Path height",
    "startT": "Start position",
    "endT": "End position",
    "fadeInMs": "Fade in (ms)",
    "fadeOutMs": "Fade out (ms)",
    "height": "Height"
  },
  "paramOptions": {
    "direction": {
      "left": "Left",
      "right": "Right",
      "up": "Up",
      "down": "Down",
      "in": "In",
      "out": "Out",
      "cw": "Clockwise",
      "ccw": "Counterclockwise",
      "forward": "Forward",
      "reverse": "Reverse"
    }
  }
}
    readonly property var presets: [
  {
    "id": "fade",
    "roles": [
      "in",
      "out"
    ],
    "defaultDurationMs": 500,
    "params": [],
    "describe": "Fade opacity between 0 and 1."
  },
  {
    "id": "typewriter",
    "roles": [
      "in"
    ],
    "defaultDurationMs": 1,
    "defaultEasing": "hold",
    "params": [],
    "describe": "Reveal text one whole character at a time, left to right."
  },
  {
    "id": "slide",
    "roles": [
      "in",
      "out"
    ],
    "defaultDurationMs": 500,
    "params": [
      {
        "name": "direction",
        "default": "left",
        "options": [
          "left",
          "right",
          "up",
          "down"
        ]
      },
      {
        "name": "distance",
        "default": 0.3,
        "min": 0,
        "max": 1
      }
    ],
    "describe": "Slide in from a direction (opacity fades in with it)."
  },
  {
    "id": "pop",
    "roles": [
      "in",
      "out"
    ],
    "defaultDurationMs": 500,
    "defaultEasing": "easeOut",
    "params": [
      {
        "name": "overshoot",
        "default": 1.08,
        "min": 1,
        "max": 1.5
      }
    ],
    "describe": "Scale up past 1 then settle, with a fade in."
  },
  {
    "id": "spin",
    "roles": [
      "in",
      "out"
    ],
    "defaultDurationMs": 500,
    "params": [
      {
        "name": "turns",
        "default": 0.25,
        "min": 0,
        "max": 2
      }
    ],
    "describe": "Rotate into place while fading in."
  },
  {
    "id": "wipe",
    "roles": [
      "in",
      "out"
    ],
    "defaultDurationMs": 500,
    "params": [
      {
        "name": "direction",
        "default": "left",
        "options": [
          "left",
          "right",
          "up",
          "down"
        ]
      },
      {
        "name": "softness",
        "default": 0.05,
        "min": 0,
        "max": 0.5
      }
    ],
    "describe": "Reveal the layer with a directional mask sweep (feathered edge via softness)."
  },
  {
    "id": "blur",
    "roles": [
      "in",
      "out"
    ],
    "defaultDurationMs": 500,
    "params": [
      {
        "name": "amount",
        "default": 12,
        "min": 0,
        "max": 40
      }
    ],
    "describe": "Rack focus: start blurred and sharpen into place (reversed for out), fading in with it."
  },
  {
    "id": "colorFade",
    "roles": [
      "in",
      "out"
    ],
    "defaultDurationMs": 600,
    "params": [],
    "describe": "Desaturate to grayscale then bloom into full color on in (reversed for out)."
  },
  {
    "id": "pulse",
    "roles": [
      "emphasis"
    ],
    "defaultDurationMs": 600,
    "defaultEasing": "easeInOut",
    "params": [
      {
        "name": "intensity",
        "default": 0.06,
        "min": 0,
        "max": 0.5
      }
    ],
    "describe": "Scale up and back for a soft heartbeat."
  },
  {
    "id": "flash",
    "roles": [
      "emphasis"
    ],
    "defaultDurationMs": 400,
    "defaultEasing": "easeInOut",
    "params": [
      {
        "name": "intensity",
        "default": 0.6,
        "min": 0,
        "max": 1
      }
    ],
    "describe": "Brief brightness spike and back to normal."
  },
  {
    "id": "shake",
    "roles": [
      "emphasis"
    ],
    "defaultDurationMs": 600,
    "defaultEasing": "linear",
    "params": [
      {
        "name": "intensity",
        "default": 0.02,
        "min": 0,
        "max": 0.2
      },
      {
        "name": "frequency",
        "default": 8,
        "min": 0.5,
        "max": 30
      },
      {
        "name": "seed",
        "default": 1,
        "min": 0,
        "max": 1000000
      },
      {
        "name": "fadeInMs",
        "default": 0,
        "min": 0,
        "max": 5000
      },
      {
        "name": "fadeOutMs",
        "default": 0,
        "min": 0,
        "max": 5000
      }
    ],
    "describe": "Seeded jitter on both axes (deterministic per seed); starts and ends at rest, with optional fade-in/out."
  },
  {
    "id": "bounce",
    "roles": [
      "emphasis"
    ],
    "defaultDurationMs": 600,
    "defaultEasing": "linear",
    "params": [
      {
        "name": "height",
        "default": 0.05,
        "min": 0,
        "max": 0.3
      }
    ],
    "describe": "Hop up and land with a bounce."
  },
  {
    "id": "squash",
    "roles": [
      "emphasis"
    ],
    "defaultDurationMs": 500,
    "defaultEasing": "easeOutBack",
    "params": [
      {
        "name": "amount",
        "default": 0.12,
        "min": 0,
        "max": 0.5
      }
    ],
    "describe": "Squash wider and shorter, then spring back to shape."
  },
  {
    "id": "kenBurns",
    "roles": [
      "loop"
    ],
    "defaultDurationMs": 3000,
    "defaultEasing": "easeInOut",
    "fullClip": true,
    "params": [
      {
        "name": "zoom",
        "default": 0.12,
        "min": 0,
        "max": 1
      },
      {
        "name": "direction",
        "default": "in",
        "options": [
          "in",
          "out"
        ]
      },
      {
        "name": "driftX",
        "default": 0.02,
        "min": -0.2,
        "max": 0.2
      },
      {
        "name": "driftY",
        "default": 0.02,
        "min": -0.2,
        "max": 0.2
      }
    ],
    "describe": "Slow zoom and drift across the whole clip (one shot)."
  },
  {
    "id": "float",
    "roles": [
      "loop"
    ],
    "defaultDurationMs": 3000,
    "defaultEasing": "linear",
    "params": [
      {
        "name": "amplitude",
        "default": 0.015,
        "min": 0,
        "max": 0.2
      },
      {
        "name": "frequency",
        "default": 1,
        "min": 0.1,
        "max": 8
      },
      {
        "name": "seed",
        "default": 0,
        "min": 0,
        "max": 1000000
      }
    ],
    "describe": "Gentle vertical bob (loops seamlessly); `frequency` sets bobs per period, `seed` blends in organic drift instead of a pure sine."
  },
  {
    "id": "breathe",
    "roles": [
      "loop"
    ],
    "defaultDurationMs": 3000,
    "defaultEasing": "linear",
    "params": [
      {
        "name": "intensity",
        "default": 0.03,
        "min": 0,
        "max": 0.3
      }
    ],
    "describe": "Slow scale in and out (loops seamlessly)."
  },
  {
    "id": "rotate",
    "roles": [
      "loop"
    ],
    "defaultDurationMs": 3000,
    "defaultEasing": "linear",
    "params": [
      {
        "name": "direction",
        "default": "cw",
        "options": [
          "cw",
          "ccw"
        ]
      }
    ],
    "describe": "Continuous rotation, one turn per cycle."
  },
  {
    "id": "hueShift",
    "roles": [
      "loop"
    ],
    "defaultDurationMs": 3000,
    "defaultEasing": "linear",
    "params": [
      {
        "name": "direction",
        "default": "forward",
        "options": [
          "forward",
          "reverse"
        ]
      }
    ],
    "describe": "Cycle the hue through the whole color wheel, one turn per cycle."
  },
  {
    "id": "orbit",
    "roles": [
      "loop"
    ],
    "defaultDurationMs": 3000,
    "defaultEasing": "linear",
    "params": [
      {
        "name": "degrees",
        "default": 360,
        "min": -1440,
        "max": 1440
      },
      {
        "name": "direction",
        "default": "cw",
        "options": [
          "cw",
          "ccw"
        ]
      }
    ],
    "describe": "Sweep a 3D clip's camera around the model, `degrees` per cycle. Drives cameraAzimuth, so it does nothing on a clip that is not 3D."
  },
  {
    "id": "followPath",
    "roles": [
      "emphasis",
      "loop"
    ],
    "defaultDurationMs": 800,
    "defaultEasing": "linear",
    "params": [
      {
        "name": "d",
        "default": ""
      },
      {
        "name": "pathX",
        "default": 0,
        "min": 0,
        "max": 1
      },
      {
        "name": "pathY",
        "default": 0,
        "min": 0,
        "max": 1
      },
      {
        "name": "pathWidth",
        "default": 1,
        "min": 0,
        "max": 1
      },
      {
        "name": "pathHeight",
        "default": 1,
        "min": 0,
        "max": 1
      },
      {
        "name": "orient",
        "default": false
      },
      {
        "name": "startT",
        "default": 0,
        "min": 0,
        "max": 1
      },
      {
        "name": "endT",
        "default": 1,
        "min": 0,
        "max": 1
      }
    ],
    "describe": "Move along an authored SVG path (`d`, normalized 0..1 the same way as ClipShapeStyle.d, placed in the pathX/Y/Width/Height box) from startT to endT, sampled uniformly by arc length. Writes positionX/positionY in canvas px; `orient` also writes rotation from the path's tangent. Resolving an existing shape clip's `d` into these params (by `pathClipId`) instead of authoring the path inline is a follow-up op — this preset only takes the path literally, because a preset compiles without the document to look a clip up in."
  }
]
}
