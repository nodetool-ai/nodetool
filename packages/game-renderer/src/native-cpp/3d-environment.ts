import {
  AmbientLight,
  BackSide,
  Color,
  CubeCamera,
  DirectionalLight,
  HalfFloatType,
  Light,
  Mesh,
  MeshBasicMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PMREMGenerator,
  PointLight,
  Quaternion,
  Scene,
  SphereGeometry,
  Vector3,
  WebGLCubeRenderTarget,
  WebGLRenderTarget,
  WebGLRenderer
} from "three";
import { Sky } from "three/addons/objects/Sky.js";
import type {
  NativeFrame3D,
  NativeGame3dDocument
} from "@nodetool-ai/protocol/native-game";
import { configureGameEnvironment } from "../renderer3d/environment/index.js";
import { GameHeightFog3D } from "../renderer3d/environment/height-fog.js";
import { GameCascadedShadows3D } from "../renderer3d/shadows/cascades.js";
import {
  configureDirectionalShadow,
  configureLocalShadow
} from "../renderer3d/shadows/index.js";

type Environment = NonNullable<NativeFrame3D["environment"]>;
type LightDefinition = NonNullable<
  NativeFrame3D["entities"][number]["light3d"]
>;
interface SkyTargets {
  readonly cube: WebGLCubeRenderTarget;
  readonly environment: WebGLRenderTarget;
  readonly camera: CubeCamera;
  readonly direction: Vector3;
}
/** Owns native scene environment resources without creating a legacy frame or session. */
export class NativeEnvironment3D {
  readonly environments = new Map<string, Environment>();
  readonly ambient = new AmbientLight();
  private readonly backgrounds = new Map<string, Color>();
  private readonly skies = new Map<string, SkyTargets>();
  private readonly lights = new Map<string, DirectionalLight | PointLight>();
  private readonly cascades = new GameCascadedShadows3D();
  private readonly fog = new GameHeightFog3D();
  private readonly skyDirection = new Vector3();
  private readonly rotation = new Quaternion();
  private generator: PMREMGenerator;
  private procedural:
    | {
        scene: Scene;
        sky: Sky;
        ground: Mesh<SphereGeometry, MeshBasicMaterial>;
      }
    | undefined;
  skyBuilds = 0;
  private document: NativeGame3dDocument | undefined;
  constructor(private readonly renderer: WebGLRenderer) {
    this.generator = new PMREMGenerator(renderer);
  }
  async prepare(document: NativeGame3dDocument | undefined): Promise<void> {
    this.document = document;
    if (!document) {
      return;
    }
    let skyBytes = 0;
    try {
      for (const definition of document.scenes) {
        const environment = definition.environment;
        if (!environment) {
          continue;
        }
        this.environments.set(definition.id, environment);
        this.backgrounds.set(definition.id, new Color(environment.background));
        if (environment.sky?.kind !== "procedural") {
          continue;
        }
        skyBytes += 256 * 256 * 6 * 8 + 768 * 1024 * 8;
        if (skyBytes > 128 * 1024 * 1024) {
          throw new Error("Native prepared sky target budget exceeded");
        }
        const linked = definition.entities.find(
          (entity) =>
            entity.light3d?.kind === "directional" &&
            (environment.sky?.kind !== "procedural" ||
              environment.sky.sunEntityId === undefined ||
              entity.id === environment.sky.sunEntityId)
        );
        const direction = this.skyDirection.set(0, 0.5, -1);
        if (linked) {
          direction
            .set(0, 0, 1)
            .applyQuaternion(
              this.rotation.fromArray(linked.transform.rotation)
            );
        }
        direction.normalize();
        this.renderSky(definition.id, environment.sky, direction);
      }
    } catch (error) {
      this.dispose();
      throw error;
    }
  }
  private renderSky(
    id: string,
    settings: Extract<NonNullable<Environment["sky"]>, { kind: "procedural" }>,
    direction: Vector3
  ): void {
    if (!this.procedural) {
      const sky = new Sky(),
        ground = new Mesh(
          new SphereGeometry(
            4,
            32,
            8,
            0,
            Math.PI * 2,
            Math.PI / 2,
            Math.PI / 2
          ),
          new MeshBasicMaterial({ side: BackSide })
        ),
        scene = new Scene();
      scene.add(sky, ground);
      this.procedural = { scene, sky, ground };
    }
    const { scene, sky, ground } = this.procedural;
    sky.material.uniforms.turbidity.value = settings.turbidity;
    sky.material.uniforms.rayleigh.value = settings.rayleigh;
    sky.material.uniforms.sunPosition.value.copy(direction);
    sky.material.uniforms.cloudCoverage.value = 0;
    sky.material.uniforms.showSunDisc.value = 0;
    ground.material.color.set(settings.groundColor);
    const existing = this.skies.get(id),
      cube =
        existing?.cube ??
        new WebGLCubeRenderTarget(256, {
          type: HalfFloatType,
          generateMipmaps: false
        }),
      camera = existing?.camera ?? new CubeCamera(0.1, 100, cube);
    const autoClear = this.renderer.autoClear;
    this.renderer.autoClear = true;
    try {
      camera.update(this.renderer, scene);
      const filtered = this.generator.fromCubemap(
        cube.texture,
        existing?.environment ?? null
      );
      this.skies.set(id, {
        cube,
        camera,
        environment: filtered,
        direction: (existing?.direction ?? new Vector3()).copy(direction)
      });
      this.skyBuilds++;
    } catch (error) {
      if (!existing) {
        cube.dispose();
      }
      throw error;
    } finally {
      this.renderer.autoClear = autoClear;
    }
  }
  configure(
    scene: Scene,
    camera: PerspectiveCamera,
    frame: NativeFrame3D
  ): void {
    const environment = frame.environment;
    if (!environment) {
      this.detach();
      this.ambient.visible = false;
      scene.environment = null;
      scene.background = new Color(18 / 255, 22 / 255, 30 / 255);
      scene.fog = null;
      return;
    }
    if (!this.environments.has(frame.sceneId)) {
      throw new Error(
        "Native scene environment was not prepared before rendering"
      );
    }
    this.ambient.visible = true;
    if (this.ambient.parent !== scene) {
      scene.add(this.ambient);
    }
    const background = this.backgrounds.get(frame.sceneId);
    if (background) {
      scene.background = background;
    }
    configureGameEnvironment(scene, this.ambient, this.renderer, environment);
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    if (environment.sky?.kind === "procedural") {
      const direction = this.skyDirection.set(0, 0.5, -1);
      for (const entity of frame.entities) {
        if (
          entity.light3d?.kind === "directional" &&
          (environment.sky.sunEntityId === undefined ||
            entity.id === environment.sky.sunEntityId)
        ) {
          direction
            .set(0, 0, 1)
            .applyQuaternion(
              this.rotation.fromArray(entity.transform.rotation)
            );
          break;
        }
      }
      direction.normalize();
      const previous = this.skies.get(frame.sceneId);
      if (previous && !previous.direction.equals(direction)) {
        this.renderSky(frame.sceneId, environment.sky, direction);
      }
      const targets = this.skies.get(frame.sceneId);
      if (!targets) {
        throw new Error("Native procedural sky targets are unavailable");
      }
      scene.background = targets.cube.texture;
      scene.environment = targets.environment.texture;
      scene.backgroundIntensity = environment.sky.intensity;
      scene.environmentIntensity = environment.sky.intensity;
      scene.backgroundRotation.set(0, 0, 0);
      scene.environmentRotation.set(0, 0, 0);
    } else {
      scene.environment = null;
      scene.backgroundIntensity = 1;
      scene.environmentIntensity = 1;
    }
    const present = new Set<string>();
    let localShadows = 0;
    let cascaded:
      | {
          light: DirectionalLight;
          definition: Extract<LightDefinition, { kind: "directional" }>;
        }
      | undefined;
    for (const entity of frame.entities) {
      const definition = entity.light3d;
      if (!definition) {
        continue;
      }
      present.add(entity.id);
      let light = this.lights.get(entity.id);
      if (
        !light ||
        (definition.kind === "directional") !==
          light instanceof DirectionalLight
      ) {
        if (light) {
          this.releaseLight(light);
        }
        light =
          definition.kind === "directional"
            ? new DirectionalLight()
            : new PointLight();
        this.lights.set(entity.id, light);
        scene.add(light);
        if (light instanceof DirectionalLight) {
          scene.add(light.target);
        }
      }
      light.visible = true;
      light.position.fromArray(entity.transform.position);
      light.quaternion.fromArray(entity.transform.rotation);
      light.color.set(definition.color);
      light.intensity = definition.intensity;
      if (
        light instanceof DirectionalLight &&
        definition.kind === "directional"
      ) {
        light.target.position
          .set(0, 0, -1)
          .applyQuaternion(light.quaternion)
          .add(light.position);
        light.target.updateMatrixWorld(true);
        const useCascade = Boolean(
          environment.shadows.enabled &&
          environment.shadows.cascades &&
          definition.castShadow &&
          !cascaded
        );
        configureDirectionalShadow(
          light,
          definition,
          environment,
          environment.shadows.enabled &&
            definition.castShadow &&
            !useCascade &&
            !environment.shadows.cascades
        );
        if (useCascade) {
          cascaded = { light, definition };
        }
      } else if (light instanceof PointLight && definition.kind === "point") {
        light.distance = definition.range;
        light.decay = definition.decay;
        const casting =
          environment.shadows.enabled &&
          definition.castShadow === true &&
          localShadows < 4;
        if (casting) {
          localShadows++;
        }
        configureLocalShadow(light, definition, environment, casting);
      }
    }
    for (const [id, light] of this.lights) {
      if (!present.has(id)) {
        this.releaseLight(light);
        this.lights.delete(id);
      }
    }
    camera.updateMatrixWorld();
    if (cascaded && environment.shadows.cascades) {
      cascaded.light.visible = false;
      this.cascades.update(
        scene,
        cascaded.light,
        cascaded.definition,
        environment.shadows.cascades,
        environment.shadows.mapSize,
        camera
      );
    } else {
      this.cascades.detach();
    }
  }
  bindMaterials(
    scene: Scene,
    camera: PerspectiveCamera,
    frame: NativeFrame3D
  ): void {
    if (!frame.environment) {
      return;
    }
    this.cascades.bindMaterials(scene);
    this.fog.configure(scene, camera, frame.environment.fog);
  }
  async contextRestored(): Promise<void> {
    this.detach();
    for (const targets of this.skies.values()) {
      targets.cube.dispose();
      targets.environment.dispose();
    }
    this.skies.clear();
    this.generator.dispose();
    this.generator = new PMREMGenerator(this.renderer);
    await this.prepare(this.document);
  }
  detach(): void {
    this.cascades.detach();
    this.fog.dispose();
    for (const light of this.lights.values()) {
      this.releaseLight(light);
    }
    this.lights.clear();
  }
  dispose(): void {
    this.detach();
    this.ambient.removeFromParent();
    this.ambient.dispose();
    for (const targets of this.skies.values()) {
      targets.cube.dispose();
      targets.environment.dispose();
    }
    this.skies.clear();
    this.environments.clear();
    this.backgrounds.clear();
    this.document = undefined;
    this.generator.dispose();
    if (this.procedural) {
      this.procedural.sky.geometry.dispose();
      this.procedural.sky.material.dispose();
      this.procedural.ground.geometry.dispose();
      this.procedural.ground.material.dispose();
      this.procedural = undefined;
    }
  }
  private releaseLight(light: Light): void {
    if (light instanceof DirectionalLight) {
      light.target.removeFromParent();
      light.shadow.dispose();
    } else if (light instanceof PointLight) {
      light.shadow.dispose();
    }
    light.removeFromParent();
    light.dispose();
  }
}
