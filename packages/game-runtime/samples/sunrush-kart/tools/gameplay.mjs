import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import { COURSE, COURSE_LENGTH, ROAD_HALF_WIDTH, RACER_NAMES, coursePose } from "./course.mjs";

const script = name => readFileSync(new URL(`../scripts/${name}.js`, import.meta.url), "utf8");

const KART_LEVER = 12;
const kartSource = lift => transformSync(`const f = ${script("kart").replace("__LIFT__", String(lift))}`, { minify: true }).code.replace(/^const f=/, "").replace(/;\s*$/, "");

// The player's kart body is a lever entity R behind the racer plus the visual R ahead of the lever. Scripts set only a
// child's rotation and scale, so the lever's rotation lifts the kart (hop, and the roll and pitch wheel clearance).
// Rival karts stay rigid children because each script call costs tick time. Their racer pose carries the lean.
export function createKartRig(index, visual) {
  if (index !== 0) { return [{ id: `kart-${index}`, parentId: `racer-${index}`, transform3d: {}, ...visual }]; }
  return [
    { id: `hop-${index}`, parentId: `racer-${index}`, transform3d: { position: { x: 0, y: 0, z: -KART_LEVER } }, behaviors: [{ kind: "script", source: kartSource(true), maxTickMs: 20, maxCommands: 4 }] },
    { id: `kart-${index}`, parentId: `hop-${index}`, transform3d: { position: { x: 0, y: 0, z: KART_LEVER } }, ...visual, behaviors: [{ kind: "script", source: kartSource(false), maxTickMs: 20, maxCommands: 4 }] }
  ];
}

