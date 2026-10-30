import {
  AgXToneMapping,
  Camera,
  HalfFloatType,
  LinearFilter,
  NearestFilter,
  NoColorSpace,
  Scene,
  ShaderMaterial,
  Texture,
  UniformsUtils,
  Vector2,
  WebGLRenderTarget,
  WebGLRenderer
} from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { Pass, FullScreenQuad } from "three/addons/postprocessing/Pass.js";
import {
  SMAAEdgesShader,
  SMAAWeightsShader,
  SMAABlendShader
} from "three/addons/shaders/SMAAShader.js";
import type { NativeFrame3D } from "@nodetool-ai/protocol/native-game";
import { NATIVE_POST_BUILTINS, type NativeBuiltinName } from "./3d-builtins.js";

type Environment = NonNullable<NativeFrame3D["environment"]>;
export interface NativePost3D {
  render(scene: Scene, camera: Camera, sceneId: string): void;
  resize(width: number, height: number): void;
  dispose(): void;
}
export function nativePostTargetBytes(width: number, height: number): number {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 8192 ||
    height > 8192 ||
    width * height * 48 > 512 * 1024 * 1024
  ) {
    throw new Error("Native post-processing target budget exceeded");
  }
  return width * height * 48;
}
async function lookupTexture(
  name: NativeBuiltinName,
  resolve: (name: NativeBuiltinName) => Promise<Uint8Array>
): Promise<Texture> {
  const entry = NATIVE_POST_BUILTINS[name];
  const bytes = Uint8Array.from(await resolve(name));
  const digest = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (value) => value.toString(16).padStart(2, "0")
  ).join("");
  if (digest !== entry.pngDigest) {
    throw new Error("Native SMAA lookup byte integrity mismatch");
  }
  const image = await createImageBitmap(
    new Blob([bytes], { type: "image/png" }),
    { premultiplyAlpha: "none", colorSpaceConversion: "none" }
  );
  try {
    if (image.width !== entry.width || image.height !== entry.height) {
      throw new Error("Native SMAA lookup dimensions changed");
    }
    const canvas = new OffscreenCanvas(image.width, image.height),
      context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Native SMAA lookup audit requires a 2D context");
    }
    context.drawImage(image, 0, 0);
    const pixels = Uint8Array.from(
      context.getImageData(0, 0, image.width, image.height).data
    );
    const rgbaDigest = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", pixels)),
      (value) => value.toString(16).padStart(2, "0")
    ).join("");
    if (rgbaDigest !== entry.rgbaDigest) {
      throw new Error("Native SMAA decoded lookup integrity mismatch");
    }
    const texture = new Texture(image);
    texture.name = name;
    texture.flipY = false;
    texture.colorSpace = NoColorSpace;
    texture.generateMipmaps = false;
    texture.minFilter = texture.magFilter =
      name === "native-smaa-search.png" ? NearestFilter : LinearFilter;
    texture.needsUpdate = true;
    return texture;
  } catch (error) {
    image.close();
    throw error;
  }
}

