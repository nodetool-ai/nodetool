import { createPerfDataset } from "../perfUtils";

describe("createPerfDataset", () => {
  it("creates the requested number of elements", () => {
    const data = createPerfDataset(1000, 800, 600);
    expect(data.elements).toHaveLength(1000);
  });

  it("sets canvas dimensions", () => {
    const data = createPerfDataset(5000, 1920, 1080);
    expect(data.width).toBe(1920);
    expect(data.height).toBe(1080);
  });
});
