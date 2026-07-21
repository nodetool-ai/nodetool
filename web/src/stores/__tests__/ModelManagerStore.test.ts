import { act } from "@testing-library/react";
import { useModelManagerStore } from "../ModelManagerStore";

describe("ModelManagerStore", () => {
  beforeEach(() => {
    useModelManagerStore.setState({
      isOpen: false,
      modelSearchTerm: "",
      selectedModelType: "All",
      maxModelSizeGB: 0,
      sortField: "name",
      sortDirection: "asc",
      scope: "local",
      source: "installed"
    });
  });

  describe("initial state", () => {
    test("should initialize with default values", () => {
      const state = useModelManagerStore.getState();
      expect(state.isOpen).toBe(false);
      expect(state.modelSearchTerm).toBe("");
      expect(state.selectedModelType).toBe("All");
      expect(state.maxModelSizeGB).toBe(0);
      expect(state.sortField).toBe("name");
      expect(state.sortDirection).toBe("asc");
    });
  });

  describe("isOpen state", () => {
    test("should set isOpen to true", () => {
      act(() => {
        useModelManagerStore.getState().setIsOpen(true);
      });

      expect(useModelManagerStore.getState().isOpen).toBe(true);
    });

    test("should set isOpen to false", () => {
      act(() => {
        useModelManagerStore.getState().setIsOpen(true);
        useModelManagerStore.getState().setIsOpen(false);
      });

      expect(useModelManagerStore.getState().isOpen).toBe(false);
    });
  });

  describe("model search term", () => {
    test("should set model search term", () => {
      act(() => {
        useModelManagerStore.getState().setModelSearchTerm("llama");
      });

      expect(useModelManagerStore.getState().modelSearchTerm).toBe("llama");
    });

    test("should clear model search term", () => {
      act(() => {
        useModelManagerStore.getState().setModelSearchTerm("llama");
        useModelManagerStore.getState().setModelSearchTerm("");
      });

      expect(useModelManagerStore.getState().modelSearchTerm).toBe("");
    });
  });

  describe("selected model type", () => {
    test("should set selected model type", () => {
      act(() => {
        useModelManagerStore.getState().setSelectedModelType("text-generation");
      });

      expect(useModelManagerStore.getState().selectedModelType).toBe("text-generation");
    });

    test("should reset selected model type to All", () => {
      act(() => {
        useModelManagerStore.getState().setSelectedModelType("text-generation");
        useModelManagerStore.getState().setSelectedModelType("All");
      });

      expect(useModelManagerStore.getState().selectedModelType).toBe("All");
    });
  });

  describe("max model size", () => {
    test("should set max model size in GB", () => {
      act(() => {
        useModelManagerStore.getState().setMaxModelSizeGB(8);
      });

      expect(useModelManagerStore.getState().maxModelSizeGB).toBe(8);
    });

    test("should set max model size to 0 (no limit)", () => {
      act(() => {
        useModelManagerStore.getState().setMaxModelSizeGB(8);
        useModelManagerStore.getState().setMaxModelSizeGB(0);
      });

      expect(useModelManagerStore.getState().maxModelSizeGB).toBe(0);
    });
  });

  describe("sort field", () => {
    test("should set sort field", () => {
      act(() => {
        useModelManagerStore.getState().setSortField("size");
      });

      expect(useModelManagerStore.getState().sortField).toBe("size");
    });

    test("should set sort field to downloads", () => {
      act(() => {
        useModelManagerStore.getState().setSortField("downloads");
      });

      expect(useModelManagerStore.getState().sortField).toBe("downloads");
    });
  });

  describe("sort direction", () => {
    test("should set sort direction", () => {
      act(() => {
        useModelManagerStore.getState().setSortDirection("desc");
      });

      expect(useModelManagerStore.getState().sortDirection).toBe("desc");
    });

    test("should toggle sort direction", () => {
      act(() => {
        useModelManagerStore.getState().toggleSortDirection();
      });

      expect(useModelManagerStore.getState().sortDirection).toBe("desc");

      act(() => {
        useModelManagerStore.getState().toggleSortDirection();
      });

      expect(useModelManagerStore.getState().sortDirection).toBe("asc");
    });
  });

  describe("scope", () => {
    test("should default to local", () => {
      expect(useModelManagerStore.getState().scope).toBe("local");
    });

    test("setScope switches the active scope", () => {
      act(() => {
        useModelManagerStore.getState().setScope("worker");
      });
      expect(useModelManagerStore.getState().scope).toBe("worker");

      act(() => {
        useModelManagerStore.getState().setScope("local");
      });
      expect(useModelManagerStore.getState().scope).toBe("local");
    });
  });

  describe("persistence", () => {
    test("persists sort and size-filter preferences to localStorage", () => {
      act(() => {
        useModelManagerStore.getState().setSortField("downloads");
        useModelManagerStore.getState().setSortDirection("desc");
        useModelManagerStore.getState().setMaxModelSizeGB(12);
      });

      const persisted = JSON.parse(
        localStorage.getItem("model-manager") || "{}"
      );
      expect(persisted.state).toMatchObject({
        sortField: "downloads",
        sortDirection: "desc",
        maxModelSizeGB: 12
      });
    });

    test("does not persist ephemeral session state", () => {
      act(() => {
        useModelManagerStore.getState().setModelSearchTerm("llama");
        useModelManagerStore.getState().setScope("worker");
        useModelManagerStore.getState().setSource("hub");
        useModelManagerStore.getState().setSelectedModelType("text-generation");
      });

      const persisted = JSON.parse(
        localStorage.getItem("model-manager") || "{}"
      );
      expect(persisted.state).not.toHaveProperty("modelSearchTerm");
      expect(persisted.state).not.toHaveProperty("scope");
      expect(persisted.state).not.toHaveProperty("source");
      expect(persisted.state).not.toHaveProperty("selectedModelType");
    });
  });

  describe("multiple state changes", () => {
    test("should handle multiple state changes", () => {
      act(() => {
        useModelManagerStore.getState().setIsOpen(true);
        useModelManagerStore.getState().setModelSearchTerm("gpt");
        useModelManagerStore.getState().setSelectedModelType("text-generation");
        useModelManagerStore.getState().setMaxModelSizeGB(4);
      });

      const state = useModelManagerStore.getState();
      expect(state.isOpen).toBe(true);
      expect(state.modelSearchTerm).toBe("gpt");
      expect(state.selectedModelType).toBe("text-generation");
      expect(state.maxModelSizeGB).toBe(4);
    });
  });
});
