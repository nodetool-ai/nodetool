import * as THREE from "three";
import {
  createPrimitive,
  PRIMITIVE_LABELS,
  type PrimitiveKind
} from "../objectFactory";

describe("createPrimitive", () => {
  it("creates a box mesh with standard material", () => {
    const obj = createPrimitive("box");
    expect(obj).toBeInstanceOf(THREE.Mesh);
    const mesh = obj as THREE.Mesh;
    expect(mesh.geometry).toBeInstanceOf(THREE.BoxGeometry);
    expect(mesh.material).toBeInstanceOf(THREE.MeshStandardMaterial);
  });

  it("builds a cone the cone geometry fields can edit", () => {
    const cone = createPrimitive("cone") as THREE.Mesh;
    expect(cone.geometry).toBeInstanceOf(THREE.ConeGeometry);
    expect(cone.geometry.type).toBe("ConeGeometry");
  });

  it("orients the plane to lie flat", () => {
    const plane = createPrimitive("plane");
    expect(plane.rotation.x).toBeCloseTo(-Math.PI / 2);
  });

  it("creates lights for light kinds", () => {
    expect(createPrimitive("directionalLight")).toBeInstanceOf(
      THREE.DirectionalLight
    );
    expect(createPrimitive("pointLight")).toBeInstanceOf(THREE.PointLight);
  });

  it("aims a directional light with a child target the glTF export keeps", () => {
    const light = createPrimitive("directionalLight") as THREE.DirectionalLight;
    expect(light.target.parent).toBe(light);
    expect(light.target.position.toArray()).toEqual([0, 0, -1]);

    light.updateMatrixWorld(true);
    const direction = light.target
      .getWorldPosition(new THREE.Vector3())
      .sub(light.getWorldPosition(new THREE.Vector3()))
      .normalize();
    const towardOrigin = light.position.clone().negate().normalize();
    expect(direction.distanceTo(towardOrigin)).toBeLessThan(1e-6);
  });

  it("creates a figure as one group of jointed meshes", () => {
    const figure = createPrimitive("figure", { figure: { body: "child", pose: "sit" } });
    expect(figure).toBeInstanceOf(THREE.Group);
    expect(figure.userData.nodetool_figure).toEqual({ body: "child", pose: "sit", height: 1.2 });
    expect(figure.children).toHaveLength(1);
    expect(figure.children[0].userData.nodetool_figure_part).toBe("pelvis");
  });

  it("creates a perspective camera that looks down -Z from eye height", () => {
    const camera = createPrimitive("camera") as THREE.PerspectiveCamera;
    expect(camera).toBeInstanceOf(THREE.PerspectiveCamera);
    expect(camera.fov).toBe(40);
    expect(camera.aspect).toBeCloseTo(16 / 9);
    expect(camera.position.toArray()).toEqual([0, 1.6, 5]);
    expect(camera.getWorldDirection(new THREE.Vector3()).z).toBeCloseTo(-1);
  });

  it("has a human label for every primitive kind", () => {
    const kinds: PrimitiveKind[] = [
      "box",
      "sphere",
      "plane",
      "cylinder",
      "torus",
      "directionalLight",
      "pointLight",
      "figure",
      "camera"
    ];
    for (const kind of kinds) {
      expect(PRIMITIVE_LABELS[kind]).toBeTruthy();
    }
  });
});
