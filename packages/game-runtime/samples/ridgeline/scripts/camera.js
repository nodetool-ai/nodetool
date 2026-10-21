(input) => {
  const s = input.state || {};
  const jet = world.get("jet");
  if (!jet) return { state: s, commands: [] };
  const dt = 1 / 60;
  const q = jet.rotation;
  const rot = (v) => {
    const x = q[0], y = q[1], z = q[2], w = q[3];
    const ix = w * v[0] + y * v[2] - z * v[1], iy = w * v[1] + z * v[0] - x * v[2];
    const iz = w * v[2] + x * v[1] - y * v[0], iw = -x * v[0] - y * v[1] - z * v[2];
    return [ix * w - iw * x - iy * z + iz * y, iy * w - iw * y - iz * x + ix * z, iz * w - iw * z - ix * y + iy * x];
  };
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => { const l = Math.sqrt(dot(a, a)); return l > 1e-9 ? mul(a, 1 / l) : [0, 0, -1]; };
  const lerp = (a, b, t) => add(a, mul(add(b, mul(a, -1)), t));
  const P = [jet.position.x, jet.position.y, jet.position.z];
  const V = [jet.velocity.x, jet.velocity.y, jet.velocity.z];
  const F = rot([0, 0, -1]), U = rot([0, 1, 0]), R = rot([1, 0, 0]);
  const fx = jet.props.fx || { cam: 0, spd: 0 };
  // The camera sees the jet one tick late, so lead it by one tick of travel.
  const lead = add(P, mul(V, dt));
  s.yaw = (s.yaw || 0) * 0.97 + input.look.x * 0.004;
  s.pitch = Math.max(-1.2, Math.min(1.2, (s.pitch || 0) * 0.97 + input.look.y * 0.004));
  let eye, target, up;
  if (fx.cam === 1) {
    eye = add(lead, add(mul(F, -2.6), mul(U, 1.25)));
    target = add(eye, add(mul(F, 50), mul(add(mul(R, Math.sin(s.yaw)), mul(U, -Math.sin(s.pitch))), 50)));
    up = U;
    s.eye = undefined;
  } else if (fx.cam === 2) {
    // Flyby: a fixed spot ahead of the jet, moved again once the jet has passed it.
    if (!s.fly || dot(add(lead, mul(s.fly, -1)), F) > 160) {
      s.fly = add(add(lead, mul(F, 220 + fx.spd * 1.5)), add(mul(R, 24), [0, 8, 0]));
    }
    eye = s.fly;
    target = lead;
    up = [0, 1, 0];
    s.eye = undefined;
  } else {
    const upMix = norm(lerp([0, 1, 0], U, 0.5));
    const dist = 17 + fx.spd * 0.018;
    let offset = add(mul(F, -dist), mul(upMix, 4.2));
    if (s.yaw || s.pitch) {
      const cy = Math.cos(s.yaw), sy = Math.sin(s.yaw);
      offset = add(add(mul(R, dot(offset, R) * cy - dot(offset, F) * sy), mul(F, dot(offset, R) * sy + dot(offset, F) * cy)), mul(U, dot(offset, U)));
      offset = add(offset, [0, Math.sin(s.pitch) * dist, 0]);
    }
    const desired = add(lead, offset);
    s.eye = s.eye ? lerp(add(s.eye, mul(V, dt)), desired, 0.16) : desired;
    eye = s.eye;
    target = add(lead, add(mul(F, 26), mul(U, 1.4)));
    up = upMix;
  }
  // Look rotation: the camera looks down its local -Z.
  const back = norm(add(eye, mul(target, -1)));
  const right = norm(cross(up, back));
  const camUp = cross(back, right);
  const m00 = right[0], m01 = camUp[0], m02 = back[0], m10 = right[1], m11 = camUp[1], m12 = back[1], m20 = right[2], m21 = camUp[2], m22 = back[2];
  const trace = m00 + m11 + m22;
  let x, y, z, w;
  if (trace > 0) { const t = 0.5 / Math.sqrt(trace + 1); w = 0.25 / t; x = (m21 - m12) * t; y = (m02 - m20) * t; z = (m10 - m01) * t; }
  else if (m00 > m11 && m00 > m22) { const t = 2 * Math.sqrt(1 + m00 - m11 - m22); w = (m21 - m12) / t; x = 0.25 * t; y = (m01 + m10) / t; z = (m02 + m20) / t; }
  else if (m11 > m22) { const t = 2 * Math.sqrt(1 + m11 - m00 - m22); w = (m02 - m20) / t; x = (m01 + m10) / t; y = 0.25 * t; z = (m12 + m21) / t; }
  else { const t = 2 * Math.sqrt(1 + m22 - m00 - m11); w = (m10 - m01) / t; x = (m02 + m20) / t; y = (m12 + m21) / t; z = 0.25 * t; }
  return { state: s, commands: [{ kind: "setKinematicPose", position: { x: eye[0], y: eye[1], z: eye[2] }, rotation: [x, y, z, w] }] };
}
