import * as THREE from "three";
import {
  GEOMETRY_PARAM_SPECS,
  buildGeometry,
  isEditableGeometryType,
  readGeometryParams,
  type EditableGeometryType
} from "../geometryParams";

describe("isEditableGeometryType", () => {
  it("accepts the five primitive geometry types", () => {
    expect(isEditableGeometryType("BoxGeometry")).toBe(true);
    expect(isEditableGeometryType("SphereGeometry")).toBe(true);
    expect(isEditableGeometryType("PlaneGeometry")).toBe(true);
    expect(isEditableGeometryType("CylinderGeometry")).toBe(true);
    expect(isEditableGeometryType("TorusGeometry")).toBe(true);
  });

  it("rejects plain and unknown geometries", () => {
    expect(isEditableGeometryType("BufferGeometry")).toBe(false);
    expect(isEditableGeometryType(undefined)).toBe(false);
  });
});

describe("readGeometryParams", () => {
  it("reads construction parameters from a primitive", () => {
    const params = readGeometryParams(new THREE.BoxGeometry(2, 3, 4));
    expect(params).toMatchObject({ width: 2, height: 3, depth: 4 });
  });

  it("returns an empty object for a plain BufferGeometry", () => {
    expect(readGeometryParams(new THREE.BufferGeometry())).toEqual({});
  });
});

describe("buildGeometry", () => {
  it("builds a box from explicit parameters", () => {
    const geo = buildGeometry("BoxGeometry", {
      width: 5,
      height: 6,
      depth: 7,
      widthSegments: 2,
      heightSegments: 3,
      depthSegments: 4
    }) as THREE.BoxGeometry;
    expect(geo).toBeInstanceOf(THREE.BoxGeometry);
    expect(geo.parameters).toMatchObject({
      width: 5,
      height: 6,
      depth: 7,
      widthSegments: 2,
      heightSegments: 3,
      depthSegments: 4
    });
  });

  it("preserves cylinder openEnded across a rebuild", () => {
    const original = new THREE.CylinderGeometry(1, 1, 2, 16, 1, true);
    const rebuilt = buildGeometry(
      "CylinderGeometry",
      readGeometryParams(original)
    ) as THREE.CylinderGeometry;
    expect(rebuilt.parameters.openEnded).toBe(true);
  });

  it("falls back to defaults for missing keys", () => {
    const geo = buildGeometry("SphereGeometry", {
      radius: 3
    }) as THREE.SphereGeometry;
    expect(geo.parameters.radius).toBe(3);
    expect(geo.parameters.widthSegments).toBe(32);
  });

  it("round-trips every editable primitive", () => {
    const samples: Record<EditableGeometryType, THREE.BufferGeometry> = {
      BoxGeometry: new THREE.BoxGeometry(1, 2, 3),
      SphereGeometry: new THREE.SphereGeometry(0.5, 32, 16),
      PlaneGeometry: new THREE.PlaneGeometry(2, 2),
      CylinderGeometry: new THREE.CylinderGeometry(0.5, 0.5, 1, 32),
      TorusGeometry: new THREE.TorusGeometry(0.5, 0.2, 16, 64)
    };
    for (const [type, geo] of Object.entries(samples) as [
      EditableGeometryType,
      THREE.BufferGeometry
    ][]) {
      const rebuilt = buildGeometry(type, readGeometryParams(geo));
      expect(rebuilt.type).toBe(type);
      // Every spec key should be reflected on the rebuilt geometry's parameters.
      const params = readGeometryParams(rebuilt);
      for (const spec of GEOMETRY_PARAM_SPECS[type]) {
        expect(params[spec.key]).toBeDefined();
      }
    }
  });
});
