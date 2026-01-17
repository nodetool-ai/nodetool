import useModelFiltersStore, { TypeTag, SizeBucket } from "../ModelFiltersStore";

describe("ModelFiltersStore", () => {
  beforeEach(() => {
    useModelFiltersStore.setState(useModelFiltersStore.getInitialState());
  });

  describe("initial state", () => {
    it("should initialize with empty selectedTypes", () => {
      const state = useModelFiltersStore.getInitialState();
      expect(state.selectedTypes).toEqual([]);
    });

    it("should initialize with null sizeBucket", () => {
      const state = useModelFiltersStore.getInitialState();
      expect(state.sizeBucket).toBeNull();
    });

    it("should initialize with empty families", () => {
      const state = useModelFiltersStore.getInitialState();
      expect(state.families).toEqual([]);
    });
  });

  describe("toggleType", () => {
    it("should add type when not already selected", () => {
      useModelFiltersStore.getState().toggleType("instruct");
      expect(useModelFiltersStore.getState().selectedTypes).toContain("instruct");
    });

    it("should remove type when already selected", () => {
      useModelFiltersStore.setState({ selectedTypes: ["instruct", "chat"] });
      useModelFiltersStore.getState().toggleType("instruct");
      expect(useModelFiltersStore.getState().selectedTypes).toEqual(["chat"]);
    });

    it("should handle multiple types", () => {
      useModelFiltersStore.getState().toggleType("instruct");
      useModelFiltersStore.getState().toggleType("chat");
      useModelFiltersStore.getState().toggleType("base");
      expect(useModelFiltersStore.getState().selectedTypes).toEqual([
        "instruct",
        "chat",
        "base"
      ]);
    });

    it("should handle all type tags", () => {
      const types: TypeTag[] = [
        "instruct",
        "chat",
        "base",
        "sft",
        "dpo",
        "reasoning",
        "code",
        "math"
      ];

      types.forEach((type) => {
        useModelFiltersStore.getState().toggleType(type);
      });

      expect(useModelFiltersStore.getState().selectedTypes).toEqual(types);
    });
  });

  describe("setSizeBucket", () => {
    it("should set sizeBucket to a value", () => {
      useModelFiltersStore.getState().setSizeBucket("3-7B");
      expect(useModelFiltersStore.getState().sizeBucket).toBe("3-7B");
    });

    it("should set sizeBucket to null", () => {
      useModelFiltersStore.setState({ sizeBucket: "3-7B" });
      useModelFiltersStore.getState().setSizeBucket(null);
      expect(useModelFiltersStore.getState().sizeBucket).toBeNull();
    });

    it("should update from one bucket to another", () => {
      useModelFiltersStore.setState({ sizeBucket: "3-7B" });
      useModelFiltersStore.getState().setSizeBucket("8-15B");
      expect(useModelFiltersStore.getState().sizeBucket).toBe("8-15B");
    });

    it("should handle all size buckets", () => {
      const buckets: SizeBucket[] = [
        "1-2B",
        "3-7B",
        "8-15B",
        "16-34B",
        "35-70B",
        "70B+"
      ];

      buckets.forEach((bucket) => {
        useModelFiltersStore.getState().setSizeBucket(bucket);
        expect(useModelFiltersStore.getState().sizeBucket).toBe(bucket);
      });
    });
  });

  describe("toggleFamily", () => {
    it("should add family when not already selected", () => {
      useModelFiltersStore.getState().toggleFamily("llama");
      expect(useModelFiltersStore.getState().families).toContain("llama");
    });

    it("should remove family when already selected", () => {
      useModelFiltersStore.setState({ families: ["llama", "qwen"] });
      useModelFiltersStore.getState().toggleFamily("llama");
      expect(useModelFiltersStore.getState().families).toEqual(["qwen"]);
    });

    it("should handle multiple families", () => {
      useModelFiltersStore.getState().toggleFamily("llama");
      useModelFiltersStore.getState().toggleFamily("qwen");
      useModelFiltersStore.getState().toggleFamily("mistral");
      expect(useModelFiltersStore.getState().families).toEqual([
        "llama",
        "qwen",
        "mistral"
      ]);
    });
  });

  describe("clearAll", () => {
    it("should clear all filters", () => {
      useModelFiltersStore.setState({
        selectedTypes: ["instruct", "chat"],
        sizeBucket: "3-7B",
        families: ["llama", "qwen"]
      });

      useModelFiltersStore.getState().clearAll();

      expect(useModelFiltersStore.getState().selectedTypes).toEqual([]);
      expect(useModelFiltersStore.getState().sizeBucket).toBeNull();
      expect(useModelFiltersStore.getState().families).toEqual([]);
    });

    it("should work on initial state", () => {
      useModelFiltersStore.getState().clearAll();
      expect(useModelFiltersStore.getState().selectedTypes).toEqual([]);
      expect(useModelFiltersStore.getState().sizeBucket).toBeNull();
      expect(useModelFiltersStore.getState().families).toEqual([]);
    });
  });

  describe("full workflow", () => {
    it("should handle complete filter workflow", () => {
      expect(useModelFiltersStore.getState().selectedTypes).toEqual([]);
      expect(useModelFiltersStore.getState().sizeBucket).toBeNull();
      expect(useModelFiltersStore.getState().families).toEqual([]);

      useModelFiltersStore.getState().toggleType("instruct");
      useModelFiltersStore.getState().toggleType("chat");
      expect(useModelFiltersStore.getState().selectedTypes).toHaveLength(2);

      useModelFiltersStore.getState().setSizeBucket("8-15B");
      expect(useModelFiltersStore.getState().sizeBucket).toBe("8-15B");

      useModelFiltersStore.getState().toggleFamily("llama");
      useModelFiltersStore.getState().toggleFamily("mistral");
      expect(useModelFiltersStore.getState().families).toHaveLength(2);

      useModelFiltersStore.getState().clearAll();
      expect(useModelFiltersStore.getState().selectedTypes).toEqual([]);
      expect(useModelFiltersStore.getState().sizeBucket).toBeNull();
      expect(useModelFiltersStore.getState().families).toEqual([]);
    });

    it("should handle selective removal", () => {
      useModelFiltersStore.setState({
        selectedTypes: ["instruct", "chat", "base"],
        families: ["llama", "qwen", "mistral"]
      });

      useModelFiltersStore.getState().toggleType("chat");
      expect(useModelFiltersStore.getState().selectedTypes).toEqual([
        "instruct",
        "base"
      ]);

      useModelFiltersStore.getState().toggleFamily("qwen");
      expect(useModelFiltersStore.getState().families).toEqual([
        "llama",
        "mistral"
      ]);
    });
  });
});
