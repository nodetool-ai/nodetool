import { act } from "@testing-library/react";
import { useModelManagerStore } from "../ModelManagerStore";

describe("ModelManagerStore", () => {
  beforeEach(() => {
    useModelManagerStore.setState({
      isOpen: false,
      modelSearchTerm: "",
      selectedModelType: "All",
      maxModelSizeGB: 0,
      filterStatus: "all"
    });
  });

  describe("initial state", () => {
    test("should initialize with default values", () => {
      const state = useModelManagerStore.getState();
      expect(state.isOpen).toBe(false);
      expect(state.modelSearchTerm).toBe("");
      expect(state.selectedModelType).toBe("All");
      expect(state.maxModelSizeGB).toBe(0);
      expect(state.filterStatus).toBe("all");
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

  describe("filter status", () => {
    test("should set filter status to downloaded", () => {
      act(() => {
        useModelManagerStore.getState().setFilterStatus("downloaded");
      });

      expect(useModelManagerStore.getState().filterStatus).toBe("downloaded");
    });

    test("should set filter status to not_downloaded", () => {
      act(() => {
        useModelManagerStore.getState().setFilterStatus("not_downloaded");
      });

      expect(useModelManagerStore.getState().filterStatus).toBe("not_downloaded");
    });

    test("should reset filter status to all", () => {
      act(() => {
        useModelManagerStore.getState().setFilterStatus("downloaded");
        useModelManagerStore.getState().setFilterStatus("all");
      });

      expect(useModelManagerStore.getState().filterStatus).toBe("all");
    });
  });

  describe("multiple state changes", () => {
    test("should handle multiple state changes", () => {
      act(() => {
        useModelManagerStore.getState().setIsOpen(true);
        useModelManagerStore.getState().setModelSearchTerm("gpt");
        useModelManagerStore.getState().setSelectedModelType("text-generation");
        useModelManagerStore.getState().setMaxModelSizeGB(4);
        useModelManagerStore.getState().setFilterStatus("downloaded");
      });

      const state = useModelManagerStore.getState();
      expect(state.isOpen).toBe(true);
      expect(state.modelSearchTerm).toBe("gpt");
      expect(state.selectedModelType).toBe("text-generation");
      expect(state.maxModelSizeGB).toBe(4);
      expect(state.filterStatus).toBe("downloaded");
    });
  });
});
