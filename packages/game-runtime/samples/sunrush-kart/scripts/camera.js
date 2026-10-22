(input) => {
  const s = input.state || {}, kart = world.get("racer-0");
  if (!kart) { return { state: s, commands: [] }; }
  const race = kart.props.race || { phase: "title", speed: 0, boost: 0 };
  const q = kart.rotation, yaw = Math.atan2(2 * (q[3] * q[1] + q[0] * q[2]), 1 - 2 * (q[1] * q[1] + q[2] * q[2]));
  const back = input.pressed.includes("lookBack"), title = race.phase === "title";
  const viewYaw = title ? yaw - 0.55 : yaw + (back ? Math.PI : 0);
  const distance = title ? 10 : 7.5 + race.speed * 0.012 + race.boost * 1.3;
  const desired = { x: kart.position.x + Math.sin(viewYaw) * distance,
    y: kart.position.y + (title ? 4.5 : 3.6), z: kart.position.z + Math.cos(viewYaw) * distance };
  const instant = !s.eye || s.back !== back || s.title !== title || race.speed < 1;
  const blend = instant ? 1 : 0.22;
  s.eye = s.eye || desired;
  s.eye.x += (desired.x - s.eye.x) * blend; s.eye.y += (desired.y - s.eye.y) * 0.18; s.eye.z += (desired.z - s.eye.z) * blend;
  s.back = back; s.title = title;
  const ahead = title ? 0 : 5;
  const dx = kart.position.x - Math.sin(viewYaw) * ahead - s.eye.x;
  const dy = kart.position.y + 1.1 - s.eye.y;
  const dz = kart.position.z - Math.cos(viewYaw) * ahead - s.eye.z;
  const cameraYaw = Math.atan2(-dx, -dz), pitch = Math.atan2(dy, Math.hypot(dx, dz));
  const sy = Math.sin(cameraYaw / 2), cy = Math.cos(cameraYaw / 2), sp = Math.sin(pitch / 2), cp = Math.cos(pitch / 2);
  return { state: s, commands: [{ kind: "setKinematicPose", position: s.eye, rotation: [cy * sp, sy * cp, -sy * sp, cy * cp] }] };
}