/** Same Three SMAA stages, with verified builtin textures and no DOM image/data URLs. */
class NativeSmaaPass extends Pass {
  private readonly edges = new WebGLRenderTarget(1, 1, {
    depthBuffer: false,
    type: HalfFloatType
  });
  private readonly weights = new WebGLRenderTarget(1, 1, {
    depthBuffer: false,
    type: HalfFloatType
  });
  private readonly edgeMaterial = new ShaderMaterial({
    defines: { ...SMAAEdgesShader.defines },
    uniforms: UniformsUtils.clone(SMAAEdgesShader.uniforms),
    vertexShader: SMAAEdgesShader.vertexShader,
    fragmentShader: SMAAEdgesShader.fragmentShader,
    depthTest: false,
    depthWrite: false
  });
  private readonly weightMaterial = new ShaderMaterial({
    defines: { ...SMAAWeightsShader.defines },
    uniforms: UniformsUtils.clone(SMAAWeightsShader.uniforms),
    vertexShader: SMAAWeightsShader.vertexShader,
    fragmentShader: SMAAWeightsShader.fragmentShader,
    depthTest: false,
    depthWrite: false
  });
  private readonly blendMaterial = new ShaderMaterial({
    uniforms: UniformsUtils.clone(SMAABlendShader.uniforms),
    vertexShader: SMAABlendShader.vertexShader,
    fragmentShader: SMAABlendShader.fragmentShader,
    depthTest: false,
    depthWrite: false
  });
  private readonly quad = new FullScreenQuad();
  constructor(
    private readonly area: Texture,
    private readonly search: Texture
  ) {
    super();
    this.weightMaterial.uniforms.tArea.value = area;
    this.weightMaterial.uniforms.tSearch.value = search;
  }
  override setSize(width: number, height: number): void {
    this.edges.setSize(width, height);
    this.weights.setSize(width, height);
    for (const material of [
      this.edgeMaterial,
      this.weightMaterial,
      this.blendMaterial
    ]) {
      material.uniforms.resolution.value.set(1 / width, 1 / height);
    }
  }
  override render(
    renderer: WebGLRenderer,
    write: WebGLRenderTarget,
    read: WebGLRenderTarget
  ): void {
    this.edgeMaterial.uniforms.tDiffuse.value = read.texture;
    this.quad.material = this.edgeMaterial;
    renderer.setRenderTarget(this.edges);
    renderer.clear();
    this.quad.render(renderer);
    this.weightMaterial.uniforms.tDiffuse.value = this.edges.texture;
    this.quad.material = this.weightMaterial;
    renderer.setRenderTarget(this.weights);
    renderer.clear();
    this.quad.render(renderer);
    this.blendMaterial.uniforms.tDiffuse.value = this.weights.texture;
    this.blendMaterial.uniforms.tColor.value = read.texture;
    this.quad.material = this.blendMaterial;
    renderer.setRenderTarget(this.renderToScreen ? null : write);
    if (this.clear) {
      renderer.clear();
    }
    this.quad.render(renderer);
  }
  override dispose(): void {
    this.edges.dispose();
    this.weights.dispose();
    this.edgeMaterial.dispose();
    this.weightMaterial.dispose();
    this.blendMaterial.dispose();
    this.quad.dispose();
    for (const texture of [this.area, this.search]) {
      texture.dispose();
      if (texture.image instanceof ImageBitmap) {
        texture.image.close();
      }
    }
  }
}
const vignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    intensity: { value: 0.4 },
    radius: { value: 0.5 },
    softness: { value: 0.5 }
  },
  vertexShader:
    "varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
  fragmentShader:
    "uniform sampler2D tDiffuse;uniform float intensity;uniform float radius;uniform float softness;varying vec2 vUv;void main(){vec4 t=texture2D(tDiffuse,vUv);float d=length(vUv-vec2(.5))*1.41421356;float shade=smoothstep(radius,radius+softness,d);gl_FragColor=vec4(t.rgb*(1.-intensity*shade),t.a);}"
};
export async function createNativePost3D(
  renderer: WebGLRenderer,
  environments: ReadonlyMap<string, Environment>,
  resolveBuiltin: (name: NativeBuiltinName) => Promise<Uint8Array>
): Promise<NativePost3D> {
  const previousTone = renderer.toneMapping,
    previousExposure = renderer.toneMappingExposure;
  if (environments.size === 0) {
    return {
      render: (scene, camera) => renderer.render(scene, camera),
      resize() {},
      dispose() {}
    };
  }
  for (const environment of environments.values()) {
    if (
      !environment.postProcessing.enabled ||
      environment.postProcessing.toneMapping !== "agx" ||
      environment.postProcessing.antialias !== "smaa"
    ) {
      throw new Error(
        "Native environment requires explicit AgX and SMAA post-processing"
      );
    }
  }
  const size = renderer.getDrawingBufferSize(new Vector2());
  nativePostTargetBytes(size.x, size.y);
  const area = await lookupTexture("native-smaa-area.png", resolveBuiltin);
  let search: Texture;
  try {
    search = await lookupTexture("native-smaa-search.png", resolveBuiltin);
  } catch (error) {
    area.dispose();
    if (area.image instanceof ImageBitmap) {
      area.image.close();
    }
    throw error;
  }
  const composer = new EffectComposer(
    renderer,
    new WebGLRenderTarget(size.x, size.y, { type: HalfFloatType })
  );
  const scenePass = new RenderPass(new Scene(), new Camera()),
    bloom = new UnrealBloomPass(size, 1, 0.4, 0.85),
    output = new OutputPass(),
    vignette = new ShaderPass(vignetteShader),
    smaa = new NativeSmaaPass(area, search);
  for (const pass of [scenePass, bloom, output, vignette, smaa]) {
    composer.addPass(pass);
  }
  composer.setPixelRatio(1);
  composer.setSize(size.x, size.y);
  let disposed = false;
  return {
    render(scene, camera, sceneId) {
      if (disposed) {
        throw new Error("Native post-processing is disposed");
      }
      const environment = environments.get(sceneId);
      if (!environment) {
        renderer.toneMapping = previousTone;
        renderer.toneMappingExposure = previousExposure;
        renderer.render(scene, camera);
        return;
      }
      const post = environment.postProcessing;
      renderer.toneMapping = AgXToneMapping;
      renderer.toneMappingExposure = post.exposure;
      scenePass.scene = scene;
      scenePass.camera = camera;
      bloom.enabled = Boolean(post.bloom);
      if (post.bloom) {
        bloom.strength = post.bloom.intensity;
        bloom.radius = post.bloom.radius;
        bloom.threshold = post.bloom.threshold;
        bloom.materialHighPassFilter.uniforms.smoothWidth.value =
          post.bloom.softness;
      }
      vignette.enabled = Boolean(post.vignette);
      if (post.vignette) {
        vignette.uniforms.intensity.value = post.vignette.intensity;
        vignette.uniforms.radius.value = post.vignette.radius;
        vignette.uniforms.softness.value = post.vignette.softness;
      }
      composer.render();
    },
    resize(width, height) {
      nativePostTargetBytes(width, height);
      composer.setSize(width, height);
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      for (const pass of [scenePass, bloom, output, vignette, smaa]) {
        pass.dispose();
      }
      composer.dispose();
      renderer.toneMapping = previousTone;
      renderer.toneMappingExposure = previousExposure;
    }
  };
}
