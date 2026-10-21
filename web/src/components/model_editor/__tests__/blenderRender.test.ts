import * as THREE from "three";
import {
  DEFAULT_BLENDER_RENDER_SETTINGS,
  VIEW_CAMERA_NAME,
  blenderRenderNodeData,
  heightForAspect,
  makeViewCamera,
  renderedImageOf,
  sanitizeBlenderSettings
} from "../blenderRender";

describe("sanitizeBlenderSettings", () => {
  it("falls back to the defaults for missing or unreadable input", () => {
    expect(sanitizeBlenderSettings(null)).toEqual(DEFAULT_BLENDER_RENDER_SETTINGS);
    expect(sanitizeBlenderSettings("nonsense")).toEqual(DEFAULT_BLENDER_RENDER_SETTINGS);
  });

  it("clamps numbers into the RenderImage node's bounds and rounds integers", () => {
    const settings = sanitizeBlenderSettings({
      samples: 99999,
      width: 2.6,
      height: 8000,
      resolutionPercentage: 250,
      elevation: 120,
      zoom: 0,
      timeout: Number.NaN
    });
    expect(settings.samples).toBe(4096);
    expect(settings.width).toBe(16);
    expect(settings.height).toBe(4096);
    expect(settings.resolutionPercentage).toBe(100);
    expect(settings.elevation).toBe(89);
    expect(settings.zoom).toBe(0.1);
    expect(settings.timeout).toBe(DEFAULT_BLENDER_RENDER_SETTINGS.timeout);
  });

  it("drops unknown enum values and malformed colors", () => {
    const settings = sanitizeBlenderSettings({
      engine: "octane",
      camera: "drone",
      lighting: "neon",
      backgroundColor: "red",
      transparent: "yes"
    });
    expect(settings.engine).toBe("eevee");
    expect(settings.camera).toBe("view");
    expect(settings.lighting).toBe("studio");
    expect(settings.backgroundColor).toBe("#808080");
    expect(settings.transparent).toBe(false);
  });

  it("keeps valid values", () => {
    const settings = sanitizeBlenderSettings({ engine: "cycles", camera: "orbit", backgroundColor: "#112233" });
    expect(settings.engine).toBe("cycles");
    expect(settings.camera).toBe("orbit");
    expect(settings.backgroundColor).toBe("#112233");
  });
});

describe("heightForAspect", () => {
  it("gives the width the view's aspect ratio", () => {
    expect(heightForAspect(1920, 16 / 9)).toBe(1080);
    expect(heightForAspect(1000, 0.5)).toBe(2000);
  });

  it("stays inside the bounds and survives a zero-size view", () => {
    expect(heightForAspect(4096, 0.1)).toBe(4096);
    expect(heightForAspect(512, 0)).toBe(512);
  });
});

describe("blenderRenderNodeData", () => {
  it("maps the settings onto the RenderImage node props", () => {
    const data = blenderRenderNodeData(
      { ...DEFAULT_BLENDER_RENDER_SETTINGS, engine: "cycles", samples: 256, lightIntensity: 2 },
      "abc123"
    );
    expect(data).toMatchObject({
      model: { type: "model_3d", uri: "asset://abc123", asset_id: "abc123" },
      engine: "cycles",
      samples: 256,
      light_intensity: 2,
      resolution_percentage: 100,
      background_color: "#808080"
    });
  });

  it("renders the editor view through the scene's first camera", () => {
    const view = blenderRenderNodeData({ ...DEFAULT_BLENDER_RENDER_SETTINGS, camera: "view" }, "a");
    const orbit = blenderRenderNodeData({ ...DEFAULT_BLENDER_RENDER_SETTINGS, camera: "orbit" }, "a");
    expect(view.camera_mode).toBe("scene");
    expect(orbit.camera_mode).toBe("orbit");
  });
});

describe("makeViewCamera", () => {
  it("copies the viewport camera into the root's space with the output aspect", () => {
    const root = new THREE.Group();
    root.position.set(10, 0, 0);
    const view = new THREE.PerspectiveCamera(42, 1.2, 0.1, 500);
    view.position.set(10, 2, 5);
    view.lookAt(10, 0, 0);

    const camera = makeViewCamera(view, root, 2);
    expect(camera.name).toBe(VIEW_CAMERA_NAME);
    expect(camera.fov).toBe(42);
    expect(camera.aspect).toBe(2);
    expect(camera.position.x).toBeCloseTo(0);
    expect(camera.position.y).toBeCloseTo(2);
    expect(camera.position.z).toBeCloseTo(5);
    expect(camera.quaternion.angleTo(view.quaternion)).toBeCloseTo(0);
  });

  it("refuses an orthographic view", () => {
    expect(() => makeViewCamera(new THREE.OrthographicCamera(), new THREE.Group(), 1)).toThrow(/orbit/);
  });
});

describe("renderedImageOf", () => {
  it("prefers an asset the server already stored", () => {
    expect(renderedImageOf({ image: { asset_id: "img1", data: "AAAA" } })).toEqual({ kind: "asset", assetId: "img1" });
    expect(renderedImageOf({ image: { uri: "asset://img2.png" } })).toEqual({ kind: "asset", assetId: "img2" });
  });

  it("decodes inline base64 and data URLs", () => {
    const inline = renderedImageOf({ image: { data: "AQID" } });
    expect(inline).toEqual({ kind: "bytes", bytes: new Uint8Array([1, 2, 3]) });
    const dataUrl = renderedImageOf({ image: { uri: "data:image/png;base64,AQID" } });
    expect(dataUrl).toEqual({ kind: "bytes", bytes: new Uint8Array([1, 2, 3]) });
  });

  it("returns a URL to fetch, or null when there is no image", () => {
    expect(renderedImageOf({ image: { uri: "https://x.test/r.png" } })).toEqual({ kind: "url", url: "https://x.test/r.png" });
    expect(renderedImageOf({ image: { uri: "", data: "" } })).toBeNull();
    expect(renderedImageOf({})).toBeNull();
    expect(renderedImageOf(null)).toBeNull();
  });
});
