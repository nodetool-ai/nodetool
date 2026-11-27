/**
 * The blockout figure: a jointed mannequin made of plain nodes and simple
 * meshes, so every glTF renderer draws it with no skinning and no new code.
 *
 * A figure is one root node with a tree of joint nodes under it. Each joint
 * node sits at its pivot (the shoulder, the knee) and carries the mesh of the
 * limb that hangs from it, so a pose is nothing but a rotation per joint.
 *
 * Conventions: +Y is up, the figure faces +Z (the glTF front), and its left
 * side is +X. The root's origin is on the ground under the pelvis, and the
 * lowest point of every pose rests on y = 0. Lengths are meters.
 */

import {
  composeMatrix,
  eulerDegreesToQuaternion,
  multiplyMatrices,
  transformPoint,
  type Vec3
} from "./math.js";
import {
  buildShapeGeometry,
  mergeGeometries,
  transformGeometry,
  type Geometry
} from "./primitives.js";

export const FIGURE_BODIES = ["male", "female", "child"] as const;
export type FigureBody = (typeof FIGURE_BODIES)[number];

export const FIGURE_POSES = ["stand", "sit", "walk", "run", "lie"] as const;
export type FigurePose = (typeof FIGURE_POSES)[number];

export const FIGURE_JOINTS = [
  "pelvis",
  "torso",
  "head",
  "upperArmL",
  "lowerArmL",
  "handL",
  "upperArmR",
  "lowerArmR",
  "handR",
  "upperLegL",
  "lowerLegL",
  "footL",
  "upperLegR",
  "lowerLegR",
  "footR"
] as const;
export type FigureJoint = (typeof FIGURE_JOINTS)[number];

export const FIGURE_DEFAULT_BODY: FigureBody = "male";
export const FIGURE_DEFAULT_POSE: FigurePose = "stand";
export const FIGURE_DEFAULT_COLOR = "#b8b8b8";

/** Standing height per body, in meters. */
export const FIGURE_DEFAULT_HEIGHT: Record<FigureBody, number> = {
  male: 1.8,
  female: 1.65,
  child: 1.2
};

export const FIGURE_MIN_HEIGHT = 0.3;
export const FIGURE_MAX_HEIGHT = 3;

/** Root node extras key: `{ body, pose, height, entityId?, label? }`. */
export const FIGURE_EXTRA = "nodetool_figure";
/** Joint node extras key: the {@link FigureJoint} the node is. */
export const FIGURE_PART_EXTRA = "nodetool_figure_part";

/** What the root node's `nodetool_figure` extra holds. */
export interface FigureInfo {
  body: FigureBody;
  pose: FigurePose;
  /** Standing height in meters, whatever the pose. */
  height: number;
  /** The cast entity this figure stands in for. */
  entityId?: string;
  /** A free-text label such as a character name. */
  label?: string;
}

export const FIGURE_JOINT_NAMES: Record<FigureJoint, string> = {
  pelvis: "Pelvis",
  torso: "Torso",
  head: "Head",
  upperArmL: "Upper Arm L",
  lowerArmL: "Lower Arm L",
  handL: "Hand L",
  upperArmR: "Upper Arm R",
  lowerArmR: "Lower Arm R",
  handR: "Hand R",
  upperLegL: "Upper Leg L",
  lowerLegL: "Lower Leg L",
  footL: "Foot L",
  upperLegR: "Upper Leg R",
  lowerLegR: "Lower Leg R",
  footR: "Foot R"
};

const FIGURE_PARENTS: Record<FigureJoint, FigureJoint | null> = {
  pelvis: null,
  torso: "pelvis",
  head: "torso",
  upperArmL: "torso",
  lowerArmL: "upperArmL",
  handL: "lowerArmL",
  upperArmR: "torso",
  lowerArmR: "upperArmR",
  handR: "lowerArmR",
  upperLegL: "pelvis",
  lowerLegL: "upperLegL",
  footL: "lowerLegL",
  upperLegR: "pelvis",
  lowerLegR: "upperLegR",
  footR: "lowerLegR"
};

/** Body measures as fractions of the standing height. */
interface Proportions {
  hipY: number;
  hipX: number;
  kneeY: number;
  ankleY: number;
  waistY: number;
  shoulderY: number;
  shoulderX: number;
  neckY: number;
  headRadius: Vec3;
  neckRadius: number;
  /** Half widths of the trunk at the hips, waist and chest. */
  hipHalf: number;
  waistHalf: number;
  chestHalf: number;
  /** Trunk depth as a fraction of its width. */
  trunkDepth: number;
  upperArm: number;
  lowerArm: number;
  hand: number;
  armRadius: number;
  thighRadius: number;
  footLength: number;
}

