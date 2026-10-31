/** Runs unchanged Kindle functions using only admitted native 2D host values. */
export function kindleController(i, originals, config) {
  const s = i.state?.ready ? i.state : { ready: true, roles: {}, patrol: {}, collected: [], spawned: [], sequence: 0, music: false };
  const commands = [], cache = {};
  const get = id => {
    if (Object.prototype.hasOwnProperty.call(cache, id)) { return cache[id]; }
    const value = i.world.get(id);
    return cache[id] = value ? { ...value, source: id, x: value.transform.x, y: value.transform.y, velocityX: value.velocity?.x ?? value.body2d?.velocity.x ?? 0, velocityY: value.velocity?.y ?? value.body2d?.velocity.y ?? 0, touching: value.touching ?? { down: false, up: false, left: false, right: false } } : null;
  };
  const contacts = i.lifecycle?.contacts ?? [];
  s.spawned = s.spawned.filter(id => get(id));
  for (const entityId of s.spawned) { commands.push({ kind: "move", entityId, direction: { x: 0, y: 0 } }); }
  const events = i.events.map(e => ({ ...e, kind: e.kind === "emit" ? "trigger" : e.kind, event: e.name }));
  for (const event of contacts) { events.push({ kind: "contact", entityId: event.a, otherId: event.b, phase: event.phase }); }
  for (const event of contacts) {
    const other = event.a === "hero" ? event.b : event.b === "hero" ? event.a : null;
    if (event.phase === "exit" || !config.cells.includes(other) || s.collected.includes(other)) { continue; }
    s.collected.push(other);
    commands.push({ kind: "score", amount: 1 }, { kind: "despawn", entityId: other });
    events.push({ kind: "collected", entityId: other, byId: "hero" });
    commands.push({ kind: "audio", assetId: "chime", volume: .5, position: { x: get(other).x, y: get(other).y } });
  }
  if (!s.music) { s.music = true; commands.push({ kind: "audio", id: "kindle-music", assetId: "music", volume: config.musicVolume, loop: true, music: true }); }
  const actions = i.input.actions ?? {};
  const pressed = i.input.pressed ?? Object.keys(actions).filter(key => actions[key]);
  const justPressed = i.input.justPressed ?? pressed.filter(key => !(s.held ?? []).includes(key));
  for (const patrol of config.patrols) {
    const e = get(patrol.id); if (!e) { continue; }
    const p = s.patrol[patrol.id] ??= { direction: 1 };
    if ((e[patrol.axis] - patrol.origin) * p.direction >= patrol.distance || (patrol.axis === "x" && (p.direction > 0 ? e.touching.right : e.touching.left))) { p.direction *= -1; }
    if (patrol.turnAtLedges && e.touching.down) {
      const x = e.x + p.direction * (patrol.width / 2 + .05), y = e.y - patrol.height / 2 - .1;
      if (!config.solids.some(o => Math.abs(x - o.x) <= o.width / 2 && Math.abs(y - o.y) <= o.height / 2)) { p.direction *= -1; }
    }
    const velocity = { x: patrol.axis === "x" ? patrol.speed * p.direction : patrol.falls ? e.velocityX : 0, y: patrol.axis === "y" ? patrol.speed * p.direction : patrol.falls ? e.velocityY : 0 };
    commands.push(config.actors.includes(patrol.id) ? { kind: "move", entityId: patrol.id, direction: velocity } : { kind: "setVelocity", entityId: patrol.id, velocity });
  }
  for (const role of config.roles) {
    const entity = get(role); if (!entity) { continue; }
    const candidates = [entity, get("hero"), ...contacts.flatMap(e => [e.a, e.b]).filter(id => /^(crawler|thorns|brazier|mushroom|beacon)/.test(id)).map(get)].filter(Boolean);
    const result = originals[role]({ tick: i.tick, pressed, justPressed, events, entity, world: candidates, state: s.roles[role] ?? null, random: i.random });
    s.roles[role] = result.state ?? null;
    for (const c of result.commands ?? []) {
      const entityId = c.entityId ?? role;
      if (c.kind === "setVelocity" && config.actors.includes(entityId)) { commands.push({ kind: "move", entityId, direction: { x: c.x, y: c.y } }); }
      else if (c.kind === "setPosition" || c.kind === "setVelocity") { commands.push({ kind: c.kind, entityId, [c.kind === "setPosition" ? "position" : "velocity"]: { x: c.x, y: c.y } }); }
      else if (c.kind === "setVisual") { const { kind, entityId: ignored, ...visual } = c; commands.push({ kind, entityId, visual }); }
      else if (c.kind === "playAnimation" || c.kind === "despawn") { commands.push({ ...c, entityId }); }
      else if (c.kind === "sceneTransition") { commands.push({ kind: "transition", sceneId: c.sceneId }); }
      else if (c.kind === "emit") {
        commands.push({ kind: "emit", name: c.event });
        for (const audio of config.audio.filter(a => a.onEvent === c.event)) { commands.push({ kind: "audio", assetId: audio.assetId, volume: audio.volume ?? 1 }); }
      } else if (c.kind === "spawn") {
        const entity = JSON.parse(JSON.stringify(config.templates[c.prefabId]));
        if (!entity) { throw new Error(`Unknown Kindle template ${c.prefabId}`); }
        entity.id = `${c.prefabId}-${i.tick}-${s.sequence++}`; entity.transform.x = c.x; entity.transform.y = c.y;
        if (entity.body2d?.type === "kinematic") { s.spawned.push(entity.id); }
        commands.push({ kind: "spawn", entity });
      } else if (!["ui", "hud", "emitParticles"].includes(c.kind)) { throw new Error(`Unsupported Kindle command ${c.kind}`); }
    }
  }
  s.held = pressed;
  return { state: s, commands };
}
