(input) => {
  const C = __COURSE__, COUNT = C.length / 3, LENGTH = __LENGTH__, WIDTH = __WIDTH__, NAMES = __NAMES__;
  const s = input.state || {}, id = input.entity.props.index;
  const commands = [], rivals = [], dt = 1 / 60;
  const rival = index => {
    if (rivals[index] === undefined) { rivals[index] = world.get("racer-" + index) || null; }
    return rivals[index];
  };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const wrap = v => ((v % 1) + 1) % 1;
  const angle = v => Math.atan2(Math.sin(v), Math.cos(v));
  const tapped = name => input.justPressed.includes(name);
  const held = name => input.pressed.includes(name);
  const emit = (event, payload) => { if (__PLAYER__) { commands.push({ kind: "emit", event, ...(payload ? { payload } : {}) }); } };
  const pose = (progress, lane) => {
    const p = wrap(progress) * COUNT, i = Math.floor(p), t = p - i;
    const a = i * 3, b = (i + 1) % COUNT * 3, dx = C[b] - C[a], dz = C[b + 2] - C[a + 2], len = Math.hypot(dx, dz);
    return { x: C[a] + dx * t - dz / len * lane, y: C[a + 1] + (C[b + 1] - C[a + 1]) * t, z: C[a + 2] + dz * t + dx / len * lane, yaw: Math.atan2(-dx, -dz) };
  };
  const initialize = () => {
    const progress = -0.008 - Math.floor(id / 2) * 4 / LENGTH, lane = id % 2 === 0 ? -2 : 2;
    const p = pose(progress, lane);
    Object.assign(s, { phase: "title", resume: "racing", countdown: 180, time: 0, speed: 0, yaw: p.yaw, direction: p.yaw,
      x: p.x, y: p.y, z: p.z, progress, gate: 1, lap: 0, drift: 0, drifting: false, boost: 0, shield: 0, stun: 0,
      item: "", pickup: -1, hits: 0, bump: 0, finishTime: 0, finished: false, finalPosition: 1, results: [], lane, steer: 0, offroad: false });
  };
  if (s.phase === undefined) { initialize(); }
  if (tapped("start") && (s.phase === "title" || s.phase === "finished")) {
    initialize(); s.phase = "countdown"; emit("start"); emit("countdown", { count: 3 });
  }
  if (tapped("pause") || (tapped("start") && s.phase === "paused")) {
    if (s.phase === "paused") { s.phase = s.resume; }
    else if (s.phase === "racing" || s.phase === "countdown") { s.resume = s.phase; s.phase = "paused"; }
  }
  if (s.phase === "countdown") {
    s.countdown -= 1;
    if (s.countdown === 120 || s.countdown === 60) { emit("countdown", { count: s.countdown / 60 }); }
    if (s.countdown <= 0) { s.phase = "racing"; emit("go"); }
  }
  if (!__PLAYER__ && input.tick % 6 === id) {
    const leader = world.get("racer-0");
    const race = leader && leader.props.race;
    if (race && race.phase === "finished" && !tapped("start")) { s.phase = "finished"; }
  }
  if (s.phase === "racing" && !s.finished) {
    s.time += dt;
    s.boost = Math.max(0, s.boost - 1); s.shield = Math.max(0, s.shield - 1);
    s.stun = Math.max(0, s.stun - 1); s.bump = Math.max(0, s.bump - 1);
    for (const event of input.events) {
      if (event.kind === "trigger" && event.event === "pulse-hit" && s.shield === 0) {
        s.stun = 75; s.speed *= 0.45; s.hits += 1; emit("hit");
      }
    }
    const oldProgress = s.progress;
    if (__PLAYER__) {
      const throttle = clamp(input.axes.throttle || 0, -1, 1);
      const steering = clamp(input.axes.steer || 0, -1, 1);
      s.steer += (steering - s.steer) * 0.22;
      const drifting = held("drift") && s.speed > 12 && Math.abs(s.steer) > 0.15 && !s.offroad && !s.stun;
      if (drifting && !s.drifting) { emit("drift"); }
      if (drifting) { s.drift = clamp(s.drift + Math.abs(s.steer) / 110, 0, 1); }
      else if (s.drifting) {
        if (s.drift >= 0.35) { s.boost = Math.max(s.boost, Math.round(35 + s.drift * 85)); emit("boost"); }
        s.drift = 0;
      }
      s.drifting = drifting;
      const maxSpeed = s.stun ? 17 : s.offroad ? 18 : s.boost ? 49 : 37;
      if (throttle > 0) { s.speed += (s.speed < maxSpeed ? 15 * throttle : -20) * dt; }
      else if (throttle < 0) { s.speed -= (s.speed > 0 ? 34 : 8) * -throttle * dt; }
      else { s.speed *= 0.988; }
      s.speed = clamp(s.speed, -9, maxSpeed + 1);
      const turnRate = (0.65 + Math.min(Math.abs(s.speed) / 18, 1) * 0.85) * (drifting ? 1.3 : 1);
      s.yaw = angle(s.yaw - s.steer * turnRate * dt * clamp(s.speed / 6, -1, 1));
      s.direction = angle(s.direction + angle(s.yaw - s.direction) * (drifting ? 0.075 : 0.25));
      s.x -= Math.sin(s.direction) * s.speed * dt; s.z -= Math.cos(s.direction) * s.speed * dt;
      let best = Infinity, projected = wrap(s.progress), road = pose(s.progress, 0), lane = 0;
      const center = Math.floor(wrap(s.progress) * COUNT);
      for (let offset = -7; offset <= 7; offset += 1) {
        const index = (center + offset + COUNT) % COUNT, a = index * 3, b = (index + 1) % COUNT * 3;
        const dx = C[b] - C[a], dz = C[b + 2] - C[a + 2], length2 = dx * dx + dz * dz;
        const t = clamp(((s.x - C[a]) * dx + (s.z - C[a + 2]) * dz) / length2, 0, 1);
        const x = C[a] + dx * t, z = C[a + 2] + dz * t, distance = (s.x - x) ** 2 + (s.z - z) ** 2;
        if (distance < best) {
          best = distance; projected = (index + t) / COUNT;
          lane = ((s.x - x) * -dz + (s.z - z) * dx) / Math.sqrt(length2);
          road = { x, y: C[a + 1] + (C[b + 1] - C[a + 1]) * t, z, yaw: Math.atan2(-dx, -dz) };
        }
      }
      const delta = wrap(projected - wrap(s.progress) + 0.5) - 0.5;
      // Local projection and a distance bound prevent a shortcut or reverse crossing from awarding a lap.
      if (Math.abs(delta) * LENGTH < 3) { s.progress += delta; }
      s.lane = lane;
      s.offroad = Math.abs(lane) > WIDTH - 0.8;
      s.y = road.y;
      if (Math.abs(lane) > WIDTH + 0.3) {
        const p = pose(s.progress, clamp(lane, -WIDTH + 0.3, WIDTH - 0.3));
        s.x = p.x; s.z = p.z; s.speed *= 0.72;
        if (__PLAYER__ && s.bump === 0) { emit("hit"); s.hits += 1; s.bump = 45; }
      }
      if (tapped("recover") || best > 400) {
        const p = pose(s.progress, 0);
        s.x = p.x; s.y = p.y; s.z = p.z; s.yaw = p.yaw; s.direction = p.yaw;
        s.speed = 0; s.drift = 0; s.boost = 0; s.stun = 30; emit("hit");
      }
    } else {
      const target = s.stun ? 15 : s.boost ? 42 : 29.5 + id * 0.65 + Math.sin(s.time * 0.7 + id) * 1.3;
      s.speed += clamp(target - s.speed, -20 * dt, 13 * dt);
      s.progress += s.speed * dt / LENGTH;
      s.lane = (id % 2 === 0 ? -2.5 : 2.5) + Math.sin(s.time * 0.6 + id) * 0.7;
      const p = pose(s.progress, s.lane);
      s.x = p.x; s.y = p.y; s.z = p.z; s.yaw = p.yaw; s.direction = p.yaw;
    }
    if (__PLAYER__ && s.bump === 0) {
      for (let index = 0; index < 6; index += 1) {
        if (index === id) { continue; }
        const other = rival(index);
        if (!other || other.props.finished) { continue; }
        const dx = s.x - other.position.x, dz = s.z - other.position.z;
        if (dx * dx + dz * dz < 2.9 && s.speed > 8) {
          s.speed *= s.shield ? 0.96 : 0.78; s.bump = 45;
          if (__PLAYER__) { const length = Math.max(Math.hypot(dx, dz), 0.1); s.x += dx / length * 0.3; s.z += dz / length * 0.3; emit("hit"); }
          break;
        }
      }
    }
    const quarter = s.gate / 4;
    if (oldProgress < quarter && s.progress >= quarter) {
      s.gate += 1;
      if (s.gate % 4 === 1) {
        s.lap += 1; emit("lap", { lap: s.lap });
        if (s.lap === 3) { s.finished = true; s.finishTime = s.time; s.speed = 0; }
      }
    }
    for (const strip of [0.30, 0.83]) {
      const crossing = Math.floor(s.progress) + strip;
      if (oldProgress < crossing && s.progress >= crossing && Math.abs(s.lane + 2) < 1.8) {
        s.boost = Math.max(s.boost, 75); emit("boost");
      }
    }
    for (let zone = 0; zone < 3; zone += 1) {
      const progress = Math.floor(s.progress) + [0.12, 0.43, 0.72][zone], pickup = Math.floor(s.progress) * 3 + zone;
      if (oldProgress < progress && s.progress >= progress && !s.item && s.pickup !== pickup && Math.min(Math.abs(s.lane + 4), Math.abs(s.lane), Math.abs(s.lane - 4)) < 1.8) {
        s.item = ["boost", "pulse", "shield"][(zone + s.lap + id) % 3]; s.pickup = pickup; emit("pickup", { item: s.item });
      }
    }
    if (s.item && (__PLAYER__ ? tapped("item") : Math.round(s.time * 60) % (240 + id * 17) === 0)) {
      const item = s.item; s.item = ""; emit("item", { item });
      if (item === "boost") { s.boost = 120; emit("boost"); }
      if (item === "shield") { s.shield = 240; }
      if (item === "pulse") {
        for (let index = 0; index < 6; index += 1) {
          if (index === id) { continue; }
          const other = rival(index);
          if (other && Math.hypot(s.x - other.position.x, s.z - other.position.z) < 24) {
            commands.push({ kind: "emit", event: "pulse-hit", target: { entityId: other.id } });
          }
        }
      }
    }
    if (__PLAYER__ && s.finished) {
      s.phase = "finished";
      const entries = [{ name: NAMES[0], progress: s.progress, finished: true, time: s.finishTime }];
      for (let index = 1; index < 6; index += 1) {
        const other = rival(index);
        entries.push({ name: NAMES[index], progress: other ? other.props.progress : 0, finished: !!(other && other.props.finished), time: other ? other.props.finishTime || 0 : 0 });
      }
      entries.sort((a, b) => a.finished && b.finished ? a.time - b.time : b.progress - a.progress);
      s.finalPosition = entries.findIndex(entry => entry.name === NAMES[0]) + 1;
      s.results = entries.map((entry, index) => (index + 1) + ". " + entry.name + "   " + (entry.finished ? entry.time.toFixed(2) + "s" : "+" + Math.max(0, (s.progress - entry.progress) * LENGTH / 32).toFixed(1) + "s"));
      emit("finish");
      if (s.finalPosition === 1) { emit("win"); }
      commands.push({ kind: "emitParticles", emitter: "confetti", count: 90 });
    }
  }
  if (__PLAYER__ && s.phase === "racing") {
    if (s.drifting && s.drift >= 0.2 && input.tick % 5 === 0) { commands.push({ kind: "emitParticles", emitter: "sparks", count: 5 }); }
    if (s.boost > 0 && input.tick % 4 === 0) { commands.push({ kind: "emitParticles", emitter: "exhaust", count: 6 }); }
  }
  const rotation = [0, Math.sin(s.yaw / 2), 0, Math.cos(s.yaw / 2)];
  commands.push({ kind: "setKinematicPose", position: { x: s.x, y: s.y, z: s.z }, rotation });
  if (input.tick % 6 === id || commands.some(command => command.kind === "emit") || tapped("pause") || tapped("start")) {
    if (input.entity.props.progress !== s.progress) { commands.push({ kind: "setProp", key: "progress", value: s.progress }); }
    if (input.entity.props.finished !== s.finished) { commands.push({ kind: "setProp", key: "finished", value: s.finished }); }
    if (s.finished && input.entity.props.finishTime !== s.finishTime) { commands.push({ kind: "setProp", key: "finishTime", value: s.finishTime }); }
    if (__PLAYER__) {
      let position = 1;
      for (let index = 1; index < 6; index += 1) {
        const other = rival(index);
        if (other && (other.props.finished || other.props.progress > s.progress)) { position += 1; }
      }
      commands.push({ kind: "setProp", key: "race", value: { phase: s.phase, countdown: Math.ceil(s.countdown / 60), lap: Math.min(3, s.lap + 1),
        position: s.finished ? s.finalPosition : position, speed: Math.round(Math.abs(s.speed) * 3.6), time: Math.round(s.time * 100) / 100, item: s.item, drift: s.drift,
        boost: s.boost / 120, shield: s.shield / 240, progress: wrap(s.progress), results: s.results, offroad: s.offroad } });
    }
  }
  return { state: s, commands };
}
