import * as THREE from "three";

export type PrimitiveKind =
  | "box"
  | "sphere"
  | "plane"
  | "cylinder"
  | "torus"
  | "directionalLight"
  | "pointLight";

export const PRIMITIVE_LABELS: Record<PrimitiveKind, string> = {
  box: "Box",
  sphere: "Sphere",
  plane: "Plane",
  cylinder: "Cylinder",
  torus: "Torus",
  directionalLight: "Directional Light",
  pointLight: "Point Light"
};

// MeshPhysicalMaterial (extends MeshStandardMaterial) so the Properties panel
// can expose the full PBR set — clearcoat, transmission, sheen, iridescence, …
const standardMaterial = () =>
  new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0xcccccc),
    metalness: 0.1,
    roughness: 0.8
  });

/**
 * Build a fresh Three.js object for the given primitive kind. The caller is
 * responsible for adding it to the scene and giving it a unique name.
 */
export const createPrimitive = (kind: PrimitiveKind): THREE.Object3D => {
  switch (kind) {
    case "box":
      return new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), standardMaterial());
    case "sphere":
      return new THREE.Mesh(
        new THREE.SphereGeometry(0.5, 32, 16),
        standardMaterial()
      );
    case "plane": {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(2, 2),
        new THREE.MeshPhysicalMaterial({
          color: new THREE.Color(0xcccccc),
          metalness: 0.1,
          roughness: 0.8,
          side: THREE.DoubleSide
        })
      );
      mesh.rotation.x = -Math.PI / 2;
      return mesh;
    }
    case "cylinder":
      return new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.5, 1, 32),
        standardMaterial()
      );
    case "torus":
      return new THREE.Mesh(
        new THREE.TorusGeometry(0.5, 0.2, 16, 64),
        standardMaterial()
      );
    case "directionalLight": {
      const light = new THREE.DirectionalLight(0xffffff, 1);
      light.position.set(2, 3, 2);
      return light;
    }
    case "pointLight": {
      const light = new THREE.PointLight(0xffffff, 1, 0, 2);
      light.position.set(0, 2, 0);
      return light;
    }
    default:
      return new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), standardMaterial());
  }
};
