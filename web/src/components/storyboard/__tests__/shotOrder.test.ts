import { navigateShots } from "../shotOrder";

const IDS = ["a", "b", "c", "d"];

describe("navigateShots", () => {
  it("steps to the neighbour and stops at the ends", () => {
    expect(navigateShots(IDS, "b", "ArrowRight")).toBe("c");
    expect(navigateShots(IDS, "b", "ArrowLeft")).toBe("a");
    expect(navigateShots(IDS, "d", "ArrowRight")).toBe("d");
    expect(navigateShots(IDS, "a", "ArrowLeft")).toBe("a");
  });

  it("jumps to the first and last shot with Home and End", () => {
    expect(navigateShots(IDS, "c", "Home")).toBe("a");
    expect(navigateShots(IDS, "b", "End")).toBe("d");
  });

  it("picks the first shot when nothing is selected", () => {
    expect(navigateShots(IDS, null, "ArrowRight")).toBe("a");
    expect(navigateShots(IDS, "gone", "ArrowLeft")).toBe("a");
  });

  it("returns null on an empty board", () => {
    expect(navigateShots([], null, "End")).toBeNull();
  });
});
