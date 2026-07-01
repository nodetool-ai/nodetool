import { TUTORIALS, DEFAULT_TUTORIAL_ID, getTutorial } from "../tutorialsData";

describe("tutorialsData", () => {
  it("exports a non-empty tutorials array", () => {
    expect(TUTORIALS.length).toBeGreaterThan(0);
  });

  it("every tutorial has required fields", () => {
    for (const t of TUTORIALS) {
      expect(t.id).toBeTruthy();
      expect(t.title).toBeTruthy();
      expect(t.tagline).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(t.level).toBeTruthy();
      expect(t.durationLabel).toBeTruthy();
      expect(t.video).toBeTruthy();
      expect(t.poster).toBeTruthy();
      expect(t.accent).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(t.learn.length).toBeGreaterThan(0);
    }
  });

  it("has unique tutorial ids", () => {
    const ids = TUTORIALS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  describe("DEFAULT_TUTORIAL_ID", () => {
    it("matches the first tutorial", () => {
      expect(DEFAULT_TUTORIAL_ID).toBe(TUTORIALS[0].id);
    });
  });

  describe("getTutorial", () => {
    it("returns the tutorial matching the given id", () => {
      const tutorial = getTutorial(TUTORIALS[0].id);
      expect(tutorial.id).toBe(TUTORIALS[0].id);
    });

    it("returns the first tutorial for null", () => {
      expect(getTutorial(null).id).toBe(TUTORIALS[0].id);
    });

    it("returns the first tutorial for undefined", () => {
      expect(getTutorial(undefined).id).toBe(TUTORIALS[0].id);
    });

    it("returns the first tutorial for an unknown id", () => {
      expect(getTutorial("nonexistent-id").id).toBe(TUTORIALS[0].id);
    });

    it("finds each tutorial by its id", () => {
      for (const t of TUTORIALS) {
        expect(getTutorial(t.id)).toBe(t);
      }
    });
  });
});
