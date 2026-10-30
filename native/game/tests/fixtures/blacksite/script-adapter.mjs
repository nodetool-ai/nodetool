function executeLegacy(native, legacy, configuration) {
  const xyz = (value) => Array.isArray(value) ? { x: value[0], y: value[1], z: value[2] } : value;
  const vector = (value) => [value.x, value.y, value.z];
  const state = native.state && native.state.adapter ? native.state : { legacy: null, adapter: { held: [], sequence: 0, spawns: [] } };
  const adapter = state.adapter;
  adapter.spawns = adapter.spawns.filter((spawn) => native.world.get(spawn.id));
  const world = {
    get(id) {
      const entity = native.world.get(configuration.idMapping[id] || id);
      return entity ? Object.assign({}, entity, { position: xyz(entity.transform.position), velocity: xyz(entity.velocity || [0, 0, 0]) }) : null;
    }
  };
  const actions = native.input.actions || {};
  const pressed = native.input.pressed || Object.keys(actions).filter((name) => actions[name]);
  const justPressed = native.input.justPressed || pressed.filter((name) => !adapter.held.includes(name));
  const input = {
    tick: native.tick,
    state: state.legacy,
    entity: world.get(native.entityId),
    events: native.events.map((event) => Object.assign({}, event, { kind: event.kind === "emit" ? "trigger" : event.kind, event: event.name || event.event })),
    queries: native.queryResults.map((query) => {
      if (configuration.requireRayNormals && query.queryId === "rifle" && query.position && !query.normal) {
        throw new Error("BLACKSITE impact presentation requires the native ray surface normal");
      }
      return Object.assign({}, query, query.position ? { position: xyz(query.position) } : {}, query.normal ? { normal: xyz(query.normal) } : {});
    }),
    look: native.input.look || { x: 0, y: 0 },
    axes: native.input.axes || { moveX: (native.input.move || [])[0] || 0, moveZ: (native.input.move || [])[2] || 0 },
    pressed,
    justPressed
  };
  const result = legacy(input, world);
  const commands = [];
  const audio = (source, entityId) => {
    if (!source) {
      return;
    }
    const position = world.get(entityId)?.position;
    commands.push({ kind: "audio", assetId: source.assetId, volume: source.volume ?? 1, ...(source.spatial && position ? { position: vector(position) } : {}) });
  };
  for (const command of result.commands || []) {
    switch (command.kind) {
      case "characterIntent":
        commands.push({ kind: "move", direction: vector(command.movement), jump: command.jump });
        break;
      case "rayQuery":
        commands.push({ kind: "query", queryId: command.queryId, origin: vector(command.origin), direction: vector(command.direction), maxDistance: command.maxDistance });
        break;
      case "spawn": {
        const prefab = configuration.prefabs[command.prefabId];
        if (!prefab) {
          throw new Error(`Unmapped BLACKSITE prefab: ${command.prefabId}`);
        }
        adapter.sequence++;
        const entity = JSON.parse(JSON.stringify(prefab.entity));
        entity.id = `effect-${command.prefabId}-${adapter.sequence}`;
        if (command.position) {
          entity.transform.position = vector(command.position);
        }
        if (command.rotation) {
          entity.transform.rotation = command.rotation;
        }
        commands.push({ kind: "spawn", entity });
        adapter.spawns.push({ id: entity.id, prefab: command.prefabId, tags: prefab.tags });
        break;
      }
      case "despawn": {
        const pending = [command.entityId];
        const seen = new Set();
        while (pending.length) {
          const id = pending.pop();
          if (seen.has(id)) {
            continue;
          }
          seen.add(id);
          commands.push({ kind: "despawn", entityId: id });
          pending.push(...(configuration.children[id] || []));
        }
        if (/^drone-[0-4]$/.test(command.entityId)) {
          commands.push({ kind: "score", amount: 1 });
        }
        break;
      }
      case "emit": {
        if (command.target?.tag) {
          for (const spawn of adapter.spawns.filter((spawn) => spawn.tags.includes(command.target.tag))) {
            commands.push({ kind: "emit", name: command.event, entityId: spawn.id });
            const source = configuration.prefabs[spawn.prefab].audioSource;
            if (source?.onEvent === command.event) {
              audio(source, spawn.id);
            }
          }
        } else {
          commands.push({ kind: "emit", name: command.event });
          for (const source of configuration.audioSources) {
            if (source.audioSource.onEvent === command.event) {
              audio(source.audioSource, source.id);
            }
          }
        }
        if (command.event === "hurt") {
          commands.push({ kind: "health", entityId: "player", amount: -10 });
        }
        if (command.event === "victory") {
          commands.push({ kind: "score", amount: 100 });
        }
        break;
      }
      case "ui":
        commands.push(command);
        break;
      case "setVisual":
        commands.push({ kind: "setVisual", rotation: command.rotation, entityId: native.entityId });
        break;
      case "emitParticles":
        commands.push({ ...command, entityId: native.entityId });
        break;
      case "hud":
        if (command.text !== "") {
          throw new Error("Visible legacy HUD commands require an explicit native mapping");
        }
        break;
      default:
        throw new Error(`Unmapped BLACKSITE command: ${command.kind}`);
    }
  }
  adapter.held = pressed;
  return { state: { legacy: result.state ?? null, adapter }, commands };
}

export function wrapLegacyScript(source, configuration) {
  // The original player closes over `world`, while the other original scripts
  // only use their input. Supply that lexical binding without rewriting them.
  return `(native)=>{const configuration=${JSON.stringify(configuration)};const original=(input,world)=>(${source})(input);return (${executeLegacy.toString()})(native,original,configuration);}`;
}
