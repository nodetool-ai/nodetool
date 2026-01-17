import { act } from "@testing-library/react";
import { useModelManagerStore, ModelFilterStatus } from "../ModelManagerStore";

describe("ModelManagerStore", () => {
  beforeEach(() => {
    useModelManagerStore.setState(useModelManagerStore.getInitialState());
  });

  it("initializes with correct default state", () => {
    expect(useModelManagerStore.getState().isOpen).toBe(false);
    expect(useModelManagerStore.getState().modelSearchTerm).toBe("");
    expect(useModelManagerStore.getState().selectedModelType).toBe("All");
    expect(useModelManagerStore.getState().maxModelSizeGB).toBe(0);
    expect(useModelManagerStore.getState().filterStatus).toBe("all");
  });

  describe("setIsOpen", () => {
    it("sets isOpen to true", () => {
      act(() => {
        useModelManagerStore.getState().setIsOpen(true);
      });
      expect(useModelManagerStore.getState().isOpen).toBe(true);
    });

    it("sets isOpen to false", () => {
      act(() => {
        useModelManagerStore.getState().setIsOpen(true);
      });
      act(() => {
        useModelManagerStore.getState().setIsOpen(false);
      });
      expect(useModelManagerStore.getState().isOpen).toBe(false);
    });
  });

  describe("setModelSearchTerm", () => {
    it("sets model search term", () => {
      act(() => {
        useModelManagerStore.getState().setModelSearchTerm("test model");
      });
      expect(useModelManagerStore.getState().modelSearchTerm).toBe("test model");
    });

    it("clears search term with empty string", () => {
      act(() => {
        useModelManagerStore.getState().setModelSearchTerm("some search");
      });
      act(() => {
        useModelManagerStore.getState().setModelSearchTerm("");
      });
      expect(useModelManagerStore.getState().modelSearchTerm).toBe("");
    });

    it("updates search term multiple times", () => {
      act(() => {
        useModelManagerStore.getState().setModelSearchTerm("first");
      });
      act(() => {
        useModelManagerStore.getState().setModelSearchTerm("second");
      });
      act(() => {
        useModelManagerStore.getState().setModelSearchTerm("third");
      });
      expect(useModelManagerStore.getState().modelSearchTerm).toBe("third");
    });
  });

  describe("setSelectedModelType", () => {
    it("sets selected model type", () => {
      act(() => {
        useModelManagerStore.getState().setSelectedModelType("llm");
      });
      expect(useModelManagerStore.getState().selectedModelType).toBe("llm");
    });

    it("resets to All", () => {
      act(() => {
        useModelManagerStore.getState().setSelectedModelType("vision");
      });
      act(() => {
        useModelManagerStore.getState().setSelectedModelType("All");
      });
      expect(useModelManagerStore.getState().selectedModelType).toBe("All");
    });
  });

  describe("setMaxModelSizeGB", () => {
    it("sets max model size in GB", () => {
      act(() => {
        useModelManagerStore.getState().setMaxModelSizeGB(4);
      });
      expect(useModelManagerStore.getState().maxModelSizeGB).toBe(4);
    });

    it("sets no limit when 0", () => {
      act(() => {
        useModelManagerStore.getState().setMaxModelSizeGB(8);
      });
      act(() => {
        useModelManagerStore.getState().setMaxModelSizeGB(0);
      });
      expect(useModelManagerStore.getState().maxModelSizeGB).toBe(0);
    });

    it("handles various size values", () => {
      const sizes = [1, 2, 4, 8, 16, 32];
      sizes.forEach((size) => {
        act(() => {
          useModelManagerStore.getState().setMaxModelSizeGB(size);
        });
        expect(useModelManagerStore.getState().maxModelSizeGB).toBe(size);
      });
    });
  });

  describe("setFilterStatus", () => {
    it("sets filter status to downloaded", () => {
      act(() => {
        useModelManagerStore.getState().setFilterStatus("downloaded");
      });
      expect(useModelManagerStore.getState().filterStatus).toBe("downloaded");
    });

    it("sets filter status to not_downloaded", () => {
      act(() => {
        useModelManagerStore.getState().setFilterStatus("not_downloaded");
      });
      expect(useModelManagerStore.getState().filterStatus).toBe("not_downloaded");
    });

    it("sets filter status to all", () => {
      act(() => {
        useModelManagerStore.getState().setFilterStatus("downloaded");
      });
      act(() => {
        useModelManagerStore.getState().setFilterStatus("all");
      });
      expect(useModelManagerStore.getState().filterStatus).toBe("all");
    });

    it("handles all filter status values", () => {
      const statuses: ModelFilterStatus[] = ["all", "downloaded", "not_downloaded"];
      statuses.forEach((status) => {
        act(() => {
          useModelManagerStore.getState().setFilterStatus(status);
        });
        expect(useModelManagerStore.getState().filterStatus).toBe(status);
      });
    });
  });
});
