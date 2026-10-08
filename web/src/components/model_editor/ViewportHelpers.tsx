/**
 * Editor-only objects drawn in the 3D viewport: camera framing, selection
 * bounds, light icons, the wireframe overlay, ground axes and the studio
 * environment. None of these are children of the editor root, so they are
 * never saved, and `captureView` hides them before rendering a screenshot.
 */
import { memo, useEffect, useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { Environment, Html, Lightformer } from "@react-three/drei";
import LightModeIcon from "@mui/icons-material/LightMode";
import LightbulbIcon from "@mui/icons-material/Lightbulb";
import FlashlightOnIcon from "@mui/icons-material/FlashlightOn";

import { BORDER_RADIUS, SPACING, Z_INDEX, getSpacingPx } from "../ui_primitives";

export type ViewPreset = "front" | "back" | "right" | "left" | "top" | "bottom";

export type CameraRequestInput =
  | { kind: "frameAll"; instant?: boolean }
  | { kind: "focus"; uuid: string }
  | { kind: "view"; view: ViewPreset };

/** A camera move; `nonce` makes a repeated request run again. */
export type CameraRequest = CameraRequestInput & { nonce: number };

interface OrbitControlsLike {
  target: THREE.Vector3;
  update: () => void;
}

const isOrbitControlsLike = (obj: unknown): obj is OrbitControlsLike =>
  obj !== null &&
  typeof obj === "object" &&
  "target" in obj &&
  typeof (obj as OrbitControlsLike).update === "function";

const VIEW_DIRECTIONS: Record<ViewPreset, THREE.Vector3> = {
  front: new THREE.Vector3(0, 0, 1),
  back: new THREE.Vector3(0, 0, -1),
  right: new THREE.Vector3(1, 0, 0),
  left: new THREE.Vector3(-1, 0, 0),
  // A pure vertical view puts OrbitControls at its pole, where it flips.
  top: new THREE.Vector3(0, 1, 0.0001).normalize(),
  bottom: new THREE.Vector3(0, -1, 0.0001).normalize()
};

const DEFAULT_DIRECTION = new THREE.Vector3(1, 0.7, 1).normalize();
const TRANSITION_MS = 280;

/** World-space bounding sphere of an object, with a fallback for lights and empties. */
export const objectBounds = (object: THREE.Object3D): THREE.Sphere => {
  object.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) {
    const center = object.getWorldPosition(new THREE.Vector3());
    return new THREE.Sphere(center, 1);
  }
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  sphere.radius = Math.max(sphere.radius, 0.05);
  return sphere;
};

const easeInOut = (t: number): number =>
  t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

interface Transition {
  fromPosition: THREE.Vector3;
  toPosition: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
  start: number;
}

interface CameraRigProps {
  root: THREE.Object3D;
  request: CameraRequest | null;
}

/**
 * Moves the camera for frame-all, focus-selection and view-preset requests,
 * easing between poses so the user keeps their orientation.
 */
