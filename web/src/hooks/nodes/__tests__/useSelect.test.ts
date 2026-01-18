import useSelect from "../useSelect";

describe("useSelect", () => {
  beforeEach(() => {
    useSelect.setState({
      activeSelect: null,
      searchQuery: "",
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("initial state", () => {
    it("initializes with null activeSelect", () => {
      expect(useSelect.getState().activeSelect).toBeNull();
    });

    it("initializes with empty searchQuery", () => {
      expect(useSelect.getState().searchQuery).toBe("");
    });
  });

  describe("open", () => {
    it("sets activeSelect to the provided selectId", () => {
      useSelect.getState().open("select-1");

      expect(useSelect.getState().activeSelect).toBe("select-1");
    });

    it("allows opening different select instances", () => {
      useSelect.getState().open("select-1");
      expect(useSelect.getState().activeSelect).toBe("select-1");

      useSelect.getState().open("select-2");
      expect(useSelect.getState().activeSelect).toBe("select-2");
    });

    it("preserves empty searchQuery when opening", () => {
      useSelect.getState().open("select-1");

      expect(useSelect.getState().searchQuery).toBe("");
    });
  });

  describe("close", () => {
    it("sets activeSelect to null", () => {
      useSelect.getState().open("select-1");
      expect(useSelect.getState().activeSelect).toBe("select-1");

      useSelect.getState().close();

      expect(useSelect.getState().activeSelect).toBeNull();
    });

    it("clears searchQuery when closing", () => {
      useSelect.getState().open("select-1");
      useSelect.getState().setSearchQuery("test query");

      useSelect.getState().close();

      expect(useSelect.getState().searchQuery).toBe("");
    });

    it("does nothing when already closed", () => {
      useSelect.getState().close();

      expect(useSelect.getState().activeSelect).toBeNull();
      expect(useSelect.getState().searchQuery).toBe("");
    });
  });

  describe("setSearchQuery", () => {
    it("sets searchQuery to the provided value", () => {
      useSelect.getState().setSearchQuery("test query");

      expect(useSelect.getState().searchQuery).toBe("test query");
    });

    it("allows updating searchQuery", () => {
      useSelect.getState().setSearchQuery("first");
      expect(useSelect.getState().searchQuery).toBe("first");

      useSelect.getState().setSearchQuery("second");
      expect(useSelect.getState().searchQuery).toBe("second");
    });

    it("allows setting empty searchQuery", () => {
      useSelect.getState().setSearchQuery("test");
      useSelect.getState().setSearchQuery("");

      expect(useSelect.getState().searchQuery).toBe("");
    });

    it("preserves activeSelect when updating searchQuery", () => {
      useSelect.getState().open("select-1");
      useSelect.getState().setSearchQuery("test");

      expect(useSelect.getState().activeSelect).toBe("select-1");
    });
  });

  describe("workflow integration", () => {
    it("can open select after closing", () => {
      useSelect.getState().open("select-1");
      useSelect.getState().close();
      useSelect.getState().open("select-2");

      expect(useSelect.getState().activeSelect).toBe("select-2");
    });

    it("handles rapid state changes", () => {
      useSelect.getState().open("select-1");
      useSelect.getState().setSearchQuery("query1");
      useSelect.getState().close();
      useSelect.getState().open("select-2");
      useSelect.getState().setSearchQuery("query2");

      expect(useSelect.getState().activeSelect).toBe("select-2");
      expect(useSelect.getState().searchQuery).toBe("query2");
    });

    it("handles special characters in selectId", () => {
      useSelect.getState().open("select-with-special-chars_123");

      expect(useSelect.getState().activeSelect).toBe("select-with-special-chars_123");
    });
  });
});
