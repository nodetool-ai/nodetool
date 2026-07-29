import { TUTORIALS, getTutorial } from "../tutorialsData";
import type { Tutorial } from "../tutorialsData";

describe("tutorialsData", () => {
  describe("TUTORIALS", () => {
    it("is a non-empty array", () => {
      expect(TUTORIALS.length).toBeGreaterThan(0);
    });

    it("every entry has all required fields", () => {
      const requiredKeys: (keyof Tutorial)[] = [
        "id",
        "title",
        "tagline",
        "description",
        "level",
        "durationLabel",
        "video",
        "poster",
        "accent",
        "learn"
      ];
      for (const tutorial of TUTORIALS) {
        for (const key of requiredKeys) {
          expect(tutorial).toHaveProperty(key);
        }
      }
    });

    it("every id is unique", () => {
      const ids = TUTORIALS.map((t) => t.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("every learn array is non-empty", () => {
      for (const tutorial of TUTORIALS) {
        expect(tutorial.learn.length).toBeGreaterThan(0);
      }
    });

    it("every video path starts with /tutorials/", () => {
      for (const tutorial of TUTORIALS) {
        expect(tutorial.video).toMatch(/^\/tutorials\//);
      }
    });

    it("every poster path starts with /tutorials/", () => {
      for (const tutorial of TUTORIALS) {
        expect(tutorial.poster).toMatch(/^\/tutorials\//);
      }
    });

    it("every accent is a valid hex color", () => {
      for (const tutorial of TUTORIALS) {
        expect(tutorial.accent).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    });

    it("every durationLabel matches M:SS format", () => {
      for (const tutorial of TUTORIALS) {
        expect(tutorial.durationLabel).toMatch(/^\d+:\d{2}$/);
      }
    });
  });

  describe("getTutorial", () => {
    it("returns the matching tutorial by id", () => {
      const first = TUTORIALS[0];
      const result = getTutorial(first.id);
      expect(result).toBe(first);
    });

    it("returns the last tutorial when it exists", () => {
      const last = TUTORIALS[TUTORIALS.length - 1];
      const result = getTutorial(last.id);
      expect(result).toBe(last);
    });

    it("falls back to the first tutorial for an unknown id", () => {
      const result = getTutorial("nonexistent-tutorial-id");
      expect(result).toBe(TUTORIALS[0]);
    });

    it("falls back to the first tutorial when id is null", () => {
      const result = getTutorial(null);
      expect(result).toBe(TUTORIALS[0]);
    });

    it("falls back to the first tutorial when id is undefined", () => {
      const result = getTutorial(undefined);
      expect(result).toBe(TUTORIALS[0]);
    });
  });
});