const PROPORTIONS: Record<FigureBody, Proportions> = {
  male: {
    hipY: 0.52,
    hipX: 0.052,
    kneeY: 0.285,
    ankleY: 0.042,
    waistY: 0.61,
    shoulderY: 0.808,
    shoulderX: 0.122,
    neckY: 0.835,
    headRadius: [0.045, 0.066, 0.053],
    neckRadius: 0.03,
    hipHalf: 0.094,
    waistHalf: 0.082,
    chestHalf: 0.108,
    trunkDepth: 0.6,
    upperArm: 0.172,
    lowerArm: 0.146,
    hand: 0.1,
    armRadius: 0.027,
    thighRadius: 0.052,
    footLength: 0.148
  },
  female: {
    hipY: 0.525,
    hipX: 0.054,
    kneeY: 0.285,
    ankleY: 0.042,
    waistY: 0.625,
    shoulderY: 0.805,
    shoulderX: 0.102,
    neckY: 0.832,
    headRadius: [0.046, 0.067, 0.054],
    neckRadius: 0.026,
    hipHalf: 0.1,
    waistHalf: 0.068,
    chestHalf: 0.09,
    trunkDepth: 0.62,
    upperArm: 0.168,
    lowerArm: 0.143,
    hand: 0.097,
    armRadius: 0.023,
    thighRadius: 0.053,
    footLength: 0.143
  },
  child: {
    hipY: 0.49,
    hipX: 0.052,
    kneeY: 0.27,
    ankleY: 0.045,
    waistY: 0.585,
    shoulderY: 0.768,
    shoulderX: 0.112,
    neckY: 0.795,
    headRadius: [0.06, 0.08, 0.068],
    neckRadius: 0.03,
    hipHalf: 0.09,
    waistHalf: 0.084,
    chestHalf: 0.098,
    trunkDepth: 0.68,
    upperArm: 0.158,
    lowerArm: 0.135,
    hand: 0.092,
    armRadius: 0.026,
    thighRadius: 0.05,
    footLength: 0.15
  }
};

type PoseRotations = Partial<Record<FigureJoint, Vec3>>;

/**
 * Joint rotations per pose, in Euler degrees (XYZ order). A limb hangs along
 * -Y, so a negative X rotation swings it forward and a positive one bends it
 * back. A positive Z rotation lifts the left arm away from the body.
 */
const POSES: Record<FigurePose, PoseRotations> = {
  stand: {
    upperArmL: [0, 0, 7],
    upperArmR: [0, 0, -7],
    lowerArmL: [-8, 0, 0],
    lowerArmR: [-8, 0, 0]
  },
  sit: {
    upperLegL: [-90, 0, 0],
    upperLegR: [-90, 0, 0],
    lowerLegL: [90, 0, 0],
    lowerLegR: [90, 0, 0],
    upperArmL: [-15, 0, 6],
    upperArmR: [-15, 0, -6],
    lowerArmL: [-55, 0, 0],
    lowerArmR: [-55, 0, 0]
  },
  walk: {
    torso: [3, 0, 0],
    upperLegL: [-27, 0, 0],
    lowerLegL: [10, 0, 0],
    footL: [-8, 0, 0],
    upperLegR: [20, 0, 0],
    lowerLegR: [22, 0, 0],
    footR: [12, 0, 0],
    upperArmL: [24, 0, 6],
    lowerArmL: [-14, 0, 0],
    upperArmR: [-26, 0, -6],
    lowerArmR: [-26, 0, 0]
  },
  run: {
    torso: [14, 0, 0],
    head: [-10, 0, 0],
    upperLegL: [-62, 0, 0],
    lowerLegL: [78, 0, 0],
    upperLegR: [26, 0, 0],
    lowerLegR: [70, 0, 0],
    footR: [35, 0, 0],
    upperArmL: [48, 0, 8],
    lowerArmL: [-88, 0, 0],
    upperArmR: [-46, 0, -8],
    lowerArmR: [-95, 0, 0]
  },
  lie: {
    // On the back, face up, head toward -Z.
    pelvis: [-90, 0, 0],
    upperArmL: [0, 0, 10],
    upperArmR: [0, 0, -10],
    upperLegL: [0, 0, 3],
    upperLegR: [0, 0, -3]
  }
};

/** One joint node of a built figure. */
export interface FigurePart {
  joint: FigureJoint;
  name: string;
  parent: FigureJoint | null;
  /** Pivot position in the parent joint's frame (the root's, for the pelvis). */
  translation: Vec3;
  /** Euler degrees, XYZ order. */
  rotation: Vec3;
  /** The limb's mesh in the joint's own frame, pivot at the origin. */
  geometry: Geometry;
}

