(input) => {
  const s = input.state || {}, kart = world.get("racer-0");
  if (!kart) { return { state: s, commands: [] }; }
  const race = kart.props.race || { phase: "title", speed: 0, boost: 0 };
  const q = kart.rotation, yaw = Math.atan2(2 * (q[3] * q[1] + q[0] * q[2]), 1 - 2 * (q[1] * q[1] + q[2] * q[2]));
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a)), clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const back = input.pressed.includes("lookBack"), title = race.phase === "title", countdown = race.phase === "countdown";
  const p = kart.position, tick = input.tick;
  // Speed and slip come from the kart's motion, because props.race updates every 6 ticks.
  const px = s.px === undefined ? p.x : s.px, pz = s.pz === undefined ? p.z : s.pz;
  const mx = p.x - px, mz = p.z - pz, step = Math.hypot(mx, mz), jump = step > 3;
  s.px = p.x; s.pz = p.z;
  s.spd = (s.spd || 0) + (jump ? 0 : step * 60 - (s.spd || 0)) * 0.12;
  const sp = clamp(s.spd / 37, 0, 1.15);
  const slip = step > 0.1 && !jump ? wrap(Math.atan2(-mx, -mz) - yaw) : 0;
  s.slip = (s.slip || 0) + (clamp(slip, -0.7, 0.7) - (s.slip || 0)) * 0.15;
  const slide = Math.min(1, Math.abs(s.slip) / 0.3);
  const instant = !s.eye || s.back !== back || s.title !== title || race.speed < 1 || jump;
  // The view yaw trails the kart. It lags less with speed and more in a drift, and leans toward the travel direction.
  const aim = title ? yaw - 0.55 : yaw - s.slip * 0.6;
  s.vy = instant || s.vy === undefined ? aim : s.vy + wrap(aim - s.vy) * (0.12 + 0.2 * sp) * (1 - 0.6 * slide);
  const viewYaw = s.vy + (back && !title ? Math.PI : 0);
  // Start grid: high and steep during the countdown, easing into the chase after go.
  s.g = countdown ? 1 : race.phase === "racing" ? Math.max(0, (s.g || 0) - 0.01) : s.g || 0;
  const ge = s.g * s.g * (3 - 2 * s.g);
  // Lift the camera while a rival sits between it and the kart.
  const bx = Math.sin(viewYaw), bz = Math.cos(viewYaw), reach = 9;
  let block = s.block || 0;
  if (tick % 4 === 0) {
    block = 0;
    for (let i = 1; i < 6; i += 1) {
      const r = world.get("racer-" + i);
      if (!r) { continue; }
      const rx = r.position.x - p.x, rz = r.position.z - p.z, along = rx * bx + rz * bz, side = rx * bz - rz * bx;
      if (along > 1 && along < reach && Math.abs(side) < 2.4) { block = 1; }
    }
    s.block = block;
  }
  s.occ = (s.occ || 0) + (block - (s.occ || 0)) * (block ? 0.1 : 0.04);
  // Boost pulls the camera back and settles. A hit starts a decaying shake.
  for (const e of input.events) {
    if (e.kind !== "trigger" || e.entityId !== "racer-0") { continue; }
    if (e.event === "boost") { s.boostAt = tick; }
    if (e.event === "hit") { s.hitAt = tick; }
  }
  const bt = (tick - (s.boostAt === undefined ? -999 : s.boostAt)) / 14;
  const pull = bt >= 0 && bt < 6 ? bt * Math.exp(1 - bt) * 2.2 : 0;
  const ht = tick - (s.hitAt === undefined ? -999 : s.hitAt), shake = ht >= 0 && ht < 36 ? Math.exp(-ht / 9) : 0;
  const distance = title ? 10 : 8.4 - 2 * Math.min(sp, 1.1) + pull + ge * 3 - s.occ * 1.2;
  const height = title ? 4.5 : 3.9 - 1.1 * Math.min(sp, 1.1) + ge * 4.5 + s.occ * 2;
  const desired = { x: p.x + bx * distance, y: p.y + height, z: p.z + bz * distance };
  const blend = instant ? 1 : 0.16 + 0.14 * sp;
  s.eye = s.eye || desired;
  s.eye.x += (desired.x - s.eye.x) * blend; s.eye.y += (desired.y - s.eye.y) * (instant ? 1 : 0.15); s.eye.z += (desired.z - s.eye.z) * blend;
  s.back = back; s.title = title;
  const ahead = title ? 0 : 5 - ge;
  const dx = p.x - bx * ahead - s.eye.x, dy = p.y + 1.1 - s.eye.y, dz = p.z - bz * ahead - s.eye.z;
  const cameraYaw = Math.atan2(-dx, -dz), pitch = Math.atan2(dy, Math.hypot(dx, dz)) + Math.sin(tick * 3.3) * 0.02 * shake;
  const roll = Math.sin(tick * 1.9) * 0.05 * shake - s.slip * 0.1 * (title ? 0 : 1);
  const rx = Math.cos(cameraYaw), rz = -Math.sin(cameraYaw), jx = Math.sin(tick * 2.1) * 0.22 * shake, jy = Math.cos(tick * 2.7) * 0.16 * shake - 0.12 * shake;
  const sy = Math.sin(cameraYaw / 2), cy = Math.cos(cameraYaw / 2), sp2 = Math.sin(pitch / 2), cp = Math.cos(pitch / 2), sr = Math.sin(roll / 2), cr = Math.cos(roll / 2);
  const a = [cy * sp2, sy * cp, -sy * sp2, cy * cp];
  const rotation = [a[0] * cr + a[1] * sr, a[1] * cr - a[0] * sr, a[2] * cr + a[3] * sr, a[3] * cr - a[2] * sr];
  return { state: s, commands: [{ kind: "setKinematicPose", position: { x: s.eye.x + rx * jx, y: s.eye.y + jy, z: s.eye.z + rz * jx }, rotation }] };
}