export const CameraRig = memo(({ root, request }: CameraRigProps) => {
  const { camera, controls, invalidate } = useThree();
  const transition = useRef<Transition | null>(null);

  useEffect(() => {
    if (!request || !(camera instanceof THREE.PerspectiveCamera)) {
      return;
    }
    let sphere: THREE.Sphere;
    if (request.kind === "focus") {
      const object = root.getObjectByProperty("uuid", request.uuid);
      if (!object) {
        return;
      }
      sphere = objectBounds(object);
    } else {
      const box = new THREE.Box3().setFromObject(root);
      if (box.isEmpty()) {
        sphere = new THREE.Sphere(new THREE.Vector3(), 2);
      } else {
        sphere = box.getBoundingSphere(new THREE.Sphere());
      }
    }
    const target = isOrbitControlsLike(controls)
      ? controls.target.clone()
      : new THREE.Vector3();
    let direction: THREE.Vector3;
    if (request.kind === "view") {
      direction = VIEW_DIRECTIONS[request.view].clone();
    } else if (request.kind === "frameAll" && request.instant) {
      direction = DEFAULT_DIRECTION.clone();
    } else {
      direction = camera.position.clone().sub(target);
      if (direction.lengthSq() < 1e-8) {
        direction = DEFAULT_DIRECTION.clone();
      }
      direction.normalize();
    }
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
    const fov = Math.min(vFov, hFov);
    const distance = (sphere.radius / Math.sin(fov / 2)) * 1.4;
    const toPosition = sphere.center.clone().add(direction.multiplyScalar(distance));
    camera.near = Math.max(distance / 1000, 0.01);
    camera.far = Math.max(distance * 100, 1000);
    camera.updateProjectionMatrix();

    if (request.kind === "frameAll" && request.instant) {
      camera.position.copy(toPosition);
      camera.lookAt(sphere.center);
      if (isOrbitControlsLike(controls)) {
        controls.target.copy(sphere.center);
        controls.update();
      }
      transition.current = null;
      invalidate();
      return;
    }
    transition.current = {
      fromPosition: camera.position.clone(),
      toPosition,
      fromTarget: target,
      toTarget: sphere.center.clone(),
      start: performance.now()
    };
    invalidate();
  }, [request, root, camera, controls, invalidate]);

  useFrame(() => {
    const active = transition.current;
    if (!active) {
      return;
    }
    const t = Math.min(1, (performance.now() - active.start) / TRANSITION_MS);
    const k = easeInOut(t);
    camera.position.lerpVectors(active.fromPosition, active.toPosition, k);
    const target = new THREE.Vector3().lerpVectors(
      active.fromTarget,
      active.toTarget,
      k
    );
    if (isOrbitControlsLike(controls)) {
      controls.target.copy(target);
      controls.update();
    } else {
      camera.lookAt(target);
    }
    if (t >= 1) {
      transition.current = null;
    }
  });

  return null;
});
CameraRig.displayName = "CameraRig";

interface SelectionBoundsProps {
  object: THREE.Object3D | null;
  color: string;
}

/** Box around the selection, refreshed every frame so gizmo drags follow it. */
export const SelectionBounds = memo(({ object, color }: SelectionBoundsProps) => {
  const helper = useMemo(() => {
    const box = new THREE.Box3();
    const h = new THREE.Box3Helper(box, new THREE.Color(color));
    h.raycast = () => {};
    const material = h.material as THREE.LineBasicMaterial;
    material.depthTest = false;
    material.transparent = true;
    material.opacity = 0.9;
    h.renderOrder = 999;
    return h;
  }, [color]);

  useEffect(
    () => () => {
      helper.geometry.dispose();
      (helper.material as THREE.Material).dispose();
    },
    [helper]
  );

  useFrame(() => {
    if (!object) {
      helper.visible = false;
      return;
    }
    helper.box.setFromObject(object);
    helper.visible = !helper.box.isEmpty();
  });

  return <primitive object={helper} />;
});
SelectionBounds.displayName = "SelectionBounds";

/** Theme colors for the light icons, which render outside the MUI tree. */
export interface GizmoPalette {
  accent: string;
  surface: string;
  border: string;
}

const LIGHT_ICON_STYLE = {
  display: "grid",
  placeItems: "center",
  padding: getSpacingPx(SPACING.xs),
  borderRadius: BORDER_RADIUS.circle,
  cursor: "pointer",
  userSelect: "none",
  transform: "translate3d(-50%, -50%, 0)"
} as const;

interface LightIconProps {
  light: THREE.Light;
  selected: boolean;
  palette: GizmoPalette;
  onSelect: (uuid: string) => void;
}