export interface BuiltFigure {
  parts: FigurePart[];
  triangleCount: number;
}

const RADIAL = 12;
const BALL = { widthSegments: 10, heightSegments: 6 };

const ellipsoid = (radius: Vec3, center: Vec3, segments = BALL): Geometry =>
  transformGeometry(buildShapeGeometry({ shape: "sphere", radius: 1, ...segments }), radius, center);

const ball = (radius: number, center: Vec3 = [0, 0, 0]): Geometry =>
  ellipsoid([radius, radius, radius], center);

/** A tapered tube from y = 0 down to y = -length, optionally flattened in Z. */
const limb = (radiusTop: number, radiusBottom: number, length: number, depth = 1): Geometry =>
  transformGeometry(
    buildShapeGeometry({
      shape: "cylinder",
      radiusTop,
      radiusBottom,
      height: length,
      radialSegments: RADIAL
    }),
    [1, 1, depth],
    [0, -length / 2, 0]
  );

/** A tapered tube from y = 0 up to y = height, flattened in Z. */
const trunk = (radiusBottom: number, radiusTop: number, height: number, depth: number, fromY = 0): Geometry =>
  transformGeometry(
    buildShapeGeometry({
      shape: "cylinder",
      radiusTop,
      radiusBottom,
      height,
      radialSegments: RADIAL
    }),
    [1, 1, depth],
    [0, fromY + height / 2, 0]
  );

function partGeometries(p: Proportions, h: number): Record<FigureJoint, Geometry> {
  const s = (value: number): number => value * h;
  const upperLeg = s(p.hipY - p.kneeY);
  const lowerLeg = s(p.kneeY - p.ankleY);
  const thigh = s(p.thighRadius);
  const knee = thigh * 0.72;
  const ankle = thigh * 0.5;
  const arm = s(p.armRadius);
  const elbow = arm * 0.86;
  const wrist = arm * 0.7;
  const trunkHeight = s(p.shoulderY - p.waistY);
  const pelvisDrop = s(0.045);
  const pelvisRise = s(p.waistY - p.hipY);
  const head = p.headRadius.map(s) as Vec3;
  const neckLength = s(1 - p.neckY) - head[1] * 2 + head[1] * 0.35;
  const footHeight = s(p.ankleY);
  const footLength = s(p.footLength);

  const arms = (): { upper: Geometry; lower: Geometry; hand: Geometry } => ({
    upper: mergeGeometries([ball(arm * 1.3), limb(arm, elbow, s(p.upperArm))]),
    lower: mergeGeometries([ball(elbow), limb(elbow, wrist, s(p.lowerArm))]),
    hand: ellipsoid(
      [wrist * 0.62, s(p.hand) / 2, wrist * 1.25],
      [0, -s(p.hand) / 2, 0]
    )
  });
  const leg = (): { upper: Geometry; lower: Geometry; foot: Geometry } => ({
    upper: mergeGeometries([ball(thigh), limb(thigh, knee, upperLeg)]),
    lower: mergeGeometries([ball(knee), limb(knee * 0.95, ankle, lowerLeg)]),
    foot: mergeGeometries([
      ball(ankle),
      transformGeometry(
        buildShapeGeometry({ shape: "box", size: [ankle * 2, footHeight, footLength] }),
        [1, 1, 1],
        [0, -footHeight / 2, footLength / 2 - ankle * 1.4]
      )
    ])
  });
  const left = arms();
  const right = arms();
  const legL = leg();
  const legR = leg();

  return {
    pelvis: mergeGeometries([
      trunk(s(p.hipHalf), s(p.waistHalf), pelvisRise + pelvisDrop * 0.2, p.trunkDepth, -pelvisDrop * 0.2),
      ellipsoid(
        [s(p.hipHalf), pelvisDrop * 1.5, s(p.hipHalf) * p.trunkDepth * 1.1],
        [0, -pelvisDrop * 0.2, 0]
      )
    ]),
    torso: mergeGeometries([
      trunk(s(p.waistHalf), s(p.chestHalf), trunkHeight, p.trunkDepth),
      // A rounded shoulder line closes the top of the chest.
      ellipsoid(
        [s(p.chestHalf), s(0.03), s(p.chestHalf) * p.trunkDepth],
        [0, trunkHeight, 0]
      )
    ]),
    head: mergeGeometries([
      trunk(s(p.neckRadius), s(p.neckRadius) * 0.92, neckLength, 1),
      ellipsoid(head, [0, s(1 - p.neckY) - head[1], head[2] * 0.12], {
        widthSegments: 14,
        heightSegments: 10
      })
    ]),
    upperArmL: left.upper,
    lowerArmL: left.lower,
    handL: left.hand,
    upperArmR: right.upper,
    lowerArmR: right.lower,
    handR: right.hand,
    upperLegL: legL.upper,
    lowerLegL: legL.lower,
    footL: legL.foot,
    upperLegR: legR.upper,
    lowerLegR: legR.lower,
    footR: legR.foot
  };
}

