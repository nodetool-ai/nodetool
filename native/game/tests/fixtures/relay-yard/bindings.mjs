/** Runs the original source function using admitted native values and commands. */
export function executeRelayScript(native, original, role, config) {
  const state = native.state?.adapter ? native.state : { legacy: null, adapter: { held: [], collected: [], won: false, yaw: 0, vx: 0, vz: 0, hud: {} } };
  const adapter = state.adapter;
  const actions = native.input.actions || {};
  const pressed = native.input.pressed || Object.keys(actions).filter(key => actions[key]);
  const justPressed = native.input.justPressed || pressed.filter(key => !adapter.held.includes(key));
  const value = native.world.get(native.entityId);
  const entity = { ...value, position: { x: value.transform.position[0], y: value.transform.position[1], z: value.transform.position[2] } };
  const events = native.events.map(event => ({ ...event, kind: event.kind === "emit" ? "trigger" : event.kind, event: event.name }));
  const commands = [];
  if (role === "player") {
    for (const id of native.collectedCells || []) {
      if (config.cells.includes(id) && !adapter.collected.includes(id)) { adapter.collected.push(id); }
    }
    if (!adapter.won && adapter.collected.length >= config.count) {
      adapter.won = true;
      events.push({ kind: "win" });
      commands.push({ kind: "emit", name: "win", data: { collected: adapter.collected.length } });
    }
    const look = native.input.look || { x: 0, y: 0 };
    adapter.yaw += look.x * config.sensitivity;
    const axes = native.input.axes || {};
    const move = native.input.move || [axes.moveX || (actions.right ? 1 : 0) - (actions.left ? 1 : 0), 0, axes.moveZ || (actions.backward ? 1 : 0) - (actions.forward ? 1 : 0)];
    const length = Math.max(1, Math.hypot(move[0], move[2]));
    const x = (move[0] * Math.cos(adapter.yaw) + move[2] * Math.sin(adapter.yaw)) / length;
    const z = (-move[0] * Math.sin(adapter.yaw) + move[2] * Math.cos(adapter.yaw)) / length;
    const approach = (from, to) => from + Math.max(-config.acceleration / 60, Math.min(config.acceleration / 60, to - from));
    adapter.vx = approach(adapter.vx, x * config.speed);
    adapter.vz = approach(adapter.vz, z * config.speed);
    const jump = Boolean((native.input.jump && !adapter.jumpHeld) || justPressed.includes("jump"));
    adapter.jumpHeld = Boolean(native.input.jump);
    commands.push({ kind: "move", direction: [adapter.vx / config.speed, 0, adapter.vz / config.speed], jump });
  }
  const legacyWorld = { get(id) {
    const found = native.world.get(config.idMap[id] || id);
    return found ? { ...found, position: { x: found.transform.position[0], y: found.transform.position[1], z: found.transform.position[2] } } : null;
  } };
  const result = original({ tick: native.tick, entityId: native.entityId, state: state.legacy, entity, world: legacyWorld, events, pressed, justPressed }, legacyWorld);
  for (const command of result.commands || []) {
    if (command.kind === "teleport" || command.kind === "setKinematicPose") {
      commands.push({ kind: "setPosition", position: [command.position.x, command.position.y, command.position.z] });
      if (command.kind === "teleport") { commands.push({ kind: "setVelocity", velocity: [0, 0, 0] }); adapter.vx = 0; adapter.vz = 0; }
    } else if (command.kind === "hud") {
      if (adapter.hud[command.id] !== command.text) { commands.push({ kind: "ui", id: command.id, text: command.text }); adapter.hud[command.id] = command.text; }
    } else { throw new Error(`Unmapped Relay Yard command: ${command.kind}`); }
  }
  adapter.held = pressed;
  return { state: { legacy: result.state ?? null, adapter }, commands };
}

export function relayTrigger(input, eventName, player) {
  const entered = input.events.some(event => event.sensor && event.phase === "enter" && ((event.a === input.entityId && event.b === player) || (event.b === input.entityId && event.a === player)));
  return { commands: entered ? [{ kind: "emit", name: eventName }] : [] };
}

