import { CatmullRomCurve3, Vector3 } from "three";

export const ROAD_HALF_WIDTH = 7;
export const RACER_COLORS = ["#ff6844", "#37b9d6", "#a38cf5", "#ffd052", "#65c892", "#ec81ad"];
export const RACER_NAMES = ["YOU", "REEF", "NOVA", "SOL", "FERN", "PEARL"];
const anchors = [
  [0, 2, 36], [0, 2, -10], [18, 3, -57], [62, 5, -76],
  [107, 8, -52], [124, 11, -10], [105, 12, 31], [70, 10, 42],
  [59, 6, 73], [88, 3, 103], [62, 2, 137], [13, 2, 131],
  [-32, 2, 104], [-43, 2, 65], [-21, 2, 43]
];
const curve = new CatmullRomCurve3(anchors.map(p => new Vector3(...p)), true, "centripetal");
export const COURSE = curve.getSpacedPoints(256).slice(0, -1).map(p => [Number(p.x.toFixed(4)), Number(p.y.toFixed(4)), Number(p.z.toFixed(4))]);
export const COURSE_LENGTH = COURSE.reduce((sum, p, index) => {
  const q = COURSE[(index + 1) % COURSE.length];
  return sum + Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
}, 0);
export function coursePose(progress, lane = 0) {
  const value = ((progress % 1) + 1) % 1 * COURSE.length;
  const index = Math.floor(value), t = value - index;
  const a = COURSE[index], b = COURSE[(index + 1) % COURSE.length];
  const dx = b[0] - a[0], dz = b[2] - a[2], length = Math.hypot(dx, dz);
  return { position: { x: a[0] + dx * t - dz / length * lane, y: a[1] + (b[1] - a[1]) * t, z: a[2] + dz * t + dx / length * lane }, yaw: Math.atan2(-dx, -dz) };
}
