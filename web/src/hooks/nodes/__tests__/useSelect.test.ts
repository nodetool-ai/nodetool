import useSelect from "../useSelect";

describe("useSelect", () => {
  beforeEach(() => {
    useSelect.setState(useSelect.getInitialState());
  });

  afterEach(() => {
    useSelect.setState(useSelect.getInitialState());
  });

  it("initializes with null activeSelect", () => {
    expect(useSelect.getState().activeSelect).toBeNull();
  });

  it("initializes with empty searchQuery", () => {
    expect(useSelect.getState().searchQuery).toBe("");
  });

  describe("open", () => {
    it("sets activeSelect to provided selectId", () => {
      useSelect.getState().open("select-1");

      expect(useSelect.getState().activeSelect).toBe("select-1");
    });

    it("overwrites previous activeSelect", () => {
      useSelect.getState().open("select-1");
      useSelect.getState().open("select-2");

      expect(useSelect.getState().activeSelect).toBe("select-2");
    });

    it("can open the same select twice", () => {
      useSelect.getState().open("select-1");
      useSelect.getState().open("select-1");

      expect(useSelect.getState().activeSelect).toBe("select-1");
    });
  });

  describe("close", () => {
    it("sets activeSelect back to null", () => {
      useSelect.getState().open("select-1");
      useSelect.getState().close();

      expect(useSelect.getState().activeSelect).toBeNull();
    });

    it("resets searchQuery to empty string", () => {
      useSelect.getState().open("select-1");
      useSelect.getState().setSearchQuery("test query");
      useSelect.getState().close();

      expect(useSelect.getState().activeSelect).toBeNull();
      expect(useSelect.getState().searchQuery).toBe("");
    });

    it("handles closing when nothing is open", () => {
      useSelect.getState().close();

      expect(useSelect.getState().activeSelect).toBeNull();
      expect(useSelect.getState().searchQuery).toBe("");
    });
  });

  describe("setSearchQuery", () => {
    it("sets searchQuery to provided value", () => {
      useSelect.getState().setSearchQuery("my search");

      expect(useSelect.getState().searchQuery).toBe("my search");
    });

    it("updates searchQuery while keeping activeSelect", () => {
      useSelect.getState().open("select-1");
      useSelect.getState().setSearchQuery("new query");

      expect(useSelect.getState().activeSelect).toBe("select-1");
      expect(useSelect.getState().searchQuery).toBe("new query");
    });

    it("handles empty string", () => {
      useSelect.getState().setSearchQuery("test");
      useSelect.getState().setSearchQuery("");

      expect(useSelect.getState().searchQuery).toBe("");
    });

    it("handles special characters", () => {
      useSelect.getState().setSearchQuery("test@#$%");

      expect(useSelect.getState().searchQuery).toBe("test@#$%");
    });

    it("handles unicode characters", () => {
      useSelect.getState().setSearchQuery("测试查询");

      expect(useSelect.getState().searchQuery).toBe("测试查询");
    });
  });

  it("maintains state independence between calls", () => {
    useSelect.getState().open("select-1");
    expect(useSelect.getState().activeSelect).toBe("select-1");

    useSelect.getState().setSearchQuery("query1");
    expect(useSelect.getState().searchQuery).toBe("query1");

    useSelect.getState().open("select-2");
    expect(useSelect.getState().activeSelect).toBe("select-2");
    expect(useSelect.getState().searchQuery).toBe("query1");

    useSelect.getState().close();
    expect(useSelect.getState().activeSelect).toBeNull();
    expect(useSelect.getState().searchQuery).toBe("");
  });

  it("can be reset to initial state", () => {
    useSelect.getState().open("select-1");
    useSelect.getState().setSearchQuery("test");

    useSelect.setState(useSelect.getInitialState());

    expect(useSelect.getState().activeSelect).toBeNull();
    expect(useSelect.getState().searchQuery).toBe("");
  });
});