/** Follow/orbit is an authored camera transform, not a legacy camera runtime. */
export function relayCamera(input, config) {
  const state = input.state?.ready ? input.state : { ready: true, yaw: config.yaw * Math.PI / 180, pitch: config.pitch * Math.PI / 180 };
  const look = input.input.look || { x: 0, y: 0 };
  state.yaw += look.x * config.sensitivity;
  state.pitch = Math.max(config.minPitch * Math.PI / 180, Math.min(config.maxPitch * Math.PI / 180, state.pitch + look.y * config.sensitivity));
  const sy = Math.sin(state.yaw / 2), cy = Math.cos(state.yaw / 2), sp = Math.sin(state.pitch / 2), cp = Math.cos(state.pitch / 2);
  const q = [cy * sp, sy * cp, -sy * sp, cy * cp], [x, y, z] = config.offset;
  const tx = 2 * (q[1] * z - q[2] * y), ty = 2 * (q[2] * x - q[0] * z), tz = 2 * (q[0] * y - q[1] * x);
  const offset = [x + q[3] * tx + q[1] * tz - q[2] * ty, y + q[3] * ty + q[2] * tx - q[0] * tz, z + q[3] * tz + q[0] * ty - q[1] * tx];
  // Parenting to the character lets the committed physics pose move the camera
  // after scripts run, avoiding a one-tick follow delay.
  const direction = config.lookAtOffset.map((value, index) => value - offset[index]);
  const yaw = Math.atan2(-direction[0], -direction[2]), pitch = Math.asin(direction[1] / Math.hypot(...direction));
  const a = Math.sin(yaw / 2), b = Math.cos(yaw / 2), c = Math.sin(pitch / 2), d = Math.cos(pitch / 2);
  const desired = [b * c, a * d, -a * c, b * d], inverse = [-q[0], -q[1], -q[2], q[3]];
  const relative = [inverse[3] * desired[0] + inverse[0] * desired[3] + inverse[1] * desired[2] - inverse[2] * desired[1],
    inverse[3] * desired[1] - inverse[0] * desired[2] + inverse[1] * desired[3] + inverse[2] * desired[0],
    inverse[3] * desired[2] + inverse[0] * desired[1] - inverse[1] * desired[0] + inverse[2] * desired[3],
    inverse[3] * desired[3] - inverse[0] * desired[0] - inverse[1] * desired[1] - inverse[2] * desired[2]];
  return { state, commands: [{ kind: "setVisual", entityId: config.pivot, rotation: q }, { kind: "setVisual", rotation: relative }] };
}

/** One native guest call preserves independent source roles and command owners. */
export function relayController(native, originals, bind, camera, trigger, config) {
  const state = native.state?.controller ? native.state : { controller: true, roles: {}, camera: null, initialized: false };
  const cache = Object.create(null);
  const world = { get(id) { if (!(id in cache)) { cache[id] = native.world.get(id); } return cache[id]; } };
  if (!state.initialized) {
    for (const id of config.cells) { if (!world.get(id)?.gameplay?.collectible) { throw new Error(`Initial Relay cell missing: ${id}`); } }
    state.initialized = true;
  }
  // Only the course's native collectible gameplay can remove these cells.
  // Actor-only sensor masks are verified separately with real crate overlaps.
  const collectedCells = config.cells.filter(id => !world.get(id));
  const commands = [];
  const append = (owner, values) => {
    for (const command of values) {
      const targeted = ["move", "setPosition", "setVelocity", "setVisual"].includes(command.kind);
      commands.push(targeted && command.entityId === undefined ? { ...command, entityId: owner } : command);
    }
  };
  const pose = camera({ ...native, state: state.camera }, config.camera);
  state.camera = pose.state; append(config.cameraId, pose.commands);
  // Newly emitted trigger commands are intentionally not delivered to source
  // roles until the next native tick, matching normal engine event delivery.
  for (const entry of config.triggers) {
    append(entry.entityId, trigger({ ...native, entityId: entry.entityId }, entry.event, config.playerId).commands);
  }
  for (const role of config.roles) {
    const result = bind({ ...native, world, entityId: role.entityId, state: state.roles[role.id], collectedCells }, originals[role.id], role.id, config);
    state.roles[role.id] = result.state; append(role.entityId, result.commands);
  }
  return { state, commands };
}