const LightIcon = memo(({ light, selected, palette, onSelect }: LightIconProps) => {
  const group = useRef<THREE.Group>(null);
  const line = useMemo(() => {
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3(0, 0, -1)
    ]);
    const material = new THREE.LineDashedMaterial({
      color: light.color.clone(),
      dashSize: 0.15,
      gapSize: 0.1,
      transparent: true,
      opacity: 0.8
    });
    const l = new THREE.Line(geometry, material);
    l.raycast = () => {};
    l.computeLineDistances();
    return l;
  }, [light]);

  useEffect(
    () => () => {
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    },
    [line]
  );

  const aims =
    light instanceof THREE.DirectionalLight || light instanceof THREE.SpotLight;
  const worldPos = useMemo(() => new THREE.Vector3(), []);
  const targetPos = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    if (!group.current) {
      return;
    }
    light.getWorldPosition(worldPos);
    group.current.position.copy(worldPos);
    group.current.visible = light.visible && isInScene(light);
    if (aims) {
      const aimed = light as THREE.DirectionalLight | THREE.SpotLight;
      aimed.target.getWorldPosition(targetPos);
      const dir = targetPos.sub(worldPos);
      const length = light instanceof THREE.SpotLight && light.distance > 0
        ? light.distance
        : 1.5;
      dir.normalize().multiplyScalar(length);
      const positions = line.geometry.getAttribute("position") as THREE.BufferAttribute;
      positions.setXYZ(1, dir.x, dir.y, dir.z);
      positions.needsUpdate = true;
      line.computeLineDistances();
      (line.material as THREE.LineDashedMaterial).color.copy(light.color);
    }
  });

  const Icon =
    light instanceof THREE.DirectionalLight
      ? LightModeIcon
      : light instanceof THREE.SpotLight
        ? FlashlightOnIcon
        : LightbulbIcon;
  const color = `#${light.color.getHexString()}`;

  return (
    <group ref={group}>
      {aims && <primitive object={line} />}
      <Html zIndexRange={[Z_INDEX.raised, Z_INDEX.base]} style={{ pointerEvents: "none" }}>
        <div
          role="button"
          tabIndex={-1}
          aria-label={`Select ${light.name || light.type}`}
          title={light.name || light.type}
          onPointerDown={(e) => {
            e.stopPropagation();
            onSelect(light.uuid);
          }}
          style={{
            ...LIGHT_ICON_STYLE,
            pointerEvents: "auto",
            color,
            background: palette.surface,
            boxShadow: `0 0 0 ${selected ? 2 : 1}px ${selected ? palette.accent : palette.border}`
          }}
        >
          <Icon fontSize="small" />
        </div>
      </Html>
    </group>
  );
});
LightIcon.displayName = "LightIcon";

const isInScene = (object: THREE.Object3D): boolean => {
  let node: THREE.Object3D | null = object;
  while (node.parent) {
    node = node.parent;
  }
  return node instanceof THREE.Scene;
};

interface LightGizmosProps {
  root: THREE.Object3D;
  tick: number;
  selectedUuid: string | null;
  palette: GizmoPalette;
  onSelect: (uuid: string) => void;
}

/** Clickable icons for every light, with a dashed line along its direction. */
export const LightGizmos = memo(
  ({ root, tick, selectedUuid, palette, onSelect }: LightGizmosProps) => {
    const lights = useMemo(() => {
      void tick;
      const found: THREE.Light[] = [];
      root.traverse((node) => {
        if (node instanceof THREE.Light) {
          found.push(node);
        }
      });
      return found;
    }, [root, tick]);

    return (
      <>
        {lights.map((light) => (
          <LightIcon
            key={light.uuid}
            light={light}
            selected={light.uuid === selectedUuid}
            palette={palette}
            onSelect={onSelect}
          />
        ))}
      </>
    );
  }
);
LightGizmos.displayName = "LightGizmos";

interface WireframeOverlayProps {
  root: THREE.Object3D;
  tick: number;
  color: string;
}

/** Draws every mesh's triangle edges on top of the shaded view. */
export const WireframeOverlay = memo(({ root, tick, color }: WireframeOverlayProps) => {
  const group = useMemo(() => new THREE.Group(), []);
  const pairs = useRef<{ mesh: THREE.Mesh; lines: THREE.LineSegments }[]>([]);
  const material = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color: new THREE.Color(color),
        transparent: true,
        opacity: 0.35,
        depthWrite: false
      }),
    [color]
  );

  useEffect(() => {
    void tick;
    const next: { mesh: THREE.Mesh; lines: THREE.LineSegments }[] = [];
    root.traverse((node) => {
      if (node instanceof THREE.Mesh) {
        const lines = new THREE.LineSegments(
          new THREE.WireframeGeometry(node.geometry),
          material
        );
        lines.matrixAutoUpdate = false;
        lines.raycast = () => {};
        next.push({ mesh: node, lines });
        group.add(lines);
      }
    });
    pairs.current = next;
    return () => {
      for (const { lines } of next) {
        group.remove(lines);
        lines.geometry.dispose();
      }
    };
  }, [root, tick, group, material]);

  useEffect(() => () => material.dispose(), [material]);

  useFrame(() => {
    for (const { mesh, lines } of pairs.current) {
      lines.matrix.copy(mesh.matrixWorld);
      lines.matrixWorld.copy(mesh.matrixWorld);
      lines.visible = isVisibleInTree(mesh);
    }
  });

  return <primitive object={group} />;
});
WireframeOverlay.displayName = "WireframeOverlay";

