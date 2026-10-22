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
      item: "", pickup: -1, hits: 0, bump: 0, finishTime: 0, finished: false, finalPosition: 1, results: [], lane, steer: 0, offroad: false,
      seen: [], jolt: 0, joltWait: 0, slide: 0, shove: 0, dodge: 0, dodgeTime: 0 });
  };
  // The rails stand 7.7 m from the center line and a kart is 2.5 m wide, so its center stops 1.3 m short of them.
  const WALL = WIDTH - 0.6, CONTACT = 2.7;
  // Pushes this kart out of every overlapping rival. Each racer reads the same snapshot, so both sides apply half the
  // overlap and an equal and opposite velocity change. Rival velocity comes from its last two snapshot positions.
  const contacts = (vx, vz) => {
    const result = { px: 0, pz: 0, ix: 0, iz: 0, closing: 0, touching: false };
    for (let index = 0; index < 6; index += 1) {
      if (index === id) { continue; }
      const other = rival(index);
      if (!other) { continue; }
      const ox = other.position.x, oz = other.position.z, last = s.seen[index];
      s.seen[index] = [ox, oz];
      if (other.props.finished) { continue; }
      let dx = s.x - ox, dz = s.z - oz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= CONTACT * CONTACT || Math.abs(s.y - other.position.y) > 2) { continue; }
      const d = Math.sqrt(d2);
      if (d < 0.01) { dx = id < index ? 1 : -1; dz = 0; } else { dx /= d; dz /= d; }
      let ovx = last ? (ox - last[0]) / dt : 0, ovz = last ? (oz - last[1]) / dt : 0;
      if (ovx * ovx + ovz * ovz > 4900) { ovx = 0; ovz = 0; }
      const closing = (vx - ovx) * dx + (vz - ovz) * dz;
      const impulse = closing < 0 ? -closing * 0.65 : 0;
      result.px += dx * (CONTACT - d) / 2; result.pz += dz * (CONTACT - d) / 2;
      result.ix += dx * impulse; result.iz += dz * impulse;
      result.closing = Math.max(result.closing, -closing); result.touching = true;
    }
    return result;
  };
  // Converts a world velocity back into speed and travel direction. A reversing kart keeps its negative speed.
  const setVelocity = (vx, vz) => {
    const magnitude = Math.hypot(vx, vz);
    if (magnitude < 0.05) { s.speed = 0; return; }
    if (s.speed < 0) { s.direction = Math.atan2(vx, vz); s.speed = -magnitude; }
    else { s.direction = Math.atan2(-vx, -vz); s.speed = magnitude; }
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
    s.stun = Math.max(0, s.stun - 1); s.bump = Math.max(0, s.bump - 1); s.joltWait = Math.max(0, s.joltWait - 1);
    // Events reach every script, so a racer reacts only to a pulse aimed at it, once per tick.
    const pulsed = input.events.some(event => event.kind === "trigger" && event.event === "pulse-hit" && event.target && event.target.entityId === input.entity.id);
    if (pulsed && s.shield === 0 && s.stun === 0) {
      s.stun = 75; s.speed *= 0.45; s.hits += 1; s.jolt += 1; emit("hit");
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
      const vx = -Math.sin(s.direction) * s.speed, vz = -Math.cos(s.direction) * s.speed, contact = contacts(vx, vz);
      if (contact.touching) {
        const absorb = s.shield ? 0.3 : 1;
        s.x += contact.px; s.z += contact.pz;
        setVelocity(vx + contact.ix * absorb, vz + contact.iz * absorb);
        if (contact.closing > 2.5 && s.joltWait === 0) { s.jolt += 1; s.joltWait = 20; }
        if (contact.closing > 5 && s.bump === 0) { emit("hit"); s.bump = 20; }
      }
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
      if (Math.abs(lane) > WALL) {
        // Push the kart back along the rail normal and cancel only the velocity that points into the rail.
        // A glancing contact scrapes along the rail and keeps most of its speed. A head-on contact stops the kart.
        const side = Math.sign(lane), nx = Math.cos(road.yaw) * side, nz = -Math.sin(road.yaw) * side, depth = Math.abs(lane) - WALL;
        s.x -= nx * depth; s.z -= nz * depth; s.lane = side * WALL;
        const wx = -Math.sin(s.direction) * s.speed, wz = -Math.cos(s.direction) * s.speed, into = wx * nx + wz * nz;
        if (into > 0) {
          // Rail friction removes speed in proportion to the impact, so a kart that stays on the rail does not stall.
          const ax = wx - nx * into, az = wz - nz * into, along = Math.hypot(ax, az);
          const keep = along > 0 ? Math.max(0, along - into * 0.35) / along : 0;
          setVelocity(ax * keep - nx * into * 0.2, az * keep - nz * into * 0.2);
          if (into > 3 && s.joltWait === 0) { s.jolt += 1; s.joltWait = 20; }
          if (s.speed > 0) { s.yaw = angle(s.yaw + angle(s.direction - s.yaw) * 0.5); }
          if (into > 6 && s.bump === 0) { emit("hit"); s.hits += 1; s.bump = 30; }
        }
      }
      if (tapped("recover") || best > 400) {
        const p = pose(s.progress, 0);
        s.x = p.x; s.y = p.y; s.z = p.z; s.yaw = p.yaw; s.direction = p.yaw;
        s.speed = 0; s.drift = 0; s.boost = 0; s.stun = 30; emit("hit");
      }
    } else {
      const target = s.stun ? 15 : s.boost ? 42 : 29.5 + id * 0.65 + Math.sin(s.time * 0.7 + id) * 1.3;
      s.speed += clamp(target - s.speed, -20 * dt, 13 * dt);
      // A rival works in its road frame: speed along the road, a lateral slide, and a shove off its racing line.
      const yaw = pose(s.progress, 0).yaw, tx = -Math.sin(yaw), tz = -Math.cos(yaw), lx = -tz, lz = tx;
      s.dodgeTime = Math.max(0, s.dodgeTime - 1);
      if (s.dodgeTime === 0) { s.dodge = 0; }
      for (let index = 0; index < 6; index += 1) {
        const other = rival(index);
        if (index === id || !other || other.props.finished) { continue; }
        const rx = other.position.x - s.x, rz = other.position.z - s.z, ahead = rx * tx + rz * tz, across = rx * lx + rz * lz;
        if (ahead > 0 && ahead < 10 && Math.abs(across) < 2.6) { s.dodge = across > 0 ? -3 : 3; s.dodgeTime = 50; }
      }
      const contact = contacts(tx * s.speed + lx * s.slide, tz * s.speed + lz * s.slide);
      s.speed = clamp(s.speed + contact.ix * tx + contact.iz * tz, 0, 50);
      s.slide += contact.ix * lx + contact.iz * lz;
      s.progress += (s.speed * dt + contact.px * tx + contact.pz * tz) / LENGTH;
      s.shove += s.slide * dt + contact.px * lx + contact.pz * lz + (s.dodge - s.shove) * 0.02;
      s.slide *= 0.9;
      const line = (id % 2 === 0 ? -2.5 : 2.5) + Math.sin(s.time * 0.6 + id) * 0.7;
      s.lane = clamp(line + s.shove, -WALL, WALL);
      if (s.lane !== line + s.shove) { s.shove = s.lane - line; s.slide = 0; }
      const p = pose(s.progress, s.lane);
      s.x = p.x; s.y = p.y; s.z = p.z; s.yaw = p.yaw; s.direction = p.yaw;
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
  let rotation = [0, Math.sin(s.yaw / 2), 0, Math.cos(s.yaw / 2)];
  if (!__PLAYER__) {
    // Presentation only: a rival rolls into bends through its pose rotation, which no other script reads. The player's
    // kart body script does the full job for racer-0. A rival keeps one filtered roll angle to stay cheap.
    const turn = s.lastYaw === undefined || input.tick < 2 ? 0 : angle(s.yaw - s.lastYaw);
    s.lastYaw = s.yaw;
    s.lean = (s.lean || 0) * 0.85 + (Math.abs(turn) > 0.2 ? 0 : -0.1 * Math.tanh(turn * 60 * s.speed * 0.045)) * 0.15;
    const a = Math.sin(s.yaw / 2), b = Math.cos(s.yaw / 2), c = Math.sin(s.lean / 2), d = Math.cos(s.lean / 2);
    rotation = [a * c, a * d, b * c, b * d];
  }
  commands.push({ kind: "setKinematicPose", position: { x: s.x, y: s.y, z: s.z }, rotation });
  // Presentation only: the player's kart body script reads these to tilt, hop and squash.
  if (__PLAYER__) {
    const driftFx = s.drifting && s.phase === "racing";
    if (!!input.entity.props.drifting !== driftFx) { commands.push({ kind: "setProp", key: "drifting", value: driftFx }); }
    if ((input.entity.props.jolt || 0) !== s.jolt) { commands.push({ kind: "setProp", key: "jolt", value: s.jolt }); }
  }
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
