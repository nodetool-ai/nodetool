/** Boundary adapter for the unchanged authored Signal Forge script functions. */
export function executeSignalScript(native, original, config) {
  const state = native.state?.adapter ? native.state : { legacy: null, adapter: { held: [], props: {}, vx: 0, vz: 0, yaw: 0, pitch: 0, won: false } };
  const a = state.adapter, actions = native.input.actions || {};
  const pressed = native.input.pressed || Object.keys(actions).filter(id => actions[id]);
  const justPressed = native.input.justPressed || pressed.filter(id => !a.held.includes(id));
  const xyz = p => ({ x: p[0], y: p[1], z: p[2] });
  const world = { get(id) {
    const value = native.world.get(id);
    return value ? { ...value, grounded: !!value.grounded, props: { ...value.props, ...(id === native.entityId ? a.props : {}) }, position: xyz(value.transform.position), velocity: xyz(value.velocity || [0, 0, 0]) } : null;
  } };
  const events = native.events.map(e => ({ ...e, kind: e.kind === "emit" ? "trigger" : e.kind, event: e.name || e.event }));
  const commands = [];
  if (config.player) {
    if (!a.initialized) {
      if (!world.get("final-beacon")?.gameplay?.collectible) { throw new Error("Initial Signal Forge collectible is missing"); }
      a.initialized = true;
    }
    if (!a.won && !world.get("final-beacon")) { a.won = true; events.push({ kind: "win" }); commands.push({ kind: "emit", name: "win" }); }
    const look = native.input.look || { x: 0, y: 0 };
    a.yaw += look.x * config.camera.sensitivity;
    a.pitch = Math.max(config.camera.minPitch * Math.PI / 180, Math.min(config.camera.maxPitch * Math.PI / 180, a.pitch + look.y * config.camera.sensitivity));
    const axes = native.input.axes || {};
    const move = native.input.move || [axes.moveX || Number(!!actions.right) - Number(!!actions.left), 0, axes.moveZ || Number(!!actions.backward) - Number(!!actions.forward)];
    const length = Math.max(1, Math.hypot(move[0], move[2]));
    const x = (move[0] * Math.cos(a.yaw) + move[2] * Math.sin(a.yaw)) / length;
    const z = (-move[0] * Math.sin(a.yaw) + move[2] * Math.cos(a.yaw)) / length;
    const approach = (from, to) => from + Math.max(-config.acceleration / 60, Math.min(config.acceleration / 60, to - from));
    a.vx = approach(a.vx, x * config.speed); a.vz = approach(a.vz, z * config.speed);
    const jump = justPressed.includes("jump") || !!native.input.jump && !a.jumpHeld;
    a.jumpHeld = !!native.input.jump;
    commands.push({ kind: "move", direction: [a.vx / config.speed, 0, a.vz / config.speed], jump });
    const q = [Math.cos(a.yaw / 2) * Math.sin(a.pitch / 2), Math.sin(a.yaw / 2) * Math.cos(a.pitch / 2), -Math.sin(a.yaw / 2) * Math.sin(a.pitch / 2), Math.cos(a.yaw / 2) * Math.cos(a.pitch / 2)];
    const rotate = (v, r) => {
      const [x, y, z] = v, [qx, qy, qz, qw] = r, tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
      return [x + qw * tx + qy * tz - qz * ty, y + qw * ty + qz * tx - qx * tz, z + qw * tz + qx * ty - qy * tx];
    };
    const offset = rotate(config.camera.offset, q), direction = config.camera.lookAtOffset.map((v, i) => v - offset[i]);
    const yaw = Math.atan2(-direction[0], -direction[2]), pitch = Math.asin(direction[1] / Math.hypot(...direction));
    const rotation = [Math.cos(yaw / 2) * Math.sin(pitch / 2), Math.sin(yaw / 2) * Math.cos(pitch / 2), -Math.sin(yaw / 2) * Math.sin(pitch / 2), Math.cos(yaw / 2) * Math.cos(pitch / 2)];
    const inverse = [-q[0], -q[1], -q[2], q[3]], r = rotation;
    const relative = [inverse[3] * r[0] + inverse[0] * r[3] + inverse[1] * r[2] - inverse[2] * r[1], inverse[3] * r[1] - inverse[0] * r[2] + inverse[1] * r[3] + inverse[2] * r[0], inverse[3] * r[2] + inverse[0] * r[1] - inverse[1] * r[0] + inverse[2] * r[3], inverse[3] * r[3] - inverse[0] * r[0] - inverse[1] * r[1] - inverse[2] * r[2]];
    commands.push({ kind: "setVisual", entityId: "native-camera-pivot", rotation: q }, { kind: "setVisual", entityId: "camera", rotation: relative });
  }
  const input = { tick: native.tick, entityId: native.entityId, state: state.legacy, entity: world.get(native.entityId), events, pressed, justPressed, world };
  const result = original(input, world);
  for (const c of result.commands || []) {
    if (c.kind === "teleport" || c.kind === "setKinematicPose") {
      commands.push({ kind: "setPosition", position: [c.position.x, c.position.y, c.position.z] });
      if (c.kind === "teleport") { commands.push({ kind: "setVelocity", velocity: [0, 0, 0] }); a.vx = 0; a.vz = 0; }
    } else if (c.kind === "setVelocity") { commands.push({ kind: "setVelocity", velocity: [c.velocity.x, c.velocity.y, c.velocity.z] }); }
    else if (c.kind === "addForce") { commands.push({ kind: "applyImpulse", impulse: [c.force.x / 60, c.force.y / 60, c.force.z / 60] }); }
    else if (c.kind === "addTorque") { /* Native angular impulses are unavailable; recorded as a port limitation. */ }
    else if (c.kind === "setProp") { a.props[c.key] = c.value; }
    else if (c.kind === "emit") { commands.push({ kind: "emit", name: c.event }); }
    else if (c.kind === "ui") { commands.push(c); }
    else if (c.kind === "hud") { if (c.text.trim()) { throw new Error("Unexpected visible legacy HUD"); } }
    else if (c.kind === "setVisual") { if (c.rotation) { commands.push({ kind: "setVisual", rotation: c.rotation }); } }
    else if (c.kind === "emitParticles") { commands.push(c); }
    else { throw new Error(`Unmapped Signal Forge command: ${c.kind}`); }
  }
  a.held = pressed;
  return { state: { legacy: result.state ?? null, adapter: a }, commands };
}

