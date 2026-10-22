import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { gameDocument3D, gameInputFrame3D } from "@nodetool-ai/protocol";
import { createGameSession3D } from "@nodetool-ai/game-runtime";
import { createGameplay } from "./gameplay.mjs";
import { coursePose, COURSE_LENGTH } from "./course.mjs";

const sample = new URL("../", import.meta.url);
const gameplay = createGameplay();
const document = gameDocument3D.parse(existsSync(new URL("game.json", sample)) && !process.argv.includes("--mechanics-only")
  ? JSON.parse(readFileSync(new URL("game.json", sample), "utf8"))
  : { schemaVersion: 3, engineVersion: "2", dimension: "3d", id: "sunrush-test", revision: "v1", tickRate: 60,
    entrySceneId: "track", presentation: { aspectRatio: 16 / 9, hudWidth: 1280, hudHeight: 720 }, assets: {},
    inputActions: gameplay.inputActions, inputAxes: gameplay.inputAxes, inputBindings: gameplay.inputBindings, scenes: [{ id: "track", name: "Track", activeCameraId: "camera", entities: gameplay.entities }] });
const session = await createGameSession3D(document, 1);
const route = [], assertions = [], events = {}, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
let finished = false, progress = -0.008, driftTicks = 0, driftCooldown = 0;
try {
  for (let tick = 0; tick < 10000; tick += 1) {
    const kart = session.inspect({ entityId: "racer-0" }).entities[0];
    const race = kart.props.race;
    progress = kart.props.progress;
    const q = kart.transform.rotation;
    const yaw = Math.atan2(2 * (q[3] * q[1] + q[0] * q[2]), 1 - 2 * (q[1] * q[1] + q[2] * q[2]));
    const target = coursePose(progress + (8 + (race ? race.speed / 3.6 : 0) * 0.22) / COURSE_LENGTH, -0.6);
    const desired = Math.atan2(-(target.position.x - kart.transform.position.x), -(target.position.z - kart.transform.position.z));
    const error = Math.atan2(Math.sin(desired - yaw), Math.cos(desired - yaw));
    const steer = clamp(-error * 2.2, -1, 1);
    driftCooldown = Math.max(0, driftCooldown - 1);
    if (race?.phase === "racing" && Math.abs(steer) > 0.4 && race.speed > 90 && driftCooldown === 0) {
      driftTicks += 1;
      if (driftTicks > 100 || Math.abs(steer) < 0.45) { driftTicks = 0; driftCooldown = 90; }
    } else { driftTicks = 0; }
    const pressed = driftTicks > 0 ? ["drift"] : [];
    const justPressed = tick === 0 ? ["start"] : race?.item ? ["item"] : [];
    const input = gameInputFrame3D.parse({ pressed, justPressed, axes: { throttle: 1, steer: Number(steer.toFixed(4)) } });
    const result = session.step(input);
    route.push(input);
    for (const event of result.events) {
      if (event.kind === "trigger") {
        events[event.event] = (events[event.event] || 0) + 1;
        if (event.event === "win") { finished = true; }
      }
    }
    if ([600, 1800, 3000].includes(result.tick) || finished) {
      const position = session.inspect({ entityId: "racer-0" }).entities[0].transform.position;
      assertions.push({ tick: result.tick, sceneId: document.entrySceneId, entities: [{ id: "racer-0", ...position }], ...(finished ? { events: result.events } : {}) });
    }
    if (tick % 1200 === 0) { console.log(JSON.stringify({ tick, race, progress })); }
    if (finished) { for (let hold = 0; hold < 12; hold += 1) { const idle = gameInputFrame3D.parse({ pressed: [] }); session.step(idle); route.push(idle); } break; }
  }
  const race = session.inspect({ entityId: "racer-0" }).entities[0].props.race;
  console.log(JSON.stringify({ finished, ticks: route.length, events, race }, null, 2));
  if (!finished) { throw new Error("The steering route did not complete all three laps"); }
  writeFileSync(new URL("completion.inputs.json", sample), JSON.stringify(route));
  writeFileSync(new URL("performance.inputs.json", sample), JSON.stringify(route.slice(0, 1200)) + "\n");
  writeFileSync(new URL("completion.assertions.json", sample), JSON.stringify({ tolerance: 0.001, ticks: assertions }, null, 2) + "\n");
} finally { session.dispose(); }
