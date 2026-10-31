/** Legacy JSON serialization materialized sparse array holes as null. */
export function sunrushJsonState(value, path = "state") {
  if (value === null || ["string", "boolean"].includes(typeof value)) { return value; }
  if (typeof value === "number" && Number.isFinite(value)) { return value; }
  if (typeof value !== "object") { throw new Error(`Sunrush non-JSON ${path}: ${String(value)} (${typeof value})`); }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) {
      if (!Object.prototype.hasOwnProperty.call(value, index)) { value[index] = null; }
      else { sunrushJsonState(value[index], `${path}.${index}`); }
    }
  } else {
    for (const key of Object.keys(value)) { sunrushJsonState(value[key], `${path}.${key}`); }
  }
  return value;
}

/** Binds the unchanged Sunrush functions to committed native snapshots. */
export function sunrushController(i, originals, config, normalize = sunrushJsonState) {
  const state = i.state?.ready ? i.state : { ready: true, roles: {}, props: {}, rotations: {}, held: [], music: false };
  const commands = [], cache = {}, pendingProps = {}, pendingRotations = {};
  const world = { get(id) {
    if (Object.prototype.hasOwnProperty.call(cache, id)) { return cache[id]; }
    const value = i.world.get(id);
    if (!value) { return cache[id] = null; }
    const p = value.transform.position;
    return cache[id] = { ...value, position: { x: p[0], y: p[1], z: p[2] }, rotation: state.rotations[id] ?? config.initialRotations[id] ?? value.transform.rotation,
      props: { ...value.props, ...state.props[id] } };
  } };
  const actions = i.input.actions ?? {};
  const pressed = i.input.pressed ?? Object.keys(actions).filter(key => actions[key]);
  const justPressed = i.input.justPressed ?? pressed.filter(key => !state.held.includes(key));
  const rawAxes = i.input.axes ?? {};
  const axes = { steer: rawAxes.steer ?? Number(Boolean(actions.steerRight || actions.right)) - Number(Boolean(actions.steerLeft || actions.left)),
    throttle: rawAxes.throttle ?? Number(Boolean(actions.accelerate || actions.forward)) - Number(Boolean(actions.brake || actions.backward)) };
  const events = i.events.filter(e => e.kind === "emit").map(e => ({ kind: "trigger", event: e.name, entityId: e.data?.sourceEntityId, target: e.data?.target, payload: e.data?.payload }));
  if (!state.music) {
    state.music = true;
    commands.push({ kind: "audio", id: "sunrush-score", assetId: config.music.assetId, volume: config.music.volume, loop: true, music: true, bus: "music" });
  }
  for (const role of config.roles) {
    const entity = world.get(role);
    if (!entity) { throw new Error(`Missing Sunrush role ${role}`); }
    const result = originals[role]({ tick: i.tick, state: state.roles[role] ?? null, entity, events, pressed, justPressed, axes, look: i.input.look ?? { x: 0, y: 0 } }, world);
    state.roles[role] = normalize(result.state ?? null, `roles.${role}`);
    for (const c of result.commands ?? []) {
      if (c.kind === "setProp") {
        (pendingProps[role] ??= { ...state.props[role] })[c.key] = c.value;
      } else if (c.kind === "setKinematicPose") {
        const helper = config.headings[role];
        if (!helper) { throw new Error(`Unmapped Sunrush pose owner ${role}`); }
        commands.push({ kind: "setPosition", entityId: role, position: [c.position.x, c.position.y, c.position.z] }, { kind: "setVisual", entityId: helper, rotation: c.rotation });
        pendingRotations[role] = c.rotation;
      } else if (c.kind === "setVisual") {
        if (c.rotation) { commands.push({ kind: "setVisual", entityId: role, rotation: c.rotation }); }
        if (c.scale && !config.omitDynamicScale) { throw new Error("Native Sunrush dynamic visual scale is unsupported"); }
      } else if (c.kind === "emit") {
        commands.push({ kind: "emit", name: c.event, data: { sourceEntityId: role, ...(c.target ? { target: c.target } : {}), ...(c.payload ? { payload: c.payload } : {}) } });
        for (const audio of config.audio.filter(a => a.onEvent === c.event)) { commands.push({ kind: "audio", assetId: audio.assetId, volume: audio.volume, bus: audio.bus }); }
      } else if (c.kind === "emitParticles") {
        commands.push({ ...c, entityId: config.headings[role] ?? role });
      } else if (c.kind === "ui") { commands.push(c); }
      else if (c.kind === "hud" && (/^racer-map-[0-5]$/.test(c.id) || c.text === "")) { /* Original function suppresses the unused legacy score label. */ }
      else { throw new Error(`Unmapped Sunrush command ${c.kind}`); }
    }
  }
  Object.assign(state.props, pendingProps); Object.assign(state.rotations, pendingRotations);
  state.held = pressed;
  return { state, commands };
}