export function signalAudio(native, config) {
  const commands = [];
  if (native.tick === 0) { commands.push({ kind: "audio", assetId: config.music.assetId, music: true, loop: true, bus: "music", volume: config.music.volume * .85 * .7 }); }
  for (const event of native.events) {
    if (event.kind !== "emit") { continue; }
    for (const source of config.sources) {
      if (source.onEvent === event.name) { commands.push({ kind: "audio", assetId: source.assetId, volume: source.volume * .85 * .8, ...(source.spatial ? { position: source.position } : {}) }); }
    }
  }
  return { commands };
}

/** Three contiguous native ID groups preserve the previous per-entity call order. */
export function signalController(native, originals, roles, config, execute, audio) {
  const state = native.state?.group ? native.state : { group: true, roles: {} };
  const commands = [], cache = Object.create(null);
  const world = { get(id) { if (!(id in cache)) { cache[id] = native.world.get(id); } return cache[id]; } };
  const append = (owner, values) => {
    for (const command of values) {
      const targeted = ["move", "setPosition", "setVelocity", "applyImpulse", "setVisual", "emitParticles", "audio"].includes(command.kind);
      commands.push(targeted && command.entityId === undefined ? { ...command, entityId: owner } : command);
    }
  };
  for (const role of roles) {
    if (role === "audio") { append("courier", audio(native, config.audio).commands); continue; }
    if (!world.get(role)) { continue; }
    const result = execute({ ...native, world, entityId: role, state: state.roles[role] }, originals[role], { ...config, player: role === "courier" });
    state.roles[role] = result.state; append(role, result.commands);
  }
  if (commands.length > 16) { throw new Error(`Signal Forge controller command bound exceeded: ${commands.length}`); }
  return { state, commands };
}
