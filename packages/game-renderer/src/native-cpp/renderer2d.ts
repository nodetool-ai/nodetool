import type {
  NativeFrame,
  NativeGame2dDocument
} from "@nodetool-ai/protocol/native-game";
import type { NativeRenderer, NativeRendererOptions } from "./contracts.js";
import { nativeDrawPlan2D } from "./draw2d-plan.js";
import { prepareNativeImages2D } from "./image2d-verified.js";

const VERTEX = `#version 300 es
in vec2 position;in vec2 uv;in vec4 tint;in vec3 world;out vec2 vUv;out vec4 vTint;out vec3 vWorld;
void main(){gl_Position=vec4(position,0.,1.);vUv=uv;vTint=tint;vWorld=world;}`;
const FRAGMENT = `#version 300 es
precision highp float;in vec2 vUv;in vec4 vTint;in vec3 vWorld;uniform sampler2D surface;uniform vec4 ambient;uniform vec4 points[64];out vec4 color;
void main(){vec4 sampleColor=texture(surface,vUv);color=vec4(sampleColor.rgb*vTint.rgb*vTint.a,sampleColor.a*vTint.a);vec3 lighting=ambient.rgb;for(int i=0;i<32;i++){if(i>=int(ambient.a)){break;}vec4 p=points[i*2];vec4 c=points[i*2+1];float attenuation=pow(max(0.,1.-length(vWorld.xy-p.xy)/p.z),p.w);lighting+=c.rgb*c.a*attenuation;}if(vWorld.z<.5){color.rgb*=clamp(lighting,0.,1.);}}`;
/** Creates the GPU host for committed native 2D frames. */
export async function createNativeRenderer2D(
  options: NativeRendererOptions,
  document: NativeGame2dDocument
): Promise<NativeRenderer> {
  const prepared = await prepareNativeImages2D(options.assets, document.assets),
    canvas = options.canvas;
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    premultipliedAlpha: true,
    antialias: false,
    preserveDrawingBuffer: true
  });
  if (!gl) {
    prepared.dispose();
    throw new Error("Native 2D rendering requires WebGL2");
  }
  let program: WebGLProgram | null = null,
    buffer: WebGLBuffer | null = null,
    vao: WebGLVertexArrayObject | null = null;
  const textures = new Map<string, WebGLTexture>();
  let disposed = false,
    lost = false,
    capacity = 0;
  let ambient: WebGLUniformLocation | null = null,
    points: WebGLUniformLocation | null = null;
  const release = (): void => {
    for (const texture of textures.values()) {
      gl.deleteTexture(texture);
    }
    textures.clear();
    gl.deleteBuffer(buffer);
    gl.deleteVertexArray(vao);
    gl.deleteProgram(program);
    program = null;
    buffer = null;
    vao = null;
    capacity = 0;
  };
  const initialize = (): void => {
    const shaders: WebGLShader[] = [];
    try {
      for (const [kind, source] of [
        [gl.VERTEX_SHADER, VERTEX],
        [gl.FRAGMENT_SHADER, FRAGMENT]
      ] as const) {
        const shader = gl.createShader(kind);
        if (!shader) {
          throw new Error("Native 2D shader allocation failed");
        }
        shaders.push(shader);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          throw new Error(`Native 2D shader: ${gl.getShaderInfoLog(shader)}`);
        }
      }
      program = gl.createProgram();
      if (!program) {
        throw new Error("Native 2D program unavailable");
      }
      for (const shader of shaders) {
        gl.attachShader(program, shader);
      }
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(`Native 2D link: ${gl.getProgramInfoLog(program)}`);
      }
      buffer = gl.createBuffer();
      vao = gl.createVertexArray();
      if (!buffer || !vao) {
        throw new Error("Native 2D geometry unavailable");
      }
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      let offset = 0;
      for (const [name, count] of [
        ["position", 2],
        ["uv", 2],
        ["tint", 4],
        ["world", 3]
      ] as const) {
        const location = gl.getAttribLocation(program, name);
        gl.enableVertexAttribArray(location);
        gl.vertexAttribPointer(
          location,
          count,
          gl.FLOAT,
          false,
          44,
          offset * 4
        );
        offset += count;
      }
      ambient = gl.getUniformLocation(program, "ambient");
      points = gl.getUniformLocation(program, "points");
      gl.useProgram(program);
      gl.uniform1i(gl.getUniformLocation(program, "surface"), 0);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
      for (const [id, image] of prepared.images) {
        const maxTextureSize: unknown = gl.getParameter(gl.MAX_TEXTURE_SIZE);
        if (
          typeof maxTextureSize !== "number" ||
          image.width > maxTextureSize ||
          image.height > maxTextureSize
        ) {
          throw new Error(`Native image exceeds GPU texture limit: ${id}`);
        }
        const texture = gl.createTexture();
        if (!texture) {
          throw new Error("Native 2D texture unavailable");
        }
        textures.set(id, texture);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          image.image
        );
      }
      const error = gl.getError();
      if (error !== gl.NO_ERROR) {
        throw new Error(`Native 2D GPU initialization failed: ${error}`);
      }
    } catch (error) {
      release();
      throw error;
    } finally {
      for (const shader of shaders) {
        gl.deleteShader(shader);
      }
    }
  };
  try {
    initialize();
  } catch (error) {
    prepared.dispose();
    throw error;
  }
  const contextLost = (event: Event): void => {
    event.preventDefault();
    lost = true;
    options.onContextLost?.();
  };
  const contextRestored = (): void => {
    if (disposed) {
      return;
    }
    try {
      // Handles from the lost context are invalid even after restoration.
      textures.clear();
      program = null;
      buffer = null;
      vao = null;
      capacity = 0;
      initialize();
      lost = false;
      options.onContextRestored?.();
    } catch (error) {
      options.onError?.(
        error instanceof Error ? error : new Error(String(error))
      );
    }
  };
  canvas.addEventListener("webglcontextlost", contextLost);
  canvas.addEventListener("webglcontextrestored", contextRestored);
  return {
    render(frame: NativeFrame): void {
      if (disposed) {
        throw new Error("Native 2D renderer disposed");
      }
      if (frame.dimension !== "2d") {
        throw new Error("Native 2D renderer received a 3D frame");
      }
      if (lost) {
        return;
      }
      const plan = nativeDrawPlan2D(
        document,
        frame,
        prepared.images,
        canvas.width,
        canvas.height
      );
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(18 / 255, 22 / 255, 30 / 255, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      if (plan.vertices.byteLength > capacity) {
        capacity = Math.min(
          44 * 1_000_000,
          Math.max(plan.vertices.byteLength, capacity * 2, 4096)
        );
        gl.bufferData(gl.ARRAY_BUFFER, capacity, gl.DYNAMIC_DRAW);
      }
      if (plan.vertices.length) {
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, plan.vertices);
      }
      gl.uniform4fv(ambient, plan.lighting.subarray(0, 4));
      gl.uniform4fv(points, plan.lighting.subarray(4));
      gl.enable(gl.BLEND);
      gl.activeTexture(gl.TEXTURE0);
      for (const draw of plan.draws) {
        const texture = textures.get(draw.assetId);
        if (!texture) {
          throw new Error(`Native 2D texture missing: ${draw.assetId}`);
        }
        gl.bindTexture(gl.TEXTURE_2D, texture);
        const sampling = draw.linear ? gl.LINEAR : gl.NEAREST;
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, sampling);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, sampling);
        gl.blendFuncSeparate(
          gl.ONE,
          draw.additive ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA,
          gl.ONE,
          gl.ONE_MINUS_SRC_ALPHA
        );
        gl.drawArrays(gl.TRIANGLES, draw.first, 6);
      }
    },
    finishFrame(): void {
      if (disposed) {
        throw new Error("Native 2D renderer disposed");
      }
      if (lost || gl.isContextLost()) {
        throw new Error("Native 2D GPU context lost");
      }
      gl.finish();
    },
    resize(width: number, height: number, pixelRatio = 1): void {
      if (
        !Number.isFinite(width) ||
        !Number.isFinite(height) ||
        !Number.isFinite(pixelRatio) ||
        width <= 0 ||
        height <= 0 ||
        pixelRatio <= 0 ||
        width * pixelRatio > 16384 ||
        height * pixelRatio > 16384
      ) {
        throw new Error("Invalid native 2D render size");
      }
      canvas.width = Math.max(1, Math.round(width * pixelRatio));
      canvas.height = Math.max(1, Math.round(height * pixelRatio));
    },
    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      canvas.removeEventListener("webglcontextlost", contextLost);
      canvas.removeEventListener("webglcontextrestored", contextRestored);
      release();
      prepared.dispose();
    }
  };
}
