(input) => {
  const s = input.state || {};
  const e = input.entity;
  const P = e.position, V = e.velocity, q = e.rotation;
  const dt = 1 / 60, g = 9.81, MASS = 8000, AREA = 26;
  const I = [124900, 130000, 8500];
  const GATES = __GATES__;
  const SPAWN = __SPAWN__;
  const WATER = __WATER__;
  const cmds = [];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = (a) => Math.sqrt(dot(a, a));
  const norm = (a) => { const l = len(a); return l > 1e-9 ? mul(a, 1 / l) : [0, 0, 0]; };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const rot = (v) => {
    const x = q[0], y = q[1], z = q[2], w = q[3];
    const ix = w * v[0] + y * v[2] - z * v[1], iy = w * v[1] + z * v[0] - x * v[2];
    const iz = w * v[2] + x * v[1] - y * v[0], iw = -x * v[0] - y * v[1] - z * v[2];
    return [ix * w - iw * x - iy * z + iz * y, iy * w - iw * y - iz * x + ix * z, iz * w - iw * z - ix * y + iy * x];
  };
  const vec = (o) => [o.x, o.y, o.z];
  const obj = (a) => ({ x: a[0], y: a[1], z: a[2] });
  const pos = vec(P), vel = vec(V);
  const F = rot([0, 0, -1]), U = rot([0, 1, 0]), R = rot([1, 0, 0]);
  const axes = input.axes || {};
  const pressed = (name) => input.pressed.indexOf(name) >= 0;
  const tapped = (name) => input.justPressed.indexOf(name) >= 0;

  if (s.thr === undefined) {
    s.thr = 0; s.gear = true; s.prevQ = q; s.comp = [0, 0, 0]; s.gate = 0; s.lap = 0; s.cam = 0;
    s.crashes = 0; s.started = -1; s.finished = -1; s.ab = false; s.stall = 0; s.ground = true; s.grain = 0; s.g = 1;
    s.cp = SPAWN;
  }

  // Angular velocity from the quaternion change since the previous tick.
  const p0 = s.prevQ;
  let dw = q[3] * p0[3] + q[0] * p0[0] + q[1] * p0[1] + q[2] * p0[2];
  const sign = dw < 0 ? -1 : 1;
  const dx = sign * (p0[3] * q[0] - q[3] * p0[0] - (q[1] * p0[2] - q[2] * p0[1]));
  const dy = sign * (p0[3] * q[1] - q[3] * p0[1] - (q[2] * p0[0] - q[0] * p0[2]));
  const dz = sign * (p0[3] * q[2] - q[3] * p0[2] - (q[0] * p0[1] - q[1] * p0[0]));
  const omega = [2 * dx / dt, 2 * dy / dt, 2 * dz / dt];
  s.prevQ = q;
  const rollRate = dot(omega, F), pitchRate = dot(omega, R), yawRate = -dot(omega, U);

  // Pilot input.
  const roll = clamp(axes.roll || 0, -1, 1), pitch = clamp(axes.pitch || 0, -1, 1), yaw = clamp(axes.yaw || 0, -1, 1);
  s.thr = clamp(s.thr + (axes.throttle || 0) * 0.55 * dt, 0, 1);
  if (tapped("gear") && !s.ground) { s.gear = !s.gear; cmds.push({ kind: "emit", event: "gear" }); cmds.push({ kind: "setAnimParam", name: "gear", value: s.gear }); }
  if (tapped("camera")) s.cam = (s.cam + 1) % 3;
  const brake = pressed("brake");
  if (s.started < 0 && s.thr > 0.05) s.started = input.tick;

  // Atmosphere and aerodynamics.
  const speed = len(vel);
  const rho = 1.225 * Math.exp(-pos[1] / 8500);
  const qd = 0.5 * rho * speed * speed;
  const vf = dot(vel, F), vu = dot(vel, U), vr = dot(vel, R);
  const alpha = speed > 3 ? Math.atan2(-vu, Math.max(vf, 0.1)) : 0;
  const beta = speed > 3 ? Math.atan2(vr, Math.max(vf, 0.1)) : 0;
  const flap = s.gear ? 0.28 : 0;
  const STALL = 0.27;
  const a = Math.abs(alpha);
  let cl = a < STALL ? 0.12 + flap + 4.9 * alpha : Math.sign(alpha) * Math.max(0.55, 1.44 + flap - (a - STALL) * 3.2);
  const stalled = a > STALL + 0.03 && speed > 20;
  const cd = 0.03 + 0.065 * cl * cl + (s.gear ? 0.03 : 0) + (brake && !s.ground ? 0.09 : 0) + (stalled ? 0.35 * Math.sin(a) : 0);
  const vhat = norm(vel);
  let force = [0, 0, 0];
  if (speed > 3) {
    const liftDir = norm(cross(R, vhat));
    force = add(force, mul(liftDir, qd * AREA * cl));
    force = add(force, mul(vhat, -qd * AREA * cd));
    force = add(force, mul(R, -qd * AREA * 0.9 * beta));
  }
  const ab = s.thr > 0.9;
  if (ab && !s.ab) cmds.push({ kind: "emit", event: "afterburner" });
  s.ab = ab;
  const dry = Math.min(s.thr, 0.9) / 0.9 * 56000;
  const thrust = (dry + (ab ? (s.thr - 0.9) / 0.1 * 34000 : 0)) * Math.pow(rho / 1.225, 0.7) * (1 - 0.12 * Math.min(speed / 300, 1.2));
  force = add(force, mul(F, thrust));

  // Landing gear: ray-cast suspension springs with tyre friction at each contact.
  const legs = [[0, -0.42, -4.7], [-1.25, -0.5, 1.15], [1.25, -0.5, 1.15]];
  const springs = [[90000, 14000], [230000, 32000], [230000, 32000]];
  const REST = 1.44;
  let onGround = false, load = 0;
  if (s.gear) {
    const hits = {};
    for (const result of input.queries || []) hits[result.queryId] = result;
    for (let k = 0; k < 3; k += 1) {
      const origin = add(pos, rot(legs[k]));
      const hit = hits["leg" + k];
      let compression = 0;
      if (hit && hit.distance !== undefined && hit.distance < REST) {
        compression = REST - hit.distance;
        const rate = (compression - s.comp[k]) / dt;
        const n = Math.max(0, springs[k][0] * compression + springs[k][1] * rate);
        const point = hit.position ? vec(hit.position) : add(origin, mul(U, -hit.distance));
        const rel = add(vel, cross(omega, add(point, mul(pos, -1))));
        const steer = k === 0 ? clamp(yaw, -1, 1) * 0.5 * clamp(1 - speed / 70, 0, 1) : 0;
        const side = norm(add(mul(R, Math.cos(steer)), mul(F, -Math.sin(steer))));
        const ahead = norm(cross(U, side));
        const vSide = dot(rel, side), vAhead = dot(rel, ahead);
        const fSide = -clamp(vSide / 0.6, -1, 1) * 0.9 * n;
        const fAhead = -clamp(vAhead / 0.5, -1, 1) * (brake && k > 0 ? 0.55 : 0.018) * n;
        const total = add(mul(U, n), add(mul(side, fSide), mul(ahead, fAhead)));
        cmds.push({ kind: "addForceAtPoint", force: obj(total), point: obj(point) });
        onGround = true;
        load += n;
      }
      if (!s.ground && compression > 0.02 && s.comp[k] === 0 && k > 0) cmds.push({ kind: "emit", event: "touchdown" });
      s.comp[k] = compression;
      cmds.push({ kind: "rayQuery", queryId: "leg" + k, origin: obj(origin), direction: obj(mul(U, -1)), maxDistance: 3, mask: 1 });
    }
  }
  s.ground = onGround;

  // Fly-by-wire: stick commands body rates, limited by speed and load factor.
  const authority = clamp(qd / (0.5 * 1.225 * 85 * 85), 0.06, 1.3);
  const effect = Math.min(1, authority * 1.15);
  let pCmd = roll * 3.1 * effect;
  let qCmd = pitch * Math.min(0.62, 8 * g / Math.max(speed, 40)) * effect;
  let rCmd = yaw * 0.35 * effect + (onGround ? 0 : 1.6 * beta * effect);
  if (stalled) {
    s.stall += 1;
    qCmd = Math.min(qCmd, -0.25);
    pCmd += (s.stall % 240 < 120 ? 0.6 : -0.6) * effect;
    if (s.stall % 45 === 1) cmds.push({ kind: "emit", event: "stall" });
  } else s.stall = 0;
  if (onGround) pCmd = 0;
  const k = onGround ? 2.5 : 5;
  const tPitch = clamp(I[0] * k * (qCmd - pitchRate), -9e5, 9e5);
  const tYaw = clamp(I[1] * k * (rCmd - yawRate), -9e5, 9e5);
  const tRoll = clamp(I[2] * k * (pCmd - rollRate), -9e5, 9e5);
  const torque = add(add(mul(R, tPitch), mul(U, -tYaw)), mul(F, tRoll));
  cmds.push({ kind: "addForce", force: obj(force) });
  cmds.push({ kind: "addTorque", torque: obj(torque) });
  cmds.push({ kind: "setAnimParam", name: "roll", value: roll });
  cmds.push({ kind: "setAnimParam", name: "pitch", value: pitch });
  cmds.push({ kind: "setAnimParam", name: "yaw", value: yaw });

  // Load factor felt by the pilot.
  const accel = s.v ? mul(add(vel, mul(s.v, -1)), 1 / dt) : [0, 0, 0];
  s.v = vel;
  s.g = s.g * 0.9 + 0.1 * (dot(add(accel, [0, g, 0]), U) / g);

  // Gates, crashes and respawns.
  let crashed = false;
  for (const event of input.events) {
    if (event.kind !== "contact" || event.phase !== "enter") continue;
    const other = event.entityId === e.id ? event.otherId : event.otherId === e.id ? event.entityId : null;
    if (!other) continue;
    if (event.sensor) {
      if (s.gate < GATES.length && other === GATES[s.gate].id) {
        const gate = GATES[s.gate];
        s.gate += 1;
        s.cp = { p: gate.p, q: gate.q };
        cmds.push({ kind: "emit", event: "gate", target: { entityId: gate.id }, payload: { gate: s.gate } });
        cmds.push({ kind: "spawn", prefabId: "gate-burst", position: { x: gate.p[0], y: gate.p[1], z: gate.p[2] }, rotation: gate.q });
        if (s.gate === GATES.length) {
          s.finished = input.tick;
          cmds.push({ kind: "emit", event: "victory" });
        }
      }
    } else if (!onGround || speed > 95 || dot(vel, U) < -6) crashed = true;
  }
  if (pos[1] < WATER + 1.5 && !onGround) crashed = true;
  if (tapped("reset")) crashed = true;
  if (crashed) {
    s.crashes += 1;
    const cp = s.cp;
    const fwd = [2 * (cp.q[0] * cp.q[2] + cp.q[3] * cp.q[1]) * -1, 2 * (cp.q[1] * cp.q[2] - cp.q[3] * cp.q[0]) * -1, (1 - 2 * (cp.q[0] * cp.q[0] + cp.q[1] * cp.q[1])) * -1];
    cmds.length = 0;
    cmds.push({ kind: "spawn", prefabId: "crash-burst", position: obj(pos) });
    cmds.push({ kind: "emit", event: "crash" });
    cmds.push({ kind: "teleport", position: { x: cp.p[0], y: cp.p[1], z: cp.p[2] }, rotation: cp.q, resetVelocity: true });
    if (cp.air) {
      s.pendingLaunch = mul(fwd, 120);
      s.thr = Math.max(s.thr, 0.6);
      s.gear = false;
      cmds.push({ kind: "setAnimParam", name: "gear", value: false });
    } else { s.thr = 0; s.gear = true; cmds.push({ kind: "setAnimParam", name: "gear", value: true }); }
    s.prevQ = cp.q; s.comp = [0, 0, 0]; s.v = undefined; s.ground = !cp.air;
  } else if (s.pendingLaunch) {
    cmds.push({ kind: "setVelocity", velocity: obj(s.pendingLaunch) });
    s.pendingLaunch = undefined;
  }

  // Engine and wind grains overlap by a quarter second, every two seconds.
  if (input.tick >= s.grain) {
    s.grain = input.tick + 120;
    cmds.push({ kind: "emit", event: ab ? "engine-ab" : s.thr > 0.35 ? "engine-mil" : "engine-idle" });
    if (speed > 120) cmds.push({ kind: "emit", event: "wind" });
  }

  // Effects and camera read these through world.get.
  const height = pos[1];
  if (input.tick % 2 === 0) cmds.push({ kind: "setProp", key: "fx", value: { thr: Math.round(s.thr * 100) / 100, g: Math.round(s.g * 10) / 10, spd: Math.round(speed), cam: s.cam, gate: s.gate } });

  // HUD at ten updates per second.
  if (input.tick % 6 === 0) {
    const knots = Math.round(speed * 1.944);
    const heading = Math.round(((Math.atan2(F[0], -F[2]) * 180 / Math.PI) + 360) % 360);
    const elapsed = s.started < 0 ? 0 : ((s.finished >= 0 ? s.finished : input.tick) - s.started) / 60;
    const mm = Math.floor(elapsed / 60), ss = elapsed - mm * 60;
    const next = s.gate < GATES.length ? GATES[s.gate] : null;
    const toGate = next ? Math.round(len(add(next.p, mul(pos, -1)))) : 0;
    cmds.push({ kind: "ui", id: "spd-value", text: String(knots) });
    cmds.push({ kind: "ui", id: "alt-value", text: String(Math.round(height * 3.281 / 10) * 10) });
    cmds.push({ kind: "ui", id: "hdg-value", text: String(heading).padStart(3, "0") });
    cmds.push({ kind: "ui", id: "thr-bar", value: s.thr });
    cmds.push({ kind: "ui", id: "thr-value", text: ab ? "AB" : Math.round(s.thr * 100) + "%" });
    cmds.push({ kind: "ui", id: "g-value", text: s.g.toFixed(1) + " G" });
    cmds.push({ kind: "ui", id: "gate-value", text: Math.min(s.gate + (next ? 1 : 0), GATES.length) + " / " + GATES.length });
    cmds.push({ kind: "ui", id: "gate-dist", text: next ? (toGate > 999 ? (toGate / 1000).toFixed(1) + " KM" : toGate + " M") : "COMPLETE" });
    cmds.push({ kind: "ui", id: "time-value", text: mm + ":" + (ss < 10 ? "0" : "") + ss.toFixed(1) });
    cmds.push({ kind: "ui", id: "gear-value", text: s.gear ? "DOWN" : "UP" });
    cmds.push({ kind: "ui", id: "stall", visible: stalled && input.tick % 24 < 12 });
    cmds.push({ kind: "ui", id: "finish", visible: s.finished >= 0 });
    if (s.finished >= 0) cmds.push({ kind: "ui", id: "finish-time", text: mm + ":" + (ss < 10 ? "0" : "") + ss.toFixed(2) });
  }
  return { state: s, commands: cmds };
}
