import {
  Bone,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Matrix4,
  Mesh,
  MeshDepthMaterial,
  MeshDistanceMaterial,
  MeshStandardMaterial,
  RGBADepthPacking,
  Material,
  Quaternion,
  Skeleton,
  SkinnedMesh,
  Uint16BufferAttribute,
  Vector3
} from "three";
import { nativeVertexAlphaShadowShader } from "./3d-shaders.js";
import type { NativePreparedModel } from "./model3d-types.js";

/** Builds a render instance without parsing glTF or resolving URLs. */
export class NativeModelInstance {
  readonly root = new Group();
  private readonly nodes: Bone[];
  private readonly initial: {
    position: Vector3;
    quaternion: Quaternion;
    scale: Vector3;
  }[];
  private readonly meshes: Mesh[] = [];
  private readonly coloredMaterials = new Map<Material, Material>();
  private readonly shadowMaterials = new Map<Material, { depth: MeshDepthMaterial; distance: MeshDistanceMaterial }>();
  private readonly geometries: BufferGeometry[] = [];
  private readonly skeletons: Skeleton[] = [];
  private readonly a = new Quaternion();
  private readonly b = new Quaternion();
  private readonly animated = new Set<number>();
  constructor(
    private readonly model: NativePreparedModel,
    materials: readonly Material[]
  ) {
    this.nodes = model.nodes.map((node) => {
      const bone = new Bone();
      bone.matrix.fromArray(node.local);
      bone.matrix.decompose(bone.position, bone.quaternion, bone.scale);
      bone.matrixAutoUpdate = false;
      return bone;
    });
    this.initial = this.nodes.map((node) => ({
      position: node.position.clone(),
      quaternion: node.quaternion.clone(),
      scale: node.scale.clone()
    }));
    const children = new Set<number>();
    model.nodes.forEach((node, index) => {
      for (const child of node.children) {
        children.add(child);
        this.nodes[index].add(this.nodes[child]);
      }
    });
    this.nodes.forEach((node, index) => {
      if (!children.has(index)) {
        this.root.add(node);
      }
    });
    const skins = model.skins.map(
      (skin) =>
        new Skeleton(
          skin.joints.map((index) => this.nodes[index]),
          skin.inverseBind.map((matrix) => new Matrix4().fromArray(matrix))
        )
    );
    this.skeletons.push(...skins);
    const selected = new Set<number>(), pending = [...model.roots];
    while (pending.length > 0) {
      const index = pending.pop();
      if (index === undefined || selected.has(index)) { continue; }
      selected.add(index);
      pending.push(...model.nodes[index].children);
    }
    // Keep every transform node for joint and animation evaluation, but build
    // drawable meshes only from the selected scene's reachable nodes.
    model.nodes.forEach((node, index) => {
      if (node.mesh < 0 || !selected.has(index)) {
        return;
      }
      for (const primitive of model.meshes[node.mesh]) {
        const geometry = new BufferGeometry();
        geometry.setAttribute(
          "position",
          new Float32BufferAttribute(
            primitive.vertices.flatMap((vertex) => [...vertex.position]),
            3
          )
        );
        geometry.setAttribute(
          "normal",
          new Float32BufferAttribute(
            primitive.vertices.flatMap((vertex) => [...vertex.normal]),
            3
          )
        );
        geometry.setAttribute(
          "uv",
          new Float32BufferAttribute(
            primitive.vertices.flatMap((vertex) => [...vertex.uv]),
            2
          )
        );
        const colored = primitive.vertices.some((vertex) => vertex.color !== undefined);
        if (colored) {
          geometry.setAttribute("color", new Float32BufferAttribute(
            primitive.vertices.flatMap((vertex) => [...(vertex.color ?? [1, 1, 1, 1])]), 4
          ));
        }
        geometry.setIndex([...primitive.indices]);
        this.geometries.push(geometry);
        const sourceMaterial = materials[Math.max(0, primitive.material)];
        let material = sourceMaterial;
        if (colored) {
          let variant = this.coloredMaterials.get(sourceMaterial);
          if (!variant) {
            variant = sourceMaterial.clone();
            variant.vertexColors = true;
            variant.onBeforeCompile = sourceMaterial.onBeforeCompile;
            variant.customProgramCacheKey = sourceMaterial.customProgramCacheKey;
            this.coloredMaterials.set(sourceMaterial, variant);
          }
          material = variant;
        }
        const configureShadows = (mesh: Mesh): void => {
          if (!colored || !(material instanceof MeshStandardMaterial) || material.alphaTest <= 0) { return; }
          let shadow = this.shadowMaterials.get(material);
          if (!shadow) {
            shadow = { depth: new MeshDepthMaterial({ depthPacking: RGBADepthPacking }), distance: new MeshDistanceMaterial() };
            for (const entry of [shadow.depth, shadow.distance]) {
              entry.vertexColors = true;
              entry.map = material.map;
              entry.alphaTest = material.alphaTest;
              const opacity = material.opacity;
              entry.onBeforeCompile = (shader) => {
                shader.uniforms.nativeOpacity = { value: opacity };
                nativeVertexAlphaShadowShader(shader);
              };
              entry.customProgramCacheKey = () => "native-vertex-alpha-shadow-1";
            }
            this.shadowMaterials.set(material, shadow);
          }
          mesh.customDepthMaterial = shadow.depth;
          mesh.customDistanceMaterial = shadow.distance;
        };
        if (node.skin >= 0) {
          geometry.setAttribute(
            "skinIndex",
            new Uint16BufferAttribute(
              primitive.vertices.flatMap((vertex) => [...vertex.joints]),
              4
            )
          );
          geometry.setAttribute(
            "skinWeight",
            new Float32BufferAttribute(
              primitive.vertices.flatMap((vertex) => [...vertex.weights]),
              4
            )
          );
          const mesh = new SkinnedMesh(geometry, material);
          mesh.bind(skins[node.skin], new Matrix4());
          mesh.frustumCulled = false;
          configureShadows(mesh);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          this.meshes.push(mesh);
          this.root.add(mesh);
        } else {
          const mesh = new Mesh(geometry, material);
          configureShadows(mesh);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          this.meshes.push(mesh);
          this.nodes[index].add(mesh);
        }
      }
    });
  }
  setShadows(cast: boolean, receive: boolean): void {
    for (const mesh of this.meshes) {
      mesh.castShadow = cast;
      mesh.receiveShadow = receive;
    }
  }
  /** Samples at committed simulation time, including backward seeks. */
  sample(animation: number, seconds: number, loop = true): void {
    if (!Number.isFinite(seconds) || seconds < 0) {
      throw new Error("Invalid committed model animation time");
    }
    for (const index of this.animated) {
      const node = this.nodes[index],
        initial = this.initial[index];
      node.position.copy(initial.position);
      node.quaternion.copy(initial.quaternion);
      node.scale.copy(initial.scale);
      node.matrix.fromArray(this.model.nodes[index].local);
    }
    this.animated.clear();
    const clip = this.model.animations[animation];
    if (clip) {
      const time =
        loop && clip.duration > 0 ? seconds % clip.duration : seconds;
      for (const channel of clip.channels) {
        let low = 0,
          high = channel.times.length;
        while (low < high) {
          const middle = (low + high) >>> 1;
          if (channel.times[middle] <= time) {
            low = middle + 1;
          } else {
            high = middle;
          }
        }
        const left = Math.max(0, low - 1),
          right = Math.min(left + 1, channel.times.length - 1);
        const alpha =
          channel.interpolation === "STEP" || left === right
            ? 0
            : Math.max(
                0,
                Math.min(
                  1,
                  (time - channel.times[left]) /
                    (channel.times[right] - channel.times[left])
                )
              );
        const a = channel.values[left],
          b = channel.values[right],
          node = this.nodes[channel.node];
        if (channel.path === "rotation") {
          this.a.fromArray(a);
          this.b.fromArray(b);
          node.quaternion.copy(this.a).slerp(this.b, alpha).normalize();
        } else {
          const target =
            channel.path === "translation" ? node.position : node.scale;
          target.set(
            a[0] + alpha * (b[0] - a[0]),
            a[1] + alpha * (b[1] - a[1]),
            a[2] + alpha * (b[2] - a[2])
          );
        }
        this.animated.add(channel.node);
      }
    }
    for (const index of this.animated) {
      const node = this.nodes[index];
      node.matrix.compose(node.position, node.quaternion, node.scale);
    }
    this.root.updateMatrixWorld(true);
  }
  dispose(): void {
    for (const geometry of this.geometries) {
      geometry.dispose();
    }
    for (const skeleton of this.skeletons) {
      skeleton.dispose();
    }
    for (const material of this.coloredMaterials.values()) { material.dispose(); }
    for (const shadow of this.shadowMaterials.values()) { shadow.depth.dispose(); shadow.distance.dispose(); }
    this.coloredMaterials.clear();
    this.shadowMaterials.clear();
    this.root.clear();
  }
}
