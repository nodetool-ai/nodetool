(input) => {
  const LIFT = __LIFT__, SCALE = __SCALE__, R = 12, dt = 1 / 60;
  const s = input.state || {};
  // Only the player's kart runs this. Rivals lean through their racer pose in racer.js.
  // The lever entity sits R behind the racer and carries the kart R ahead of itself. Turning it about X lifts the kart,
  // because a script can set a child's rotation and scale but never its position.
  if (LIFT) {
    const kart = world.get("kart-0"), lift = kart ? kart.props.lift || 0 : 0;
    if (lift === s.lift) { return { state: s, commands: [] }; }
    s.lift = lift;
    const a = -Math.asin(Math.min(lift / R, 1)) / 2;
    return { state: s, commands: [{ kind: "setVisual", rotation: [Math.sin(a), 0, 0, Math.cos(a)] }] };
  }
  const racer = world.get("racer-0");
  if (!racer) { return { state: s, commands: [] }; }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const angle = v => Math.atan2(Math.sin(v), Math.cos(v));
  const mul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
  const step = (key, target, k, c) => { s[key + "V"] += (k * (target - s[key]) - c * s[key + "V"]) * dt; s[key] += s[key + "V"] * dt; };
  const q = racer.rotation, yaw = Math.atan2(2 * (q[3] * q[1] + q[0] * q[2]), 1 - 2 * (q[1] * q[1] + q[2] * q[2]));
  const x = racer.position.x, z = racer.position.z, props = racer.props;
  // A first tick or a teleport (recover, restart) restarts every filter instead of reading a huge speed.
  if (s.x === undefined || Math.hypot(x - s.x, z - s.z) > 2.5) {
    Object.assign(s, { fwd: 0, acc: 0, w: 0, roll: 0, rollV: 0, pitch: 0, pitchV: 0, off: 0, offV: 0, sq: 0, sqV: 0, hop: 0, hopV: 0,
      drifting: false, sign: 1, jolt: props.jolt || 0, lift: 0 });
  } else {
    const fwd = (-Math.sin(yaw) * (x - s.x) - Math.cos(yaw) * (z - s.z)) / dt;
    s.acc += ((fwd - s.fwd) / dt - s.acc) * 0.12;
    s.w += (angle(yaw - s.yaw) / dt - s.w) * 0.25;
    s.fwd = fwd;
  }
  s.x = x; s.z = z; s.yaw = yaw;
  const drifting = !!props.drifting, speed = clamp(s.fwd / 30, 0, 1), t = input.tick;
  if (drifting && Math.abs(s.w) > 0.15) { s.sign = Math.sign(s.w); }
  if (drifting && !s.drifting) { s.hopV = 2.8; }
  s.drifting = drifting;
  if (s.hop > 0 || s.hopV > 0) {
    s.hopV -= 16 * dt; s.hop += s.hopV * dt;
    if (s.hop <= 0) { s.hop = 0; s.hopV = 0; s.sqV += 2.2; }
  }
  const jolt = props.jolt || 0;
  if (jolt !== s.jolt) { s.jolt = jolt; s.sqV += 3; }
  // Lateral acceleration leans the body outward. Acceleration pitches the nose up and braking pitches it down.
  const bend = 0.16 * Math.tanh(s.w * s.fwd * 0.0045 / 0.16), sign = drifting ? s.sign : 0;
  step("roll", -bend - 0.03 * sign + 0.004 * speed * Math.sin(t * 0.51), 140, 19);
  step("pitch", clamp(s.acc * 0.0035, -0.09, 0.06) + 0.005 * speed * Math.sin(t * 0.37), 140, 19);
  step("off", 0.17 * sign, 60, 14);
  step("sq", 0, 500, 12);
  s.sq = clamp(s.sq, -0.15, 0.2);
  const lift = Math.round((0.9 * (Math.abs(Math.sin(s.roll)) + 1.4 * Math.abs(Math.sin(s.pitch))) + s.hop) * SCALE * 1000) / 1000;
  const c = Math.asin(Math.min(lift / R, 1)), sy = 1 - s.sq + 0.01 * speed * Math.sin(t * 0.42), sxz = 1 + s.sq * 0.5;
  const o = mul(mul(mul([Math.sin(c / 2), 0, 0, Math.cos(c / 2)], [0, Math.sin(s.off / 2), 0, Math.cos(s.off / 2)]),
    [Math.sin(s.pitch / 2), 0, 0, Math.cos(s.pitch / 2)]), [0, 0, Math.sin(s.roll / 2), Math.cos(s.roll / 2)]);
  const n = Math.hypot(o[0], o[1], o[2], o[3]);
  const commands = [{ kind: "setVisual", rotation: [o[0] / n, o[1] / n, o[2] / n, o[3] / n], scale: { x: sxz * SCALE, y: sy * SCALE, z: sxz * SCALE } }];
  if (lift !== s.lift) { s.lift = lift; commands.push({ kind: "setProp", key: "lift", value: lift }); }
  return { state: s, commands };
}