export function createGameplay() {
  const rawSource = script("racer")
    .replace("__LENGTH__", String(COURSE_LENGTH))
    .replace("__WIDTH__", String(ROAD_HALF_WIDTH))
    .replace("__NAMES__", JSON.stringify(RACER_NAMES));
  const sources = [true, false].map(player => transformSync(`const controller = ${rawSource.replace("__COURSE__", JSON.stringify((player ? COURSE : COURSE.filter((_, index) => index % 4 === 0)).flat()))}`, { minify: true, define: { __PLAYER__: String(player) } }).code.replace(/^const controller=/, "").replace(/;\s*$/, ""));
  const entities = RACER_NAMES.map((name, index) => {
    const pose = coursePose(-0.008 - Math.floor(index / 2) * 4 / COURSE_LENGTH, index % 2 === 0 ? -2 : 2);
    return {
      id: `racer-${index}`, name, tags: ["racer"], props: { index, progress: -0.008 - Math.floor(index / 2) * 4 / COURSE_LENGTH },
      transform3d: { position: pose.position, rotation: [0, Math.sin(pose.yaw / 2), 0, Math.cos(pose.yaw / 2)] },
      body3d: { type: "kinematic" },
      behaviors: [{ kind: "script", source: sources[index === 0 ? 0 : 1], maxTickMs: 20, maxCommands: 32 }]
    };
  });
  entities[0].particles = { emitters: [
    { id: "sparks", playOnStart: false, rate: 0, maxParticles: 48, shape: { kind: "box", size: { x: 2.5, y: 0.06, z: 1.6 } },
      lifetime: { min: 0.16, max: 0.32 }, speed: { min: 1.5, max: 3.5 }, size: { min: 0.07, max: 0.11 }, color: "#ffffff",
      gravity: { x: 0, y: -11, z: 0 }, blend: "additive", unlit: true, render: { kind: "stretched", length: 2.8, speedScale: 0.035 },
      colorOverLifetime: [{ t: 0, color: "#fff7d2" }, { t: 0.3, color: "#ffd467" }, { t: 1, color: "#f46932" }],
      sizeOverLifetime: [{ t: 0, value: 1 }, { t: 1, value: 0.25 }],
      opacityOverLifetime: [{ t: 0, value: 1 }, { t: 0.45, value: 0.85 }, { t: 1, value: 0 }] },
    { id: "exhaust", playOnStart: false, rate: 0, maxParticles: 72, shape: { kind: "box", size: { x: 0.85, y: 0.08, z: 1.6 } },
      lifetime: { min: 0.16, max: 0.28 }, speed: { min: 0.5, max: 1.2 }, size: { min: 0.26, max: 0.44 }, color: "#ffffff",
      blend: "additive", unlit: true, render: { kind: "billboard" },
      colorOverLifetime: [{ t: 0, color: "#e9fcff" }, { t: 0.2, color: "#58e5ff" }, { t: 1, color: "#4289ed" }],
      sizeOverLifetime: [{ t: 0, value: 0.45 }, { t: 0.25, value: 1 }, { t: 1, value: 0.2 }],
      opacityOverLifetime: [{ t: 0, value: 0.9 }, { t: 0.4, value: 0.75 }, { t: 1, value: 0 }] },
    { id: "confetti", playOnStart: false, rate: 0, maxParticles: 100, shape: { kind: "cone", angle: 60, radius: 1 },
      lifetime: { min: 1.5, max: 3 }, speed: { min: 5, max: 9 }, size: { min: 0.06, max: 0.16 }, color: { min: "#ffd052", max: "#ff7052" },
      angularVelocity: { min: -8, max: 8 }, gravity: { x: 0, y: -5, z: 0 }, drag: 0.2, unlit: true,
      opacityOverLifetime: [{ t: 0, value: 1 }, { t: 0.75, value: 1 }, { t: 1, value: 0 }],
      render: { kind: "mesh", shape: "box", align: "world" } }
  ] };
  const pose = coursePose(-0.008, -2);
  entities.push({ id: "camera-rig", transform3d: { position: { x: pose.position.x, y: pose.position.y + 5, z: pose.position.z + 10 } },
    body3d: { type: "kinematic" }, behaviors: [{ kind: "script", source: script("camera"), maxTickMs: 20 }] });
  entities.push({ id: "camera", parentId: "camera-rig", transform3d: { position: { x: 0, y: 0, z: 0 } },
    camera3d: { projection: { kind: "perspective", fov: 66, near: 0.15, far: 20000 }, behavior: { kind: "fixed" } } });
  return {
    entities,
    inputActions: ["start", "drift", "item", "recover", "pause", "lookBack"],
    inputAxes: ["steer", "throttle"],
    inputBindings: {
      actions: {
        start: [{ kind: "key", code: "Enter" }, { kind: "gamepadButton", button: 9 }],
        drift: [{ kind: "key", code: "ShiftLeft" }, { kind: "key", code: "ShiftRight" }, { kind: "gamepadButton", button: 0 }, { kind: "touchButton", label: "DRIFT" }],
        item: [{ kind: "key", code: "Space" }, { kind: "key", code: "KeyE" }, { kind: "gamepadButton", button: 2 }, { kind: "touchButton", label: "ITEM" }],
        recover: [{ kind: "key", code: "KeyR" }, { kind: "gamepadButton", button: 3 }],
        pause: [{ kind: "key", code: "KeyP" }, { kind: "key", code: "Escape" }, { kind: "gamepadButton", button: 8 }],
        lookBack: [{ kind: "key", code: "KeyQ" }, { kind: "gamepadButton", button: 1 }]
      },
      axes: {
        steer: [{ kind: "keys", negative: ["KeyA", "ArrowLeft"], positive: ["KeyD", "ArrowRight"] }, { kind: "gamepadAxis", axis: 0, deadZone: 0.12 }, { kind: "touchStick", axis: "x" }],
        throttle: [{ kind: "keys", negative: ["KeyS", "ArrowDown"], positive: ["KeyW", "ArrowUp"] }, { kind: "gamepadButtons", negative: 6, positive: 7 }, { kind: "touchStick", axis: "y", invert: true }]
      },
      look: []
    }
  };
}