function restTranslations(p: Proportions, h: number): Record<FigureJoint, Vec3> {
  const s = (value: number): number => value * h;
  const arm = (side: 1 | -1) => ({
    upper: [side * s(p.shoulderX), s(p.shoulderY - p.waistY), 0] as Vec3,
    lower: [0, -s(p.upperArm), 0] as Vec3,
    hand: [0, -s(p.lowerArm), 0] as Vec3
  });
  const leg = (side: 1 | -1) => ({
    upper: [side * s(p.hipX), 0, 0] as Vec3,
    lower: [0, -s(p.hipY - p.kneeY), 0] as Vec3,
    foot: [0, -s(p.kneeY - p.ankleY), 0] as Vec3
  });
  const armL = arm(1);
  const armR = arm(-1);
  const legL = leg(1);
  const legR = leg(-1);
  return {
    pelvis: [0, s(p.hipY), 0],
    torso: [0, s(p.waistY - p.hipY), 0],
    head: [0, s(p.neckY - p.waistY), 0],
    upperArmL: armL.upper,
    lowerArmL: armL.lower,
    handL: armL.hand,
    upperArmR: armR.upper,
    lowerArmR: armR.lower,
    handR: armR.hand,
    upperLegL: legL.upper,
    lowerLegL: legL.lower,
    footL: legL.foot,
    upperLegR: legR.upper,
    lowerLegR: legR.lower,
    footR: legR.foot
  };
}

/** Each part's matrix in the figure root's frame. */
export function figureWorldMatrices(parts: readonly FigurePart[]): Map<FigureJoint, number[]> {
  const world = new Map<FigureJoint, number[]>();
  // FIGURE_JOINTS lists every parent before its children.
  for (const part of parts) {
    const local = composeMatrix(
      part.translation,
      eulerDegreesToQuaternion(part.rotation),
      [1, 1, 1]
    );
    const parent = part.parent ? world.get(part.parent) : undefined;
    world.set(part.joint, parent ? multiplyMatrices(parent, local) : local);
  }
  return world;
}

/** The figure's bounds in its root's frame. */
export function figureBounds(parts: readonly FigurePart[]): { min: Vec3; max: Vec3 } {
  const world = figureWorldMatrices(parts);
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const part of parts) {
    const matrix = world.get(part.joint) as number[];
    const positions = part.geometry.positions;
    for (let i = 0; i < positions.length; i += 3) {
      const point = transformPoint(matrix, [positions[i], positions[i + 1], positions[i + 2]]);
      for (let axis = 0; axis < 3; axis += 1) {
        min[axis] = Math.min(min[axis], point[axis]);
        max[axis] = Math.max(max[axis], point[axis]);
      }
    }
  }
  return { min, max };
}

export const isFigureBody = (value: unknown): value is FigureBody =>
  typeof value === "string" && (FIGURE_BODIES as readonly string[]).includes(value);

export const isFigurePose = (value: unknown): value is FigurePose =>
  typeof value === "string" && (FIGURE_POSES as readonly string[]).includes(value);

export const isFigureJoint = (value: unknown): value is FigureJoint =>
  typeof value === "string" && (FIGURE_JOINTS as readonly string[]).includes(value);

/**
 * Build a figure's joint tree. `height` is the standing height in meters and
 * defaults to the body's own. The pelvis is lifted or lowered so the lowest
 * point of the pose rests on y = 0.
 */
export function buildFigure(
  body: FigureBody = FIGURE_DEFAULT_BODY,
  pose: FigurePose = FIGURE_DEFAULT_POSE,
  height: number = FIGURE_DEFAULT_HEIGHT[body]
): BuiltFigure {
  const proportions = PROPORTIONS[body];
  const geometries = partGeometries(proportions, height);
  const translations = restTranslations(proportions, height);
  const rotations = POSES[pose];
  const parts: FigurePart[] = FIGURE_JOINTS.map((joint) => ({
    joint,
    name: FIGURE_JOINT_NAMES[joint],
    parent: FIGURE_PARENTS[joint],
    translation: translations[joint],
    rotation: rotations[joint] ?? [0, 0, 0],
    geometry: geometries[joint]
  }));
  const { min } = figureBounds(parts);
  const pelvis = parts[0];
  pelvis.translation = [0, pelvis.translation[1] - min[1], 0];
  const triangleCount = parts.reduce((sum, part) => sum + part.geometry.indices.length / 3, 0);
  return { parts, triangleCount };
}
