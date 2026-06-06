import {
  BESPOKE_BODY_REGISTRY,
  isBespokeNode,
  getBespokeBody
} from "../bespokeRegistry";
import type { NodeMetadata } from "../../../../stores/ApiTypes";

describe("bespokeRegistry", () => {
  describe("BESPOKE_BODY_REGISTRY", () => {
    it("is a non-empty frozen record", () => {
      expect(Object.keys(BESPOKE_BODY_REGISTRY).length).toBeGreaterThan(0);
    });

    it("maps every key to a React component", () => {
      for (const [, component] of Object.entries(BESPOKE_BODY_REGISTRY)) {
        expect(component).toBeDefined();
        expect(
          typeof component === "function" || typeof component === "object"
        ).toBe(true);
      }
    });

    it("includes known bespoke node types", () => {
      const knownTypes = [
        "nodetool.image.Crop",
        "nodetool.image.ResizeImage",
        "nodetool.image.Resize",
        "nodetool.image.Fit"
      ];
      for (const nodeType of knownTypes) {
        expect(nodeType in BESPOKE_BODY_REGISTRY).toBe(true);
      }
    });
  });

  describe("isBespokeNode", () => {
    it("returns true for a registered node type", () => {
      const firstKey = Object.keys(BESPOKE_BODY_REGISTRY)[0];
      const metadata = { node_type: firstKey } as NodeMetadata;
      expect(isBespokeNode(metadata)).toBe(true);
    });

    it("returns false for an unregistered node type", () => {
      const metadata = {
        node_type: "nodetool.nonexistent.Node"
      } as NodeMetadata;
      expect(isBespokeNode(metadata)).toBe(false);
    });

    it("returns false for undefined metadata", () => {
      expect(isBespokeNode(undefined)).toBe(false);
    });

    it("returns false when node_type is missing", () => {
      const metadata = {} as NodeMetadata;
      expect(isBespokeNode(metadata)).toBe(false);
    });
  });

  describe("getBespokeBody", () => {
    it("returns a component for a registered node type", () => {
      const firstKey = Object.keys(BESPOKE_BODY_REGISTRY)[0];
      const metadata = { node_type: firstKey } as NodeMetadata;
      const component = getBespokeBody(metadata);
      expect(component).toBeDefined();
    });

    it("returns undefined for an unregistered node type", () => {
      const metadata = {
        node_type: "nodetool.nonexistent.Node"
      } as NodeMetadata;
      expect(getBespokeBody(metadata)).toBeUndefined();
    });

    it("returns undefined for undefined metadata", () => {
      expect(getBespokeBody(undefined)).toBeUndefined();
    });

    it("returns the same component as the registry for a known type", () => {
      const firstKey = Object.keys(BESPOKE_BODY_REGISTRY)[0];
      const metadata = { node_type: firstKey } as NodeMetadata;
      expect(getBespokeBody(metadata)).toBe(BESPOKE_BODY_REGISTRY[firstKey]);
    });
  });
});
