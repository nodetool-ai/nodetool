import { BoxGeometry, CameraHelper, CapsuleGeometry, Group, Mesh, MeshBasicMaterial, OrthographicCamera, PerspectiveCamera, SphereGeometry } from "three";
import type { GameDocument3D, GameRenderFrame3D } from "@nodetool-ai/protocol";

/** Editor diagnostics are separate objects and never enter game state. */
export function createGameViewportOverlays3D(document: GameDocument3D, frame: GameRenderFrame3D): Group {
  const group = new Group();
  const scene = document.scenes.find((value) => value.id === frame.sceneId);
  const poses = new Map(frame.entities.map((entity) => [entity.entityId, entity.transform]));
  for (const entity of scene?.entities ?? []) {
    const pose = poses.get(entity.id);
    if (!pose) { continue; }
    const root = new Group();
    root.position.set(pose.position.x, pose.position.y, pose.position.z);
    root.quaternion.fromArray(pose.rotation);
    root.scale.set(pose.scale.x, pose.scale.y, pose.scale.z);
    const collider = entity.collider3d;
    if (collider && ["box", "sphere", "capsule"].includes(collider.kind)) {
      const geometry = collider.kind === "box" ? new BoxGeometry(collider.halfExtents.x * 2, collider.halfExtents.y * 2, collider.halfExtents.z * 2) :
        collider.kind === "sphere" ? new SphereGeometry(collider.radius, 12, 8) : collider.kind === "capsule" ? new CapsuleGeometry(collider.radius, collider.halfHeight * 2, 4, 8) : null;
      if (geometry) {
        const mesh = new Mesh(geometry, new MeshBasicMaterial({ color: collider.sensor ? "#ffcc66" : "#66ddff", wireframe: true, depthTest: false }));
        mesh.position.set(collider.offset.x, collider.offset.y, collider.offset.z);
        mesh.quaternion.fromArray(collider.rotation);
        root.add(mesh);
      }
    }
    if (entity.camera3d) {
      const projection = entity.camera3d.projection;
      const camera = projection.kind === "perspective" ? new PerspectiveCamera(projection.fov, document.presentation.aspectRatio, projection.near, projection.far) :
        new OrthographicCamera(-projection.size * document.presentation.aspectRatio / 2, projection.size * document.presentation.aspectRatio / 2, projection.size / 2, -projection.size / 2, projection.near, projection.far);
      root.add(camera);
      root.updateMatrixWorld(true);
      const helper = new CameraHelper(camera);
      group.add(helper);
    }
    if (entity.light3d) {
      root.add(new Mesh(new SphereGeometry(0.15, 8, 6), new MeshBasicMaterial({ color: entity.light3d.color, wireframe: true, depthTest: false })));
    }
    group.add(root);
  }
  return group;
}

export function disposeGameViewportOverlays3D(group: Group): void {
  group.removeFromParent();
  group.traverse((object) => {
    if (object instanceof Mesh) {
      object.geometry.dispose();
      (Array.isArray(object.material) ? object.material : [object.material]).forEach((material) => material.dispose());
    } else if (object instanceof CameraHelper) { object.dispose(); }
  });
}
