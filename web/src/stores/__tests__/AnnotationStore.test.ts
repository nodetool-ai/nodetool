import useAnnotationStore, {
  Annotation,
  ANNOTATION_COLORS
} from "../../stores/AnnotationStore";

describe("AnnotationStore", () => {
  beforeEach(() => {
    useAnnotationStore.setState({ annotations: {}, selectedAnnotationId: null });
  });

  describe("addAnnotation", () => {
    it("should add an annotation with default values", () => {
      const id = useAnnotationStore.getState().addAnnotation({ x: 100, y: 200 });

      expect(id).toBeDefined();
      expect(typeof id).toBe("string");

      const annotations = useAnnotationStore.getState().getAllAnnotations();
      expect(annotations).toHaveLength(1);

      const annotation = annotations[0];
      expect(annotation.id).toBe(id);
      expect(annotation.position).toEqual({ x: 100, y: 200 });
      expect(annotation.text).toBe("");
      expect(annotation.color).toBe("yellow");
      expect(annotation.width).toBe(200);
      expect(annotation.height).toBe(150);
      expect(annotation.createdAt).toBeDefined();
      expect(annotation.updatedAt).toBeDefined();
    });

    it("should add an annotation with custom text and color", () => {
      const id = useAnnotationStore.getState().addAnnotation(
        { x: 300, y: 400 },
        "Test annotation",
        "blue"
      );

      const annotation = useAnnotationStore.getState().getAnnotation(id);
      expect(annotation).toBeDefined();
      expect(annotation!.text).toBe("Test annotation");
      expect(annotation!.color).toBe("blue");
    });

    it("should add multiple annotations", () => {
      useAnnotationStore.getState().addAnnotation({ x: 0, y: 0 }, "First");
      useAnnotationStore.getState().addAnnotation({ x: 100, y: 100 }, "Second");

      const annotations = useAnnotationStore.getState().getAllAnnotations();
      expect(annotations).toHaveLength(2);
      expect(annotations[0].text).toBe("First");
      expect(annotations[1].text).toBe("Second");
    });
  });

  describe("updateAnnotation", () => {
    it("should update annotation text", () => {
      const id = useAnnotationStore.getState().addAnnotation({ x: 0, y: 0 });

      useAnnotationStore.getState().updateAnnotation(id, { text: "Updated text" });

      const annotation = useAnnotationStore.getState().getAnnotation(id);
      expect(annotation!.text).toBe("Updated text");
    });

    it("should update annotation position", () => {
      const id = useAnnotationStore.getState().addAnnotation({ x: 0, y: 0 });

      useAnnotationStore.getState().updateAnnotation(id, {
        position: { x: 500, y: 500 }
      });

      const annotation = useAnnotationStore.getState().getAnnotation(id);
      expect(annotation!.position).toEqual({ x: 500, y: 500 });
    });

    it("should update annotation color", () => {
      const id = useAnnotationStore.getState().addAnnotation({ x: 0, y: 0 });

      useAnnotationStore.getState().updateAnnotation(id, { color: "pink" });

      const annotation = useAnnotationStore.getState().getAnnotation(id);
      expect(annotation!.color).toBe("pink");
    });

    it("should update updatedAt timestamp", () => {
      const id = useAnnotationStore.getState().addAnnotation({ x: 0, y: 0 });
      const originalUpdatedAt = useAnnotationStore.getState().getAnnotation(id)!.updatedAt;

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          useAnnotationStore.getState().updateAnnotation(id, { text: "New text" });
          const updatedAnnotation = useAnnotationStore.getState().getAnnotation(id);
          expect(updatedAnnotation!.updatedAt).toBeGreaterThan(originalUpdatedAt);
          resolve();
        }, 10);
      });
    });

    it("should not update non-existent annotation", () => {
      expect(() => {
        useAnnotationStore.getState().updateAnnotation("non-existent", { text: "Test" });
      }).not.toThrow();
    });
  });

  describe("deleteAnnotation", () => {
    it("should delete an annotation", () => {
      const id = useAnnotationStore.getState().addAnnotation({ x: 0, y: 0 });

      useAnnotationStore.getState().deleteAnnotation(id);

      const annotations = useAnnotationStore.getState().getAllAnnotations();
      expect(annotations).toHaveLength(0);
    });

    it("should clear selectedAnnotationId when deleting selected annotation", () => {
      const id = useAnnotationStore.getState().addAnnotation({ x: 0, y: 0 });
      useAnnotationStore.getState().selectAnnotation(id);
      expect(useAnnotationStore.getState().selectedAnnotationId).toBe(id);

      useAnnotationStore.getState().deleteAnnotation(id);

      expect(useAnnotationStore.getState().selectedAnnotationId).toBeNull();
    });

    it("should not affect other annotations when deleting one", () => {
      const id1 = useAnnotationStore.getState().addAnnotation({ x: 0, y: 0 }, "First");
      const id2 = useAnnotationStore.getState().addAnnotation({ x: 100, y: 100 }, "Second");

      useAnnotationStore.getState().deleteAnnotation(id1);

      const annotations = useAnnotationStore.getState().getAllAnnotations();
      expect(annotations).toHaveLength(1);
      expect(annotations[0].id).toBe(id2);
    });
  });

  describe("selectAnnotation", () => {
    it("should select an annotation", () => {
      const id = useAnnotationStore.getState().addAnnotation({ x: 0, y: 0 });

      useAnnotationStore.getState().selectAnnotation(id);

      expect(useAnnotationStore.getState().selectedAnnotationId).toBe(id);
    });

    it("should deselect when passing null", () => {
      const id = useAnnotationStore.getState().addAnnotation({ x: 0, y: 0 });
      useAnnotationStore.getState().selectAnnotation(id);

      useAnnotationStore.getState().selectAnnotation(null);

      expect(useAnnotationStore.getState().selectedAnnotationId).toBeNull();
    });
  });

  describe("getAnnotation", () => {
    it("should return undefined for non-existent annotation", () => {
      const result = useAnnotationStore.getState().getAnnotation("non-existent");
      expect(result).toBeUndefined();
    });

    it("should return the correct annotation", () => {
      const id = useAnnotationStore.getState().addAnnotation({ x: 50, y: 75 }, "Test");

      const result = useAnnotationStore.getState().getAnnotation(id);

      expect(result).toBeDefined();
      expect(result!.id).toBe(id);
      expect(result!.text).toBe("Test");
    });
  });

  describe("getAllAnnotations", () => {
    it("should return empty array when no annotations", () => {
      const result = useAnnotationStore.getState().getAllAnnotations();
      expect(result).toEqual([]);
    });

    it("should return all annotations", () => {
      useAnnotationStore.getState().addAnnotation({ x: 0, y: 0 }, "First");
      useAnnotationStore.getState().addAnnotation({ x: 100, y: 100 }, "Second");
      useAnnotationStore.getState().addAnnotation({ x: 200, y: 200 }, "Third");

      const result = useAnnotationStore.getState().getAllAnnotations();

      expect(result).toHaveLength(3);
    });
  });

  describe("clearAnnotations", () => {
    it("should remove all annotations", () => {
      useAnnotationStore.getState().addAnnotation({ x: 0, y: 0 });
      useAnnotationStore.getState().addAnnotation({ x: 100, y: 100 });

      useAnnotationStore.getState().clearAnnotations();

      expect(useAnnotationStore.getState().getAllAnnotations()).toHaveLength(0);
    });

    it("should reset selectedAnnotationId", () => {
      const id = useAnnotationStore.getState().addAnnotation({ x: 0, y: 0 });
      useAnnotationStore.getState().selectAnnotation(id);

      useAnnotationStore.getState().clearAnnotations();

      expect(useAnnotationStore.getState().selectedAnnotationId).toBeNull();
    });
  });

  describe("importAnnotations", () => {
    it("should import annotations from array", () => {
      const annotationsToImport: Annotation[] = [
        {
          id: "test-1",
          text: "Imported 1",
          position: { x: 10, y: 20 },
          color: "green",
          width: 200,
          height: 150,
          createdAt: 1000,
          updatedAt: 2000
        },
        {
          id: "test-2",
          text: "Imported 2",
          position: { x: 30, y: 40 },
          color: "blue",
          width: 250,
          height: 180,
          createdAt: 3000,
          updatedAt: 4000
        }
      ];

      useAnnotationStore.getState().importAnnotations(annotationsToImport);

      const annotations = useAnnotationStore.getState().getAllAnnotations();
      expect(annotations).toHaveLength(2);
      expect(annotations[0].id).toBe("test-1");
      expect(annotations[1].id).toBe("test-2");
    });

    it("should clear existing annotations on import", () => {
      useAnnotationStore.getState().addAnnotation({ x: 0, y: 0 }, "Existing");

      useAnnotationStore.getState().importAnnotations([
        {
          id: "imported-1",
          text: "Imported",
          position: { x: 100, y: 100 },
          color: "yellow",
          width: 200,
          height: 150,
          createdAt: 1000,
          updatedAt: 2000
        }
      ]);

      const annotations = useAnnotationStore.getState().getAllAnnotations();
      expect(annotations).toHaveLength(1);
      expect(annotations[0].text).toBe("Imported");
    });
  });

  describe("ANNOTATION_COLORS", () => {
    it("should have 5 color options", () => {
      expect(ANNOTATION_COLORS).toHaveLength(5);
    });

    it("should have expected color IDs", () => {
      const colorIds = ANNOTATION_COLORS.map((c) => c.id);
      expect(colorIds).toContain("yellow");
      expect(colorIds).toContain("green");
      expect(colorIds).toContain("blue");
      expect(colorIds).toContain("pink");
      expect(colorIds).toContain("orange");
    });

    it("should have label and colors defined for each", () => {
      ANNOTATION_COLORS.forEach((color) => {
        expect(color.label).toBeDefined();
        expect(color.bgColor).toBeDefined();
        expect(color.borderColor).toBeDefined();
        expect(typeof color.id).toBe("string");
      });
    });
  });
});