const isVisibleInTree = (object: THREE.Object3D): boolean => {
  let node: THREE.Object3D | null = object;
  while (node) {
    if (!node.visible) {
      return false;
    }
    node = node.parent;
  }
  return true;
};

interface GroundAxesProps {
  xColor: string;
  zColor: string;
}

/** Red X and blue Z lines through the origin, as in most DCC tools. */
export const GroundAxes = memo(({ xColor, zColor }: GroundAxesProps) => {
  const lines = useMemo(() => {
    // As far as the grid fades out. The line is split into short segments:
    // a single long segment that crosses behind the camera is dropped
    // entirely by some GL implementations.
    const extent = 50;
    const segments = 100;
    const make = (to: THREE.Vector3, color: string) => {
      const points: THREE.Vector3[] = [];
      for (let i = 0; i <= segments; i += 1) {
        points.push(to.clone().multiplyScalar((i / segments) * 2 - 1));
      }
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(
        geometry,
        new THREE.LineBasicMaterial({
          color: new THREE.Color(color),
          transparent: true,
          opacity: 0.65
        })
      );
      line.raycast = () => {};
      // Drawn after the transparent grid so the grid does not cover it.
      line.renderOrder = 1;
      return line;
    };
    return [
      make(new THREE.Vector3(extent, 0, 0), xColor),
      make(new THREE.Vector3(0, 0, extent), zColor)
    ];
  }, [xColor, zColor]);

  useEffect(
    () => () => {
      for (const line of lines) {
        line.geometry.dispose();
        (line.material as THREE.Material).dispose();
      }
    },
    [lines]
  );

  return (
    <>
      {lines.map((line) => (
        <primitive key={line.uuid} object={line} />
      ))}
    </>
  );
});
GroundAxes.displayName = "GroundAxes";

/**
 * Image-based lighting built from a few area lights rendered once into an
 * environment map. Unlike a drei preset it needs no network, so the editor
 * lights models the same way offline and in the desktop app.
 */
export const StudioEnvironment = memo(() => (
  <Environment resolution={256} frames={1}>
    <Lightformer intensity={2} position={[0, 5, -9]} scale={[10, 10, 1]} />
    <Lightformer intensity={1.5} position={[-5, 1, -1]} rotation-y={Math.PI / 2} scale={[20, 2, 1]} />
    <Lightformer intensity={1.5} position={[5, 1, -1]} rotation-y={-Math.PI / 2} scale={[20, 2, 1]} />
    <Lightformer intensity={0.8} position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[10, 10, 1]} />
    <Lightformer form="ring" intensity={0.6} position={[0, 2, 8]} scale={4} />
  </Environment>
));
StudioEnvironment.displayName = "StudioEnvironment";

export interface CaptureHandles {
  gl: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.Camera;
}

interface CaptureBridgeProps {
  targetRef: MutableRefObject<CaptureHandles | null>;
}

/**
 * Publishes the live renderer, scene and camera from inside the Canvas to a
 * ref the editor owns, so `captureView` can render a screenshot on demand.
 */
export const CaptureBridge = ({ targetRef }: CaptureBridgeProps) => {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    targetRef.current = { gl, scene, camera };
    return () => {
      targetRef.current = null;
    };
  }, [gl, scene, camera, targetRef]);
  return null;
};

/**
 * Render the editor root alone: the grid, gizmos and helpers are hidden for
 * the frame, and a solid background replaces the transparent canvas.
 */
export const captureModelOnly = (
  handles: CaptureHandles,
  root: THREE.Object3D,
  background: THREE.Color
): string => {
  const { gl, scene, camera } = handles;
  const hidden: THREE.Object3D[] = [];
  for (const child of scene.children) {
    if (child !== root && !(child instanceof THREE.Light) && child.visible) {
      child.visible = false;
      hidden.push(child);
    }
  }
  const previousBackground = scene.background;
  scene.background = background;
  try {
    gl.render(scene, camera);
    return gl.domElement.toDataURL("image/png");
  } finally {
    scene.background = previousBackground;
    for (const child of hidden) {
      child.visible = true;
    }
  }
};
